'use server';

// Decisões do Guilherme sobre um lead do SDR, tomadas pela tela do painel
// (link no cartão do WhatsApp). Cada tela é de UM lead: não há como a decisão
// cair no lead errado. A cascata (oferta 15 min por corretor) continua no n8n:
// aqui só gravamos a fila/estado, igual ao comando de fila do WhatsApp.
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { leadDaCaptacao } from '@/app/sdr/lead-captacao';

export type Resultado = { ok: boolean; erro?: string; msg?: string; leadId?: string };

const GUILHERME = '5511989766590';
const ABERTOS = ['aguardando_guilherme', 'em_cascata'];

type LeadMin = { id: string; status: string; fila_corretores: string[] | null; corretor_phone: string | null; nome: string | null };

async function lerLead(id: string): Promise<LeadMin | null> {
  const { data } = await supabaseAdmin()
    .from('sdr_leads')
    .select('id,status,fila_corretores,corretor_phone,nome')
    .eq('id', id)
    .maybeSingle();
  return (data as LeadMin | null) ?? null;
}

async function telefonesValidos(phones: string[]): Promise<string[]> {
  const unicos = [...new Set(phones.map((p) => String(p).replace(/\D/g, '')).filter(Boolean))];
  if (!unicos.length) return [];
  const { data } = await supabaseAdmin()
    .from('corretores_associados')
    .select('phone')
    .eq('status', 'ativo')
    .in('phone', unicos);
  const ok = new Set((data ?? []).map((c: { phone: string }) => c.phone));
  return unicos.filter((p) => ok.has(p));
}

async function registrar(leadId: string, template: string, conteudo: string) {
  await supabaseAdmin().from('sdr_mensagens').insert({
    lead_id: leadId, direcao: 'in', interlocutor: 'guilherme', telefone: GUILHERME, template, conteudo,
  });
}

// Fila: se a cascata já começou (alguém já recebeu oferta), os nomes novos entram no fim;
// se ainda não, a nova ordem substitui a anterior.
export async function ofertar(leadId: string, phones: string[]): Promise<Resultado> {
  await exigirAdmin();
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: 'Lead não encontrado.' };
  if (lead.corretor_phone) return { ok: false, erro: 'Este lead já tem corretor.' };
  if (!ABERTOS.includes(lead.status)) return { ok: false, erro: 'Este lead não está aguardando decisão (status: ' + lead.status + ').' };
  const fila = await telefonesValidos(phones);
  if (!fila.length) return { ok: false, erro: 'Escolha pelo menos um corretor.' };

  const sb = supabaseAdmin();
  let novaFila = fila;
  const patch: Record<string, unknown> = { status: 'em_cascata', updated_at: new Date().toISOString() };
  if (lead.status === 'em_cascata') {
    const atual = lead.fila_corretores ?? [];
    novaFila = [...atual, ...fila.filter((p) => !atual.includes(p))];
  } else {
    patch.cartao_enviado_em = new Date().toISOString();
  }
  patch.fila_corretores = novaFila;
  const { data, error } = await sb.from('sdr_leads').update(patch).eq('id', leadId).eq('status', lead.status).is('corretor_phone', null).select('id');
  if (error) return { ok: false, erro: 'Não foi possível gravar: ' + error.message };
  if (!data?.length) return { ok: false, erro: 'O lead mudou enquanto você decidia. Recarregue a página.' };
  await registrar(leadId, 'comando_fila', novaFila.join(','));
  return { ok: true, msg: 'Fila gravada. A oferta ao primeiro corretor sai em até 10 minutos; cada um tem 15 minutos para responder.' };
}

// Segura: para a cascata (se ninguém assumiu) e adia o lembrete.
export async function segurar(leadId: string): Promise<Resultado> {
  await exigirAdmin();
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: 'Lead não encontrado.' };
  const patch: Record<string, unknown> = { cartao_enviado_em: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (lead.status === 'em_cascata' && !lead.corretor_phone) { patch.status = 'aguardando_guilherme'; patch.fila_corretores = []; }
  const { error } = await supabaseAdmin().from('sdr_leads').update(patch).eq('id', leadId);
  if (error) return { ok: false, erro: 'Não foi possível gravar: ' + error.message };
  await registrar(leadId, 'comando_segura', 'segura (painel)');
  return { ok: true, msg: patch.status ? 'Segurado: a oferta parou e o lead voltou para você.' : 'Segurado: o lembrete foi adiado.' };
}

// Descarta: arquiva sem atender (não mexe em lead já atribuído/visitando).
export async function descartar(leadId: string): Promise<Resultado> {
  await exigirAdmin();
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: 'Lead não encontrado.' };
  if (['atribuido', 'visita_agendada', 'encerrado'].includes(lead.status)) return { ok: false, erro: 'Lead já está com corretor — não dá para descartar daqui.' };
  const agora = new Date().toISOString();
  const { error } = await supabaseAdmin().from('sdr_leads').update({
    status: 'arquivado', arquivado_em: agora, updated_at: agora, fila_corretores: [],
    motivo_arquivamento: 'descartado pelo Guilherme (não vamos atender)',
  }).eq('id', leadId);
  if (error) return { ok: false, erro: 'Não foi possível gravar: ' + error.message };
  await registrar(leadId, 'comando_descartar', 'descartado (painel)');
  return { ok: true, msg: 'Lead descartado.' };
}

// Captação da landing (Anuncie na REMAX): cria o lead na hora de escolher a fila.
export async function ofertarCaptacao(captacaoId: string, phones: string[]): Promise<Resultado> {
  await exigirAdmin();
  const sb = supabaseAdmin();
  const { data: c } = await sb.from('captacao_leads').select('*').eq('id', captacaoId).maybeSingle();
  if (!c) return { ok: false, erro: 'Captação não encontrada.' };
  const tel = String(c.telefone ?? '').replace(/\D/g, '');
  if (!tel) return { ok: false, erro: 'Captação sem telefone.' };
  const tel55 = tel.length <= 11 ? '55' + tel : tel;
  const existente = await leadDaCaptacao(tel55, c.criado_em);
  if (existente) return ofertar(existente, phones);
  const fila = await telefonesValidos(phones);
  if (!fila.length) return { ok: false, erro: 'Escolha pelo menos um corretor.' };
  const aluguel = /^alug/i.test(String(c.intencao ?? ''));
  const { data: novo, error } = await sb.from('sdr_leads').insert({
    telefone: tel55, nome: c.nome || null, origem: 'campanha', fonte: 'Captação — landing Anuncie na REMAX',
    intencao: aluguel ? 'aluguel' : 'venda', tipologia: 'captação (proprietário): ' + (c.tipo || 'imóvel'),
    bairros: c.bairro ? [c.bairro] : [], imovel_anuncio_endereco: c.endereco || null, c2s_lead_id: c.c2s_lead_id || null,
    qualificado: true, temperatura: 'quente', status: 'aguardando_guilherme',
    resumo: 'Proprietário quer ' + (aluguel ? 'alugar' : 'vender') + ' o imóvel (landing Anuncie na REMAX).',
  }).select('id').single();
  if (error || !novo) return { ok: false, erro: 'Não foi possível criar o lead: ' + (error?.message ?? '') };
  const r = await ofertar(novo.id, fila);
  return { ...r, leadId: novo.id };
}

// Referenciar: pede aceite ao corretor do imóvel (outra unidade REMAX), 25% sobre a perna da indicação.
// Quem executa é o SDR no n8n (mesmo fluxo do comando "referenciar" no WhatsApp), chamado pelo
// webhook sdr-painel-acao com o lead explícito — não há como cair em outro lead.
const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';

export async function referenciar(leadId: string, ref: string): Promise<Resultado> {
  const eu = await exigirAdmin();
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: 'Lead não encontrado.' };
  if (['atribuido', 'visita_agendada', 'encerrado', 'arquivado'].includes(lead.status)) return { ok: false, erro: 'Este lead não está mais aberto.' };
  const refLimpa = String(ref ?? '').trim().replace(/[^A-Za-z0-9#\-]/g, '');
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'referenciar', lead_id: leadId, ref: refLimpa, por: eu.email }),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    if (!r.ok) return { ok: false, erro: 'O SDR não respondeu (' + r.status + '). Nada foi enviado.' };
    const resposta = String(j.resposta ?? '').trim();
    const deuCerto = /pedido de aceite|enviei|referenciado/i.test(resposta) && !/n[aã]o (consegui|foi|enviei)|erro|sem contato|não achei/i.test(resposta);
    return deuCerto ? { ok: true, msg: resposta } : { ok: false, erro: resposta || 'Não consegui referenciar. Nada foi enviado.' };
  } catch {
    return { ok: false, erro: 'O SDR não respondeu. Nada foi enviado — tente de novo em instantes.' };
  }
}
