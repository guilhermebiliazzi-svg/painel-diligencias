'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Cobrança com split: dados da venda (para pré-preencher) e emissão.
// A emissão continua no n8n (WF-A4, "cobranca-avulsa-emitir"), que fala com o
// Asaas e grava em asaas_cobrancas — esta ação só leva o pedido até lá, agora
// com a diligência (venda) a que a cobrança pertence.
import { pool } from '@/lib/db';
import { getSessaoPerfil, podeTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const CANCELADO = ['CANCELADA', 'CANCELLED', 'DELETED', 'REFUNDED', 'REFUND_REQUESTED'];

const N8N_EMITIR =
  process.env.N8N_COBRANCA_SPLIT_EMITIR_URL || 'https://villejds.app.n8n.cloud/webhook/cobranca-avulsa-emitir';

const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const txt = (v: unknown) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function obj(v: unknown): Record<string, any> {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) || {};
    } catch {
      return {};
    }
  }
  return typeof v === 'object' ? (v as Record<string, any>) : {};
}

async function garantir() {
  const { perfil } = await getSessaoPerfil();
  if (!perfil || !perfil.ativo || !podeTela(perfil, 'cobrancas')) throw new Error('Sem acesso à cobrança com split.');
}

export type DadosVenda = {
  ok: boolean;
  erro?: string;
  avisos: string[];
  pagador: { nome: string; doc: string; fone: string; lado: string } | null;
  valor: number | null;
  descricao: string;
  splits: { walletId: string; valor: number; nome: string }[];
  // quem recebe por fora (não entra nesta cobrança) — só para conferência
  fora: { nome: string; valor: number }[];
  cobrancas: number;
};

// Mesma regra do WF-A2 (cobrança da diligência): só quem tem destino "asaas"
// entra no split; a Ville fica com o restante; quem recebe "por fora" não entra
// no valor cobrado.
export async function dadosDaVenda(diligenciaId: string): Promise<DadosVenda> {
  const vazio: DadosVenda = { ok: false, avisos: [], pagador: null, valor: null, descricao: '', splits: [], fora: [], cobrancas: 0 };
  try {
    await garantir();
  } catch (e) {
    return { ...vazio, erro: (e as Error).message };
  }
  if (!UUID.test(diligenciaId)) return { ...vazio, erro: 'Venda inválida.' };

  // diligencias pela role do painel; as tabelas do Asaas pela service role
  const sb = supabaseAdmin();
  const [r, parts, cob] = await Promise.all([
    pool.query('select id, endereco, dados_completos from diligencias where id = $1', [diligenciaId]),
    sb.from('asaas_participantes').select('nome,cpf_cnpj,asaas_wallet_id').not('asaas_wallet_id', 'is', null),
    sb.from('asaas_cobrancas').select('status').eq('diligencia_id', diligenciaId),
  ]);
  if (!r.rows.length) return { ...vazio, erro: 'Venda não encontrada.' };
  const ativas = (cob.data ?? []).filter((c) => !CANCELADO.includes(String(c.status ?? ''))).length;

  const dc = obj(r.rows[0].dados_completos);
  const com = obj(obj(dc.negocio).comissao);
  const avisos: string[] = [];

  // pagador: primeiro do lado que paga (padrão: comprador)
  const lado = txt(com.pagador).toLowerCase() === 'vendedor' ? 'vendedor' : 'comprador';
  const base = lado === 'vendedor' ? 'vendedores' : 'compradores';
  const pf = Array.isArray(dc[base + 'PF']) ? dc[base + 'PF'] : [];
  const pj = Array.isArray(dc[base + 'PJ']) ? dc[base + 'PJ'] : [];
  let pagador: DadosVenda['pagador'] = null;
  if (pf.length && txt(pf[0]?.pf_nome))
    pagador = { nome: txt(pf[0].pf_nome).toUpperCase(), doc: dig(pf[0].pf_cpf), fone: dig(pf[0].pf_telefone), lado };
  else if (pj.length && txt(pj[0]?.pj_nome))
    pagador = { nome: txt(pj[0].pj_nome).toUpperCase(), doc: dig(pj[0].pj_cnpj), fone: '', lado };
  if (!txt(com.pagador)) avisos.push('A ficha não diz quem paga a comissão — usei o comprador.');
  if (!pagador) avisos.push(`Não achei o ${lado} no cadastro da diligência — preencha o pagador.`);

  const byDoc: Record<string, { nome: string; wallet: string }> = {};
  const byNome: Record<string, { nome: string; wallet: string }> = {};
  const norm = (v: unknown) =>
    txt(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
  for (const p of parts.data ?? []) {
    const it = { nome: String(p.nome ?? ''), wallet: String(p.asaas_wallet_id ?? '') };
    if (p.cpf_cnpj) byDoc[dig(p.cpf_cnpj)] = it;
    if (p.nome) byNome[norm(p.nome)] = it;
  }

  const lista = Array.isArray(com.split) ? com.split : [];
  let somaVille = 0;
  const splits: DadosVenda['splits'] = [];
  const fora: DadosVenda['fora'] = [];
  for (const s of lista) {
    const v = r2(Number(s?.valor) || 0);
    const dest = txt(s?.destino);
    if (dest === 'ville') somaVille += v;
    else if (dest === 'asaas') {
      let p = byDoc[dig(s?.documento)];
      if (!p && byNome[norm(s?.credor)]) {
        p = byNome[norm(s?.credor)];
        avisos.push(`${txt(s?.credor)}: o CPF/CNPJ da ficha não bate com o da subconta — achei pelo nome, confira.`);
      }
      const w = txt(s?.walletid) || p?.wallet || '';
      if (!w)
        avisos.push(`${txt(s?.credor) || 'Credor'} está como "Asaas" na ficha mas não achei a subconta dele — não entrou no split nem no valor.`);
      else if (v > 0) splits.push({ walletId: w, valor: v, nome: p?.nome || txt(s?.credor) });
    } else if (dest === 'fora_direto' || dest === 'fora_split_proprio') fora.push({ nome: txt(s?.credor), valor: v });
    else if (v > 0) avisos.push(`${txt(s?.credor) || 'Credor'} está sem destino na ficha — não entrou na cobrança.`);
  }
  let valor = r2(somaVille + splits.reduce((a, s) => a + s.valor, 0));
  const total = r2(Number(com.total) || 0);
  if (!lista.length) {
    // sem split na ficha: sugere o total da comissão, o split fica à mão
    valor = total;
    avisos.push(
      total
        ? 'A ficha "Dados do negócio" tem o total da comissão mas não o split — confira o valor e preencha o split à mão.'
        : 'A ficha "Dados do negócio" ainda não tem a comissão — preencha valor e split à mão.'
    );
  }

  const end = txt(r.rows[0].endereco).replace(/\s*-\s*SÃO PAULO\/SP$/i, '');
  return {
    ok: true,
    avisos,
    pagador,
    valor: valor > 0 ? valor : null,
    descricao: `Comissão de corretagem — ${end}`,
    splits,
    fora,
    cobrancas: ativas,
  };
}

export type PedidoEmissao = {
  diligencia_id: string | null;
  pagador_nome: string;
  pagador_doc: string;
  pagador_email: string;
  pagador_fone: string;
  valor: number;
  vencimento: string;
  descricao: string;
  billing_type: 'BOLETO' | 'PIX';
  splits: { walletId: string; fixedValue: number; nome: string }[];
};

export type RespostaEmissao = { ok: boolean; link?: string; cobranca_id?: string; aviso?: string; mensagem?: string; detalhes?: string };

export async function emitirCobranca(p: PedidoEmissao): Promise<RespostaEmissao> {
  try {
    await garantir();
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
  const corpo = {
    ...p,
    diligencia_id: p.diligencia_id && UUID.test(p.diligencia_id) ? p.diligencia_id : null,
    splits: (p.splits || []).filter((s) => s.walletId && Number(s.fixedValue) > 0),
  };
  try {
    const res = await fetch(N8N_EMITIR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      cache: 'no-store',
    });
    const t = await res.text();
    let d: any;
    try {
      d = JSON.parse(t);
    } catch {
      return { ok: false, mensagem: `Resposta inesperada do n8n (HTTP ${res.status}).` };
    }
    if (Array.isArray(d)) d = d[0];
    return {
      ok: !!d?.ok,
      link: d?.link,
      cobranca_id: d?.cobranca_id,
      aviso: d?.aviso,
      mensagem: d?.mensagem,
      detalhes: d?.detalhes,
    };
  } catch (e) {
    return { ok: false, mensagem: 'Não consegui falar com o n8n: ' + String(e) };
  }
}

const N8N_ALTERAR_VENCIMENTO =
  process.env.N8N_COBRANCA_ALTERAR_VENCIMENTO_URL || 'https://villejds.app.n8n.cloud/webhook/cobranca-alterar-vencimento';

// Muda o vencimento de uma cobrança pendente/vencida no Asaas (WF-A5) e grava
// a data nova no painel. Mesmo boleto/link; o Asaas só troca a data.
export async function alterarVencimento(
  paymentId: string,
  novaData: string
): Promise<{ ok: boolean; mensagem?: string; vencimento?: string; aviso?: string }> {
  try {
    await garantir();
  } catch (e) {
    return { ok: false, mensagem: (e as Error).message };
  }
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return { ok: false, mensagem: 'Cobrança inválida.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, mensagem: 'Informe a nova data.' };
  try {
    const res = await fetch(N8N_ALTERAR_VENCIMENTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: paymentId, nova_data: novaData }),
      cache: 'no-store',
    });
    const t = await res.text();
    let d: any;
    try {
      d = JSON.parse(t);
    } catch {
      return { ok: false, mensagem: `Resposta inesperada do n8n (HTTP ${res.status}).` };
    }
    if (Array.isArray(d)) d = d[0];
    return { ok: !!d?.ok, mensagem: d?.mensagem, vencimento: d?.vencimento, aviso: d?.aviso };
  } catch (e) {
    return { ok: false, mensagem: 'Não consegui falar com o n8n: ' + String(e) };
  }
}
