// Contrato de associação do novato, do lado do servidor:
//  1. gerarPdfContrato → n8n WF-R1 (acao "pdf"): preenche o modelo do Drive;
//  2. enviarContrato   → n8n WF-R1 (acao "assinar_pdf"): Clicksign manda o pedido de
//     assinatura pelo WhatsApp do corretor (e para quem assina pela empresa e as testemunhas);
//  3. verificarContratos → acompanha o envio e, quando o corretor assina, o Max manda
//     o resto das boas-vindas (Cartilha + hub) e o marco "Assinar o contrato" fica cumprido.
// Quem chama a verificação: o webhook do Clicksign (/api/onb/clicksign) e a tela do treinamento.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarUm, janelaAberta } from '@/lib/onb-whats';
import {
  camposContrato, faltando, faixasDe, EMPRESAS,
  type ContratoNovato, type Empresa, type Parte, type Testemunha,
} from '@/lib/contrato-associacao';

const N8N = process.env.N8N_REPRESENTACAO_URL || 'https://villejds.app.n8n.cloud/webhook/representacao-painel';
const CHAVE = process.env.ONB_PAINEL_CHAVE || '';
const MODELO_DRIVE = '15T6W8ioBLhfk8lnsEjDqO0dbChNFpbiG';
// O modelo é restrito na base: o n8n só entrega restritos para o número do administrador.
const FONE_ADMIN = '5511989766590';

const CARTILHA_URL = process.env.ONB_CARTILHA_URL || '';
const HUB_SENHA_INICIAL = process.env.ONB_HUB_SENHA_INICIAL || '';

const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export const nomeEmpresa = (e: string | null | undefined) => (e === 'samia' ? 'empresa da Samia' : 'REMAX Ville');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chamar(corpo: Record<string, unknown>, extra: Record<string, string> = {}): Promise<any> {
  const res = await fetch(N8N, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extra },
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

export async function partesContrato(): Promise<{ partes: Partial<Record<Empresa, Parte>>; testemunhas: Testemunha[]; erro?: string }> {
  const { data, error } = await supabaseAdmin().from('onb_contrato_partes').select('chave,dados');
  if (error) return { partes: {}, testemunhas: [], erro: error.message };
  const m = new Map(((data ?? []) as { chave: string; dados: unknown }[]).map((r) => [r.chave, r.dados]));
  const partes: Partial<Record<Empresa, Parte>> = {};
  for (const e of EMPRESAS) if (m.get(e.id)) partes[e.id] = m.get(e.id) as Parte;
  const t = m.get('testemunhas');
  return { partes, testemunhas: Array.isArray(t) ? (t as Testemunha[]) : [] };
}

async function modeloId(): Promise<number | null> {
  const { data } = await supabaseAdmin().from('base_conhecimento').select('id')
    .eq('drive_file_id', MODELO_DRIVE).not('mapeamento_campos', 'is', null).eq('ativo', true).limit(1).maybeSingle();
  return data ? Number((data as { id: number }).id) : null;
}

export function validarContrato(c: ContratoNovato | null | undefined): string | null {
  if (!c) return 'faltam os dados do contrato';
  if (!EMPRESAS.some((e) => e.id === c.empresa)) return 'escolha a empresa do contrato';
  if (!faixasDe(c.empresa).includes(Number(c.faixa) as ContratoNovato['faixa'])) return `a faixa ${c.faixa}% não vale para ${c.empresa === 'samia' ? 'o Team Samia (só 40% ou 45%)' : 'a REMAX Ville'}`;
  const f = faltando(c.dados);
  return f.length ? 'falta no contrato: ' + f.join(', ') : null;
}

export async function gerarPdfContrato(c: ContratoNovato): Promise<{ ok: boolean; pdf?: string; erro?: string }> {
  const v = validarContrato(c);
  if (v) return { ok: false, erro: v };
  const { partes, testemunhas, erro } = await partesContrato();
  const p = partes[c.empresa];
  if (erro || !p) return { ok: false, erro: 'Faltam os dados da empresa em onb_contrato_partes (rode o SQL do contrato).' };
  const id = await modeloId();
  if (!id) return { ok: false, erro: 'O modelo do contrato não está na base (rode o SQL do contrato).' };
  const campos = camposContrato(c, p, testemunhas, hojeSP());
  const r = await chamar({ acao: 'pdf', id, phone: FONE_ADMIN, campos });
  if (!r?.ok || !r.pdf_base64) return { ok: false, erro: r?.erro || 'Não consegui gerar o PDF do contrato.' };
  return { ok: true, pdf: String(r.pdf_base64) };
}

// Gera o PDF e manda para o Clicksign. Devolve o pedido (representacao_envios.id).
export async function enviarContrato(c: ContratoNovato, phoneCorretor: string, pdfPronto?: string): Promise<{ ok: boolean; pedido?: string; erro?: string }> {
  if (!CHAVE) return { ok: false, erro: 'falta configurar ONB_PAINEL_CHAVE na Vercel' };
  const pdf = pdfPronto ? { ok: true, pdf: pdfPronto, erro: undefined } : await gerarPdfContrato(c);
  if (!pdf.ok) return { ok: false, erro: pdf.erro };
  const { partes, testemunhas } = await partesContrato();
  const p = partes[c.empresa]!;
  const d = c.dados;
  // 06/11/2026: o celular do hub pode ser de outra pessoa (o da Suely era o do Rogério).
  // Vale o do cadastro de corretor, o mesmo que o Max usa.
  const fone = dig(phoneCorretor) || dig(d.telefone);
  const signatarios = [
    { nome: d.nome.trim(), email: d.email.trim().toLowerCase(), phone: fone, cpf: dig(d.cpf), papel: 'contratante' },
    { nome: p.assina.nome, email: p.assina.email, phone: p.assina.phone, cpf: dig(p.assina.cpf), papel: 'contratante' },
    ...testemunhas.map((t) => ({ nome: t.nome, email: t.email, phone: t.phone, cpf: dig(t.cpf), papel: 'testemunha' })),
  ];
  const titulo = `Contrato de Associação - ${d.nome.trim()}${c.empresa === 'samia' ? ' (Team Samia)' : ''}`;
  const r = await chamar({ acao: 'assinar_pdf', pdf_base64: pdf.pdf, titulo, phone: dig(phoneCorretor), signatarios }, { 'x-chave': CHAVE });
  if (!r?.ok || !r.pedido_id) return { ok: false, erro: r?.erro || 'O n8n não registrou o envio. Nada foi enviado.' };
  return { ok: true, pedido: String(r.pedido_id) };
}

export function textoAvisoContrato(nome: string): string {
  return [
    `Olá, ${nome.split(' ')[0]}! Bem-vindo(a) à REMAX Ville! Sou o Max, seu assistente de treinamento, e vou te acompanhar nos seus 30 primeiros dias.`,
    `Primeiro passo: em instantes chega no seu WhatsApp, pela Clicksign (outro número), o seu contrato de associação para assinar.`,
    'Assim que você assinar, eu te mando a Cartilha do Corretor e o seu acesso ao hub.',
  ].join('\n\n');
}

export function textoBoasVindas(dataInicio: string, email: string, depoisDoContrato: boolean): { texto: string; avisos: string[] } {
  const [, m, d] = dataInicio.split('-');
  const avisos: string[] = [];
  const partes = [
    depoisDoContrato
      ? `Contrato assinado, obrigado! Agora sim: sua trilha de 30 dias começa em ${d}/${m}.`
      : `Bem-vindo(a) à REMAX Ville! Sou o Max, seu assistente de treinamento, e vou te acompanhar nos seus 30 primeiros dias, passo a passo. Sua trilha começa em ${d}/${m}.`,
    CARTILHA_URL ? `Sua Cartilha do Corretor: ${CARTILHA_URL}` : '',
    email && HUB_SENHA_INICIAL
      ? `Seu acesso ao hub.minharemax.com: login ${email} e senha inicial ${HUB_SENHA_INICIAL} (o sistema pede para você trocar a senha no primeiro acesso).`
      : '',
    'Para começar, me responda esta mensagem.',
  ];
  if (!CARTILHA_URL) avisos.push('boas-vindas sem a Cartilha (falta ONB_CARTILHA_URL na Vercel)');
  if (!HUB_SENHA_INICIAL) avisos.push('boas-vindas sem o acesso ao hub (falta ONB_HUB_SENHA_INICIAL na Vercel)');
  else if (!email) avisos.push('boas-vindas sem o acesso ao hub: o cadastro de corretor não tem e-mail');
  return { texto: partes.filter(Boolean).join('\n\n'), avisos };
}

type NovatoContrato = {
  id: string; nome: string; phone: string; corretor_id: number | null; data_inicio: string;
  contrato_pedido_id: string | null; contrato_envelope_id: string | null; contrato_status: string | null;
  contrato_verificado_em: string | null;
};

// Manda o resto das boas-vindas e marca o marco do contrato.
async function aposAssinatura(n: NovatoContrato): Promise<string | null> {
  const sb = supabaseAdmin();
  const agora = new Date().toISOString();
  // trava: só um processo manda as boas-vindas
  const { data: trava } = await sb.from('onb_novatos')
    .update({ contrato_status: 'assinado', contrato_assinado_em: agora, boas_vindas_em: agora })
    .eq('id', n.id).is('boas_vindas_em', null).select('id');
  if (!trava?.length) return null;
  let email = '';
  if (n.corretor_id) {
    const { data: c } = await sb.from('corretores_associados').select('email').eq('id', n.corretor_id).maybeSingle();
    email = String((c as { email?: string } | null)?.email ?? '').trim().toLowerCase();
  }
  const { texto } = textoBoasVindas(String(n.data_inicio), email, true);
  const r = await enviarUm({ id: n.id, nome: n.nome, phone: n.phone }, texto, await janelaAberta(n.phone));
  if (!r.ok) {
    await sb.from('onb_novatos').update({ boas_vindas_em: null, contrato_erro: 'assinado, mas as boas-vindas não saíram: ' + r.erro }).eq('id', n.id);
    return r.erro;
  }
  const { data: tr } = await sb.from('onb_trilha').select('id').eq('conteudo_ref', 'roteiro:contrato').eq('ativo', true);
  const ids = ((tr ?? []) as { id: number }[]).map((t) => t.id);
  if (ids.length) {
    await sb.from('onb_tarefas').update({ status: 'aprovada', entregue_em: agora })
      .eq('novato_id', n.id).in('trilha_id', ids).neq('status', 'aprovada');
  }
  return null;
}

// Confere os contratos pendentes. `forcar` ignora o intervalo mínimo entre consultas.
export async function verificarContratos(opts: { forcar?: boolean; envelopes?: string[] } = {}): Promise<{ conferidos: number; assinados: string[] }> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('onb_novatos')
    .select('id,nome,phone,corretor_id,data_inicio,contrato_pedido_id,contrato_envelope_id,contrato_status,contrato_verificado_em')
    .in('contrato_status', ['enviando', 'aguardando', 'assinado'])
    .is('boas_vindas_em', null);
  let lista = (data ?? []) as NovatoContrato[];
  const limite = Date.now() - 60_000;
  if (!opts.forcar) lista = lista.filter((n) => !n.contrato_verificado_em || Date.parse(n.contrato_verificado_em) < limite);
  if (opts.envelopes?.length) {
    const alvo = new Set(opts.envelopes);
    // pedidos ainda sem envelope também entram (o envelope acabou de ser criado)
    const doAviso = lista.filter((n) => !n.contrato_envelope_id || alvo.has(n.contrato_envelope_id));
    // o aviso do Clicksign pode trazer só o id do documento (não o do envelope): aí confere todos
    // os pendentes, respeitando o intervalo de 1 minuto por novato
    const nossos = lista.some((n) => n.contrato_envelope_id && alvo.has(n.contrato_envelope_id));
    if (nossos) lista = doAviso;
    else lista = lista.filter((n) => !n.contrato_verificado_em || Date.parse(n.contrato_verificado_em) < limite);
  }
  if (!lista.length) return { conferidos: 0, assinados: [] };
  const agora = new Date().toISOString();
  await sb.from('onb_novatos').update({ contrato_verificado_em: agora }).in('id', lista.map((n) => n.id));

  // 1) envelope do Clicksign: vem do pedido (representacao_envios)
  for (const n of lista.filter((x) => !x.contrato_envelope_id && x.contrato_pedido_id)) {
    const { data: p } = await sb.from('representacao_envios').select('status,envelope_id,erro').eq('id', n.contrato_pedido_id!).maybeSingle();
    const ped = p as { status: string; envelope_id: string | null; erro: string | null } | null;
    if (!ped) continue;
    if (ped.envelope_id) {
      n.contrato_envelope_id = ped.envelope_id;
      n.contrato_status = 'aguardando';
      await sb.from('onb_novatos').update({ contrato_envelope_id: ped.envelope_id, contrato_status: 'aguardando', contrato_erro: null }).eq('id', n.id);
    } else if (ped.status === 'erro' || ped.status === 'duplicado') {
      n.contrato_status = 'erro';
      await sb.from('onb_novatos').update({ contrato_status: 'erro', contrato_erro: ped.erro || 'o Clicksign não aceitou o envio' }).eq('id', n.id);
    }
  }

  // 2) andamento no Clicksign (o WF-R1 consulta e grava em assinaturas_representacao)
  const assinados: string[] = [];
  const comEnvelope = lista.filter((n) => n.contrato_envelope_id && n.contrato_status !== 'erro');
  const jaAssinados = comEnvelope.filter((n) => n.contrato_status === 'assinado');
  const aConsultar = comEnvelope.filter((n) => n.contrato_status !== 'assinado');
  if (aConsultar.length) {
    const r = await chamar({ acao: 'status', envelopes: aConsultar.map((n) => n.contrato_envelope_id) });
    type Res = { envelope_id: string; status?: string; signatarios?: { nome?: string; assinou?: boolean }[] };
    const porEnv = new Map(((r?.resultados ?? []) as Res[]).map((x) => [x.envelope_id, x]));
    for (const n of aConsultar) {
      const x = porEnv.get(n.contrato_envelope_id!);
      if (!x) continue;
      if (x.status === 'cancelado') {
        await sb.from('onb_novatos').update({ contrato_status: 'cancelado' }).eq('id', n.id);
        continue;
      }
      // o corretor é o primeiro signatário
      const corretorAssinou = x.status === 'assinado' || !!x.signatarios?.[0]?.assinou;
      if (corretorAssinou) jaAssinados.push(n);
    }
  }
  for (const n of jaAssinados) {
    const erro = await aposAssinatura(n);
    if (!erro) assinados.push(n.nome);
  }
  return { conferidos: lista.length, assinados };
}
