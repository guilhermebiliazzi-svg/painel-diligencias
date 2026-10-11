'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */

// Contrato de representação: monta os campos do modelo a partir do formulário,
// gera o PDF para conferir e envia para assinatura (Clicksign).
//
// Tudo passa pelo n8n (WF-R1, webhook "representacao-painel"), que reaproveita
// o mesmo preenchimento (base_conhecimento + Render /preencher-pdf) e o mesmo
// envio (workflow "Enviar_Para_Assinatura") que a EVA usa no WhatsApp.
import { getSessaoPerfil, podeTela, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const N8N =
  process.env.N8N_REPRESENTACAO_URL || 'https://villejds.app.n8n.cloud/webhook/representacao-painel';

export type Pessoa = {
  nome: string;
  doc: string;
  rg: string;
  nacionalidade: string;
  estado_civil: string;
  endereco: string;
  email: string;
  telefone: string;
  // só PJ
  ie: string;
  complemento: string;
  bairro: string;
  municipio: string;
  estado: string;
};

export type FormRepresentacao = {
  tipo: 'pf' | 'pj';
  imovel: {
    tipo: string;
    endereco: string;
    complemento: string;
    bairro: string;
    municipio: string;
    estado: string;
    valor: string;
    matricula: string;
    cartorio: string;
    iptu: string;
    observacoes: string;
  };
  pessoas: Pessoa[];
  corretor_id: number | null;
  corretor_cpf: string;
};

export type CorretorOpcao = { id: number; nome: string; creci: string; cpf: string; temEmail: boolean; temFone: boolean };

const TESTEMUNHA2 = 'Jessica Silva Araujo';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const txt = (v: unknown) => String(v ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fmtDoc(v: string) {
  const d = dig(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return txt(v);
}
function numBR(v: string): number | null {
  const t = txt(v).replace(/^R\$\s*/i, '');
  if (!t) return null;
  const n = Number(/,\d{1,2}$/.test(t) || /\.\d{3}(,|$)/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'));
  return isFinite(n) && n > 0 ? n : null;
}
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// modelos da base_conhecimento (com mapeamento de campos)
function modeloDe(tipo: 'pf' | 'pj', n: number): number {
  if (tipo === 'pj') return 3;
  return n <= 2 ? 1 : n <= 4 ? 2 : 4;
}

type Sessao = { admin: boolean; corretorId: number | null };

async function sessao(): Promise<Sessao> {
  const { perfil } = await getSessaoPerfil();
  if (!perfil || !perfil.ativo || !podeTela(perfil, 'representacao')) throw new Error('Sem acesso ao contrato de representação.');
  if (perfil.is_admin) return { admin: true, corretorId: null };
  const cor = await corretorDaPessoa(perfil.email);
  return { admin: false, corretorId: cor?.id ?? null };
}

type Corretor = { id: number; nome: string; creci: string; cpf: string; email: string; phone: string };

async function corretorDoEnvio(s: Sessao, pedido: number | null): Promise<Corretor> {
  const id = s.admin ? pedido : s.corretorId;
  if (!id) throw new Error(s.admin ? 'Escolha o corretor.' : 'Seu usuário não está ligado a um cadastro de corretor. Fale com o administrador.');
  const { data } = await supabaseAdmin()
    .from('corretores_associados')
    .select('id,nome,creci,cpf,email,phone')
    .eq('id', id)
    .maybeSingle();
  if (!data) throw new Error('Corretor não encontrado.');
  return {
    id: Number(data.id),
    nome: txt(data.nome).split(' - ')[0],
    creci: txt(data.creci),
    cpf: txt(data.cpf),
    email: txt(data.email),
    phone: dig(data.phone),
  };
}

type Montado = {
  id: number;
  campos: Record<string, string>;
  signatarios: { nome: string; email: string; phone: string }[] | null;
  imovel_endereco: string;
  phone: string;
};

function validar(f: FormRepresentacao, envio: boolean): string[] {
  const err: string[] = [];
  const pj = f.tipo === 'pj';
  const max = pj ? 2 : 6;
  const ps = (f.pessoas || []).filter((p) => txt(p.nome) || dig(p.doc));
  if (!ps.length) err.push(pj ? 'Informe a empresa proprietária.' : 'Informe ao menos um proprietário.');
  if (ps.length > max) err.push(`No máximo ${max} ${pj ? 'empresas' : 'proprietários'}.`);
  if (!txt(f.imovel.endereco)) err.push('Endereço do imóvel.');
  if (!txt(f.imovel.bairro)) err.push('Bairro do imóvel.');
  if (!numBR(f.imovel.valor)) err.push('Valor de venda do imóvel.');
  ps.forEach((p, i) => {
    const q = pj ? `Empresa ${i + 1}` : `Proprietário ${i + 1}`;
    if (!txt(p.nome)) err.push(`${q}: ${pj ? 'razão social' : 'nome'}.`);
    const d = dig(p.doc);
    if (pj ? d.length !== 14 : d.length !== 11) err.push(`${q}: ${pj ? 'CNPJ' : 'CPF'} inválido.`);
    if (envio && !EMAIL.test(txt(p.email))) err.push(`${q}: e-mail${pj ? ' de quem assina pela empresa' : ''} (recebe o link para assinar).`);
  });
  return err;
}

function montar(f: FormRepresentacao, c: Corretor): Montado {
  const pj = f.tipo === 'pj';
  const ps = (f.pessoas || []).filter((p) => txt(p.nome) || dig(p.doc));
  const im = f.imovel;
  const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const valor = numBR(im.valor);
  const cpfCorretor = fmtDoc(txt(f.corretor_cpf) || c.cpf);

  const campos: Record<string, string> = {
    imovel_tipo: txt(im.tipo),
    imovel_endereco: txt(im.endereco),
    imovel_complemento: txt(im.complemento),
    imovel_bairro: txt(im.bairro),
    imovel_municipio: txt(im.municipio) || 'São Paulo',
    imovel_estado: txt(im.estado).toUpperCase() || 'SP',
    imovel_valor: valor ? brl(valor) : '',
    imovel_matricula: txt(im.matricula),
    imovel_cartorio: txt(im.cartorio),
    imovel_classificacao_iptu: txt(im.iptu),
    imovel_observacoes: txt(im.observacoes),
    corretor_nome: c.nome,
    corretor_creci: c.creci,
    corretor_cpf: cpfCorretor,
    testemunha1_nome: c.nome,
    testemunha1_cpf: cpfCorretor,
    testemunha2_nome: TESTEMUNHA2,
    assinatura_cidade: 'São Paulo',
    assinatura_dia: String(hoje.getDate()),
    assinatura_mes: MESES[hoje.getMonth()],
    // o modelo traz "202_" impresso: vai só o último dígito do ano
    assinatura_ano_final: String(hoje.getFullYear()).slice(-1),
  };
  ps.forEach((p, i) => {
    const n = i + 1;
    if (pj) {
      campos[`contratante${n}_razao_social`] = txt(p.nome).toUpperCase();
      campos[`contratante${n}_cnpj`] = fmtDoc(p.doc);
      campos[`contratante${n}_ie`] = txt(p.ie);
      campos[`contratante${n}_endereco`] = txt(p.endereco);
      campos[`contratante${n}_complemento`] = txt(p.complemento);
      campos[`contratante${n}_bairro`] = txt(p.bairro);
      campos[`contratante${n}_municipio`] = txt(p.municipio);
      campos[`contratante${n}_estado`] = txt(p.estado).toUpperCase();
    } else {
      campos[`contratante${n}_nome`] = txt(p.nome).toUpperCase();
      campos[`contratante${n}_cpf`] = fmtDoc(p.doc);
      campos[`contratante${n}_rg`] = txt(p.rg);
      campos[`contratante${n}_nacionalidade`] = txt(p.nacionalidade);
      campos[`contratante${n}_estado_civil`] = txt(p.estado_civil);
      campos[`contratante${n}_endereco`] = txt(p.endereco);
      campos[`contratante${n}_email`] = txt(p.email).toLowerCase();
      campos[`contratante${n}_telefone1`] = dig(p.telefone);
    }
  });
  // o modelo PJ não tem e-mail: o contato de quem assina vai à parte
  const signatarios = pj
    ? ps.map((p) => ({ nome: txt(p.nome).toUpperCase(), email: txt(p.email).toLowerCase(), phone: dig(p.telefone) }))
    : null;
  const endereco = [txt(im.endereco), txt(im.complemento)].filter(Boolean).join(' - ');
  return { id: modeloDe(f.tipo, ps.length), campos, signatarios, imovel_endereco: endereco, phone: c.phone };
}

async function chamar(corpo: Record<string, unknown>): Promise<any> {
  const res = await fetch(N8N, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    cache: 'no-store',
  });
  const t = await res.text();
  try {
    const d = JSON.parse(t);
    return Array.isArray(d) ? d[0] : d;
  } catch {
    return { ok: false, erro: `Resposta inesperada do n8n (HTTP ${res.status}).` };
  }
}

export async function gerarPdf(f: FormRepresentacao): Promise<{ ok: boolean; pdf?: string; titulo?: string; erro?: string }> {
  try {
    const s = await sessao();
    const err = validar(f, false);
    if (err.length) return { ok: false, erro: 'Falta: ' + err.join(' ') };
    const c = await corretorDoEnvio(s, f.corretor_id);
    const m = montar(f, c);
    const r = await chamar({ acao: 'pdf', id: m.id, phone: m.phone, campos: m.campos });
    if (!r?.ok || !r.pdf_base64) return { ok: false, erro: r?.erro || 'Não consegui gerar o PDF.' };
    return { ok: true, pdf: r.pdf_base64, titulo: r.titulo };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function enviarAssinatura(f: FormRepresentacao): Promise<{ ok: boolean; mensagem?: string; erro?: string }> {
  try {
    const s = await sessao();
    const err = validar(f, true);
    if (err.length) return { ok: false, erro: 'Falta: ' + err.join(' ') };
    const c = await corretorDoEnvio(s, f.corretor_id);
    if (!EMAIL.test(c.email)) return { ok: false, erro: `O cadastro do corretor ${c.nome} está sem e-mail — ele assina como testemunha. Cadastre o e-mail antes de enviar.` };
    if (!c.phone) return { ok: false, erro: `O cadastro do corretor ${c.nome} está sem telefone.` };
    const m = montar(f, c);
    const r = await chamar({ acao: 'enviar', ...m });
    if (r?.duplicado) return { ok: false, erro: 'Este contrato já foi enviado há poucos minutos — não criei outro envelope. Confira em "Contratos enviados".' };
    if (!r?.ok) return { ok: false, erro: r?.erro || r?.mensagem || 'O envio não deu certo.' };
    return { ok: true, mensagem: 'Enviado para assinatura. Cada signatário recebe o link por e-mail do Clicksign.' };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// Consulta o andamento no Clicksign e grava em assinaturas_representacao.
export async function atualizarStatus(envelopes: string[]): Promise<{ ok: boolean; mudou: boolean }> {
  try {
    const s = await sessao();
    const ids = (envelopes || []).filter((e) => /^[0-9a-f-]{36}$/i.test(e)).slice(0, 25);
    if (!ids.length) return { ok: true, mudou: false };
    const sb = supabaseAdmin();
    const { data } = await sb.from('assinaturas_representacao').select('envelope_id,status,phone_corretor').in('envelope_id', ids);
    let rows = data ?? [];
    if (!s.admin) {
      const c = await corretorDoEnvio(s, null);
      const fim = c.phone.slice(-8);
      rows = rows.filter((r) => fim && dig(r.phone_corretor).slice(-8) === fim);
    }
    if (!rows.length) return { ok: true, mudou: false };
    const antes = new Map(rows.map((r) => [String(r.envelope_id), String(r.status)]));
    const r = await chamar({ acao: 'status', envelopes: [...antes.keys()] });
    // atualizado_em passa a ser agora: a próxima carga não consulta de novo
    const mudou = (r?.resultados || []).length > 0;
    return { ok: !!r?.ok, mudou };
  } catch {
    return { ok: false, mudou: false };
  }
}
