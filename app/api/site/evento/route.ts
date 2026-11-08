// 08/11: registro próprio de navegação do www.villejardins.com.br (painel → Site).
// O site manda cada página vista, o tempo nela, e cada ação (WhatsApp, formulário, busca,
// telefone, link para fora) por
// navigator.sendBeacon. Nada identifica a pessoa: o visitante é um id aleatório
// guardado no navegador. Aqui só se aceita o domínio do site, classifica-se a
// origem (Google orgânico, Google Ads, Instagram, direto...) e grava-se em site_eventos.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const TIPOS = new Set(['pagina', 'whatsapp', 'formulario', 'busca', 'telefone', 'compartilhar', 'tempo', 'link']);
const ROBO = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp\/|python|curl|wget/i;

function origemPermitida(o: string | null) {
  if (!o) return false;
  try {
    const h = new URL(o).hostname;
    return h === 'villejardins.com.br' || h.endsWith('.villejardins.com.br') || h === 'localhost';
  } catch {
    return false;
  }
}

function cors(o: string | null) {
  return {
    'Access-Control-Allow-Origin': origemPermitida(o) ? (o as string) : 'https://www.villejardins.com.br',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
}

const txt = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function hostDe(u: string | null) {
  if (!u) return '';
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// Origem da sessão. Pago = veio de anúncio (gclid/gbraid/wbraid ou utm de mídia paga).
function classificar(ref: string | null, u: Record<string, string | null>, clique: string | null) {
  const src = (u.source || '').toLowerCase();
  const med = (u.medium || '').toLowerCase();
  const h = hostDe(ref);
  const pagoUtm = /cpc|ppc|paid|pago|ads|display|cpm/.test(med);
  if (clique === 'gclid' || clique === 'gbraid' || clique === 'wbraid' || (pagoUtm && /google|adwords/.test(src))) {
    return { origem: 'Google Ads', detalhe: 'Google Ads', pago: true };
  }
  // clique em anúncio de Display/Demand Gen que chegou sem gclid (o anúncio abre por esses domínios)
  if (/googlesyndication\.com|doubleclick\.net|googleadservices\.com/.test(h)) return { origem: 'Google Ads', detalhe: 'Google Ads (rede de display)', pago: true };
  if (clique === 'fbclid' && pagoUtm) return { origem: 'Meta Ads', detalhe: 'Meta Ads', pago: true };
  if (pagoUtm) {
    const n = src || h || 'anúncio';
    return { origem: 'Outros anúncios', detalhe: 'Anúncio: ' + n, pago: true };
  }
  if (src) {
    if (/instagram|facebook|meta|fb/.test(src)) return { origem: 'Redes sociais', detalhe: src.includes('insta') ? 'Instagram' : 'Facebook', pago: false };
    if (/whats|^wa$/.test(src)) return { origem: 'WhatsApp', detalhe: 'WhatsApp', pago: false };
    if (/mail|email|newsletter/.test(src + med)) return { origem: 'E-mail', detalhe: 'E-mail', pago: false };
    return { origem: 'Campanhas (utm)', detalhe: 'utm: ' + src, pago: false };
  }
  if (!h) return { origem: 'Direto', detalhe: 'Direto (digitou ou salvo)', pago: false };
  if (/(^|\.)google\./.test(h)) return { origem: 'Busca orgânica', detalhe: 'Google (orgânico)', pago: false };
  if (/bing\.|yahoo\.|duckduckgo\.|ecosia\.|yandex\./.test(h)) return { origem: 'Busca orgânica', detalhe: h.split('.')[0].replace(/^\w/, (c) => c.toUpperCase()) + ' (orgânico)', pago: false };
  if (/chatgpt|openai|perplexity|gemini|claude\.ai|copilot/.test(h)) return { origem: 'Assistentes de IA', detalhe: h, pago: false };
  if (/instagram|facebook|fb\.|t\.co|twitter|x\.com|linkedin|tiktok|youtube/.test(h)) {
    const d = /instagram/.test(h) ? 'Instagram' : /facebook|fb\./.test(h) ? 'Facebook' : /linkedin/.test(h) ? 'LinkedIn' : /youtube/.test(h) ? 'YouTube' : /tiktok/.test(h) ? 'TikTok' : 'X/Twitter';
    return { origem: 'Redes sociais', detalhe: d, pago: false };
  }
  if (/whatsapp|wa\.me/.test(h)) return { origem: 'WhatsApp', detalhe: 'WhatsApp', pago: false };
  if (/remax\.com\.br|usesquare|usenonstop/.test(h)) return { origem: 'Sites REMAX', detalhe: h, pago: false };
  if (/villejardins\.com\.br$/.test(h)) return { origem: 'Direto', detalhe: 'Direto (navegação interna)', pago: false };
  return { origem: 'Outros sites', detalhe: h, pago: false };
}

// Só guarda do "extra" o que a tela usa: id da visualização, segundos e % rolada.
function extraLimpo(e: unknown) {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  if (typeof x.pv === 'string' && /^[\w-]{4,20}$/.test(x.pv)) out.pv = x.pv;
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
  const seg = n(x.seg, 3600), rol = n(x.rolagem, 100);
  if (seg != null) out.seg = seg;
  if (rol != null) out.rolagem = rol;
  return Object.keys(out).length ? out : null;
}

function dispositivo(ua: string) {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return 'Tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'Celular';
  return 'Computador';
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) });
}

export async function POST(req: Request) {
  const o = req.headers.get('origin');
  const h = cors(o);
  if (!origemPermitida(o)) return new NextResponse(null, { status: 403, headers: h });
  const ua = req.headers.get('user-agent') || '';
  if (!ua || ROBO.test(ua)) return new NextResponse(null, { status: 204, headers: h });

  let b: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 8000) return new NextResponse(null, { status: 413, headers: h });
    b = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400, headers: h });
  }
  const tipo = txt(b.t, 20);
  const visitante = txt(b.v, 40);
  const sessao = txt(b.s, 40);
  if (!tipo || !TIPOS.has(tipo) || !visitante || !sessao || !/^[\w-]{8,40}$/.test(visitante) || !/^[\w-]{8,40}$/.test(sessao)) {
    return new NextResponse(null, { status: 400, headers: h });
  }
  const u = (b.u && typeof b.u === 'object' ? b.u : {}) as Record<string, unknown>;
  const utm = { source: txt(u.source, 100), medium: txt(u.medium, 100), campaign: txt(u.campaign, 150), term: txt(u.term, 150) };
  const referrer = txt(b.r, 500);
  const clique = txt(b.c, 10);
  const cls = classificar(referrer, utm, clique);

  const { error } = await supabaseAdmin().from('site_eventos').insert({
    visitante,
    sessao,
    tipo,
    caminho: txt(b.p, 300),
    titulo: txt(b.ti, 200),
    origem: cls.origem,
    origem_detalhe: cls.detalhe,
    referrer,
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_term: utm.term,
    pago: cls.pago,
    dispositivo: dispositivo(ua),
    imovel_id: txt(b.i, 40),
    bairro: txt(b.b, 80),
    valor: txt(b.x, 200),
    extra: extraLimpo(b.e),
  });
  if (error) return new NextResponse(null, { status: 500, headers: h });
  return new NextResponse(null, { status: 204, headers: h });
}
