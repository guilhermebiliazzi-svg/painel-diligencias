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
import { getSessaoPerfil, corretorDaPessoa } from '@/lib/perfil';
import { podeTela } from '@/lib/acesso';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { lerPedido, linkDoEstudo } from '@/lib/estudo-arquivo';
import {
  faltandoParaGerar, ficha, lerConcorrentes, montarPayload, nomeArquivo, proprietario, vendasItbi,
  type Anuncio, type TipoFicha, type Vals,
} from '@/lib/estudo-gerar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/painel-estudo';

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

// 15/11: todo estudo vira lead de captação do corretor (V1 realizada + V2 agendada). A função do banco acha ou
// cria o lead; com simular, só confere (prévia), sem gravar. Conflito (proprietário com outro corretor) bloqueia.
type Captacao = { ok: boolean; erro?: string; lead_id?: string; etapa_id?: string; remarcou?: boolean; novo?: boolean };
async function captacao(email: string, tipo: TipoFicha, vals: Vals, simular: boolean): Promise<Captacao> {
  const cor = await corretorDaPessoa(email);
  if (!cor?.phone) return { ok: false, erro: 'Não achei seu cadastro de corretor (telefone) para registrar o lead do proprietário. Fale com o Guilherme.' };
  const pr = proprietario(tipo, vals);
  const { g } = ficha(tipo, vals);
  const { data, error } = await supabaseAdmin().rpc('sdr_captacao_estudo', {
    p_corretor: cor.phone, p_nome: pr.nome, p_tel: pr.tel, p_endereco: g('endereco'), p_tipo: tipo, p_v2: pr.v2,
    p_origem: 'painel', p_simular: simular,
  });
  if (error) { console.error('[estudo][gerar] captacao', error); return { ok: false, erro: 'Não consegui registrar o lead do proprietário. Tente de novo.' }; }
  return (data || { ok: false, erro: 'Não consegui registrar o lead do proprietário.' }) as Captacao;
}

const chaves = (x: unknown) => (Array.isArray(x) ? x.slice(0, 60).map((s) => String(s).slice(0, 80)) : []);

function lerAnuncios(x: unknown): Anuncio[] {
  if (!Array.isArray(x)) return [];
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return x.slice(0, 15).flatMap((a) => {
    const o = (a || {}) as Record<string, unknown>;
    const link = String(o.link || '').slice(0, 500);
    const doSite = /^https:\/\/(www\.)?villejardins\.com\.br\/imovel\//i.test(link);
    // villejardins: anúncio /imovel/; outros portais: qualquer https (só apartamento/sala chegam aqui)
    if (!(doSite || /^https:\/\/[^\s]+$/i.test(link)) || !num(o.preco)) return [];
    return [{
      link, codigo: String(o.codigo || '').slice(0, 20), titulo: String(o.titulo || '').slice(0, 200),
      preco: num(o.preco)!, area: num(o.area), quartos: num(o.quartos), suites: num(o.suites), vagas: num(o.vagas),
      condominio_mensal: num(o.condominio_mensal), bairro: String(o.bairro || '').slice(0, 80),
      origem: doSite ? 'site' as const : 'portal' as const,
      condominio_nome: String(o.condominio_nome || '').slice(0, 120), address: String(o.address || '').slice(0, 200),
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
    const cap = await captacao(s.email, tipo, vals, true);
    if (!cap.ok) return erro(cap.erro || 'Não consegui conferir o proprietário.', 409);
    const area = tipo === 'casa' ? n('area_construida') : n('area_util');
    const [itbi, busca] = await Promise.all([
      tipo === 'casa' ? Promise.resolve(null) : vendasItbi(g('endereco'), n('area_iptu')).catch((e) => {
        console.error('[estudo][gerar] ITBI', e);
        return null;
      }),
      g('concorrentes')
        ? lerConcorrentes(g('concorrentes'), area, tipo === 'casa' ? 0.3 : 0.15, tipo !== 'casa',
            { predio_curto: tipo === 'sala' ? g('edificio') : g('condominio'), bairro: g('bairro') })
        : Promise.resolve(null),
    ]);
    if (tipo !== 'casa' && itbi && !itbi.length) {
      return erro('Não há venda registrada no ITBI para esse prédio. Confira rua e número no endereço (o estudo de apartamento precisa das vendas do próprio prédio).', 404);
    }
    return NextResponse.json({ ok: true, itbi, busca });
  }

  if (body.acao === 'gerar') {
    const anuncios = lerAnuncios(body.anuncios).filter((a) => tipo !== 'casa' || a.origem === 'site'); // casa: só o site
    const esc = { itbi_manter: chaves(body.itbi_manter), itbi_excluir: chaves(body.itbi_excluir), anuncios };
    if (tipo !== 'casa' && !esc.itbi_manter.length) return erro('Deixe pelo menos uma venda do ITBI marcada.');
    const cap = await captacao(s.email, tipo, vals, false);
    if (!cap.ok || !cap.lead_id) return erro(cap.erro || 'Não consegui registrar o lead do proprietário.', 409);
    const payload = {
      ...montarPayload(tipo, vals, esc), nome_arquivo: nomeArquivo(tipo, g('endereco')),
      captacao: { lead_id: cap.lead_id, etapa_id: cap.etapa_id, remarcou: !!cap.remarcou, novo: !!cap.novo },
    };
    const sb = supabaseAdmin();
    const { data, error } = await sb.from('painel_estudo_pedidos').insert({ email: s.email, payload, lead_id: cap.lead_id }).select('id').single();
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
    return NextResponse.json({ ok: true, id: data.id, lead_novo: !!cap.novo });
  }

  return erro('Ação desconhecida.');
}

export async function GET(req: Request) {
  const s = await sessao();
  if ('falha' in s) return s.falha;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erro('Pedido inválido.');

  const p = await lerPedido(id);
  if (!p || (p.email !== s.email && !s.admin)) return erro('Pedido não encontrado.', 404);
  if (p.status === 'erro') return NextResponse.json({ status: 'erro', mensagem: p.mensagem || 'O estudo não foi gerado.' });

  const link = await linkDoEstudo(p);
  if (link && 'erro' in link) return erro(link.erro, 500);
  if (link) return NextResponse.json({ status: 'pronto', url: link.url, nome: link.nome });

  const minutos = (Date.now() - new Date(p.criado_em).getTime()) / 60000;
  if (minutos > 8) return NextResponse.json({ status: 'erro', mensagem: 'O estudo demorou demais para ficar pronto. Tente de novo.' });
  return NextResponse.json({ status: p.status === 'novo' ? 'na fila' : 'gerando' });
}
