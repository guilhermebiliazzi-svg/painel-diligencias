// Botão "Gerar estudo" da ficha de captação (/estudo).
//
// POST { acao: 'previa', tipo, vals }  -> vendas do ITBI do prédio (apartamento/sala) e anúncios da
//                                         busca do villejardins.com.br colada em "Concorrentes"
// POST { acao: 'gerar', tipo, vals, itbi_manter, itbi_excluir, anuncios }
//                                      -> grava o pedido e chama o n8n ("Painel - Estudo de mercado");
//                                         devolve { id }
// GET  ?id=<pedido>                    -> situação do pedido; pronto = link para baixar o PowerPoint
//
// O n8n só recebe o id: o pedido (com o e-mail de quem pediu) fica em painel_estudo_pedidos, que só
// o servidor lê (RLS sem política). O n8n aceita cada pedido uma vez e só nos 10 minutos seguintes.
import { NextResponse } from 'next/server';
import { getSessaoPerfil } from '@/lib/perfil';
import { podeTela } from '@/lib/acesso';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  faltandoParaGerar, ficha, lerBuscaSite, montarPayload, nomeArquivo, vendasItbi,
  type Anuncio, type TipoFicha, type Vals,
} from '@/lib/estudo-gerar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/painel-estudo';
const BUCKET = 'documentos';
const PASTA = 'estudos-painel';
const VALIDADE_LINK = 24 * 3600;

const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status });
const TIPOS: TipoFicha[] = ['ap', 'casa', 'sala'];

async function sessao() {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return { falha: erro('Faça login para continuar.', 401) };
  if (!podeTela(perfil, 'estudo')) return { falha: erro('Sua conta não tem acesso ao estudo de mercado.', 403) };
  return { email, admin: !!perfil?.is_admin };
}

/** Só o que é da ficha do tipo escolhido, com tamanho limitado. */
function lerVals(tipo: TipoFicha, bruto: unknown): Vals {
  const out: Vals = {};
  if (!bruto || typeof bruto !== 'object') return out;
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!k.startsWith(tipo + '.') || k.length > 60) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 2000);
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => String(x).slice(0, 80));
  }
  return out;
}

const chaves = (x: unknown) => (Array.isArray(x) ? x.slice(0, 60).map((s) => String(s).slice(0, 80)) : []);

function lerAnuncios(x: unknown): Anuncio[] {
  if (!Array.isArray(x)) return [];
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return x.slice(0, 15).flatMap((a) => {
    const o = (a || {}) as Record<string, unknown>;
    const link = String(o.link || '');
    if (!/^https:\/\/(www\.)?villejardins\.com\.br\/imovel\//i.test(link) || !num(o.preco)) return [];
    return [{
      link, codigo: String(o.codigo || '').slice(0, 20), titulo: String(o.titulo || '').slice(0, 200),
      preco: num(o.preco)!, area: num(o.area), quartos: num(o.quartos), suites: num(o.suites), vagas: num(o.vagas),
      condominio_mensal: num(o.condominio_mensal), bairro: String(o.bairro || '').slice(0, 80),
    }];
  });
}

export async function POST(req: Request) {
  const s = await sessao();
  if ('falha' in s) return s.falha;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erro('Corpo inválido.');
  }
  const tipo = String(body.tipo || '') as TipoFicha;
  if (!TIPOS.includes(tipo)) return erro('Tipo de imóvel inválido.');
  const vals = lerVals(tipo, body.vals);
  const falta = faltandoParaGerar(tipo, vals);
  if (falta.length) return erro('Para gerar pelo painel, falta: ' + falta.join('; ') + '.');
  const { g, n } = ficha(tipo, vals);

  if (body.acao === 'previa') {
    const area = tipo === 'casa' ? n('area_construida') : n('area_util');
    const [itbi, busca] = await Promise.all([
      tipo === 'casa' ? Promise.resolve(null) : vendasItbi(g('endereco'), n('area_iptu')).catch((e) => {
        console.error('[estudo][gerar] ITBI', e);
        return null;
      }),
      g('concorrentes') ? lerBuscaSite(g('concorrentes'), area, tipo === 'casa' ? 0.3 : 0.15) : Promise.resolve(null),
    ]);
    if (tipo !== 'casa' && itbi && !itbi.length) {
      return erro('Não há venda registrada no ITBI para esse prédio. Confira rua e número no endereço (o estudo de apartamento precisa das vendas do próprio prédio).', 404);
    }
    return NextResponse.json({ ok: true, itbi, busca });
  }

  if (body.acao === 'gerar') {
    const esc = { itbi_manter: chaves(body.itbi_manter), itbi_excluir: chaves(body.itbi_excluir), anuncios: lerAnuncios(body.anuncios) };
    if (tipo !== 'casa' && !esc.itbi_manter.length) return erro('Deixe pelo menos uma venda do ITBI marcada.');
    const payload = { ...montarPayload(tipo, vals, esc), nome_arquivo: nomeArquivo(tipo, g('endereco')) };
    const sb = supabaseAdmin();
    const { data, error } = await sb.from('painel_estudo_pedidos').insert({ email: s.email, payload }).select('id').single();
    if (error || !data) {
      console.error('[estudo][gerar] pedido', error);
      return erro('Não consegui registrar o pedido. Tente de novo.', 500);
    }
    try {
      const r = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    } catch (e) {
      console.error('[estudo][gerar] n8n', e);
      await sb.from('painel_estudo_pedidos').update({ status: 'erro', mensagem: 'O gerador de estudos não respondeu.' }).eq('id', data.id);
      return erro('O gerador de estudos não respondeu. Tente de novo em alguns minutos.', 502);
    }
    console.log(`[estudo][gerar] ${s.email} pediu ${tipo} ${g('endereco')} (${data.id})`);
    return NextResponse.json({ ok: true, id: data.id });
  }

  return erro('Ação desconhecida.');
}

export async function GET(req: Request) {
  const s = await sessao();
  if ('falha' in s) return s.falha;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erro('Pedido inválido.');

  const sb = supabaseAdmin();
  const { data: p } = await sb
    .from('painel_estudo_pedidos')
    .select('id, email, status, mensagem, arquivo_path, criado_em, nome_arquivo:payload->>nome_arquivo')
    .eq('id', id)
    .maybeSingle();
  if (!p || (p.email !== s.email && !s.admin)) return erro('Pedido não encontrado.', 404);
  const nome = String((p as Record<string, unknown>).nome_arquivo || 'Estudo_Mercado.pptx');

  if (p.status === 'erro') return NextResponse.json({ status: 'erro', mensagem: p.mensagem || 'O estudo não foi gerado.' });

  let path = p.arquivo_path as string | null;
  if (!path && p.status === 'pronto') {
    // primeiro acesso depois de pronto: o arquivo sai da tabela e vai para o Storage
    const { data: b } = await sb.from('painel_estudo_pedidos').select('arquivo_b64').eq('id', id).single();
    if (b?.arquivo_b64) {
      path = `${PASTA}/${id}.pptx`;
      const up = await sb.storage.from(BUCKET).upload(path, Buffer.from(b.arquivo_b64, 'base64'), {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      });
      if (up.error) {
        console.error('[estudo][gerar] storage', up.error);
        return erro('O estudo ficou pronto, mas não consegui guardar o arquivo. Tente de novo.', 500);
      }
      await sb.from('painel_estudo_pedidos').update({ arquivo_path: path, arquivo_b64: null }).eq('id', id);
    }
  }
  if (path) {
    const { data: link } = await sb.storage.from(BUCKET).createSignedUrl(path, VALIDADE_LINK, { download: nome });
    if (link?.signedUrl) return NextResponse.json({ status: 'pronto', url: link.signedUrl, nome });
  }

  const minutos = (Date.now() - new Date(p.criado_em as string).getTime()) / 60000;
  if (minutos > 8) return NextResponse.json({ status: 'erro', mensagem: 'O estudo demorou demais para ficar pronto. Tente de novo.' });
  return NextResponse.json({ status: p.status === 'novo' ? 'na fila' : 'gerando' });
}
