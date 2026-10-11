'use server';

// Decisões do Guilherme sobre um lead do SDR, tomadas pela tela do painel
// (link no cartão do WhatsApp). Cada tela é de UM lead: não há como a decisão
// cair no lead errado. A cascata (oferta 15 min por corretor) continua no n8n:
// aqui só gravamos a fila/estado, igual ao comando de fila do WhatsApp.
import { exigirSdrGestao } from '@/lib/perfil';
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
  await exigirSdrGestao();
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: 'Lead não encontrado.' };
  const fila = await telefonesValidos(phones);
  if (!fila.length) return { ok: false, erro: 'Escolha pelo menos um corretor.' };

  // Guilherme sempre pode encaminhar (11/10): lead em qualificação, direto ao
  // gestor, arquivado ou já com corretor é REABERTO e entra na fila nova.
  const reabrir = !ABERTOS.includes(lead.status) || !!lead.corretor_phone;
  const sb = supabaseAdmin();
  let novaFila = fila;
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { status: 'em_cascata', updated_at: agora };
  if (reabrir) {
    Object.assign(patch, { corretor_phone: null, cartao_enviado_em: agora, arquivado_em: null, motivo_arquivamento: null });
    // oferta ainda aberta de uma cascata anterior não pode travar a nova
    await sb.from('sdr_atribuicoes').update({ resposta: 'sem_resposta', respondido_em: agora }).eq('lead_id', leadId).is('resposta', null);
  } else if (lead.status === 'em_cascata') {
    const atual = lead.fila_corretores ?? [];
    novaFila = [...atual, ...fila.filter((p) => !atual.includes(p))];
  } else {
    patch.cartao_enviado_em = new Date().toISOString();
  }
  patch.fila_corretores = novaFila;
  let q = sb.from('sdr_leads').update(patch).eq('id', leadId).eq('status', lead.status);
  q = lead.corretor_phone ? q.eq('corretor_phone', lead.corretor_phone) : q.is('corretor_phone', null);
  const { data, error } = await q.select('id');
  if (error) return { ok: false, erro: 'Não foi possível gravar: ' + error.message };
  if (!data?.length) return { ok: false, erro: 'O lead mudou enquanto você decidia. Recarregue a página.' };
  await registrar(leadId, 'comando_fila', (reabrir ? '(reaberto de ' + lead.status + ') ' : '') + novaFila.join(','));
  return { ok: true, msg: (reabrir ? 'Lead reaberto. ' : '') + 'Fila gravada. A oferta ao primeiro corretor sai em até 10 minutos; cada um tem 15 minutos para responder.' };
}

// Segura: para a cascata (se ninguém assumiu) e adia o lembrete.
export async function segurar(leadId: string): Promise<Resultado> {
  await exigirSdrGestao();
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
  await exigirSdrGestao();
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
  await exigirSdrGestao();
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
  const eu = await exigirSdrGestao();
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

// ---------- Captação da landing sem lead: descartar / referenciar ----------
type CaptacaoMin = { id: string; nome: string | null; telefone: string | null; intencao: string | null; tipo: string | null; bairro: string | null; endereco: string | null; descartado_em: string | null; referenciado_em: string | null };

async function lerCaptacao(id: string): Promise<CaptacaoMin | null> {
  const { data } = await supabaseAdmin().from('captacao_leads')
    .select('id,nome,telefone,intencao,tipo,bairro,endereco,descartado_em,referenciado_em').eq('id', id).maybeSingle();
  return (data as CaptacaoMin | null) ?? null;
}
const fim8tel = (t: string | null) => String(t ?? '').replace(/\D/g, '').slice(-8);

// Descarta a captação (todos os registros do mesmo telefone: formulário e WhatsApp).
export async function descartarCaptacao(captacaoId: string): Promise<Resultado> {
  await exigirSdrGestao();
  const c = await lerCaptacao(captacaoId);
  if (!c) return { ok: false, erro: 'Captação não encontrada.' };
  const sb = supabaseAdmin();
  const q = sb.from('captacao_leads').update({ descartado_em: new Date().toISOString() });
  const f8 = fim8tel(c.telefone);
  const { error } = f8.length === 8 ? await q.like('telefone', '%' + f8).is('descartado_em', null) : await q.eq('id', c.id);
  if (error) return { ok: false, erro: 'Não foi possível descartar: ' + error.message };
  return { ok: true, msg: 'Captação descartada.' };
}

export type DadosRefCaptacao = { corretor_nome: string; corretor_whatsapp: string; unidade: string; email: string; regiao: string };

// Referencia a captação para um corretor de outra unidade REMAX (25% da perna da indicação).
// O painel grava a indicação; o n8n (sdr-painel-acao) manda o convite (modelo referenciamento_captacao).
// O aceite e o e-mail seguem o mesmo fluxo da Eva do referenciamento de cliente.
export async function referenciarCaptacao(captacaoId: string, d: DadosRefCaptacao): Promise<Resultado> {
  const eu = await exigirSdrGestao();
  const c = await lerCaptacao(captacaoId);
  if (!c) return { ok: false, erro: 'Captação não encontrada.' };
  if (c.referenciado_em) return { ok: false, erro: 'Esta captação já foi referenciada.' };
  const nome = String(d?.corretor_nome ?? '').trim();
  let wa = String(d?.corretor_whatsapp ?? '').replace(/\D/g, '');
  if (wa.length === 10 || wa.length === 11) wa = '55' + wa;
  const unidade = String(d?.unidade ?? '').trim();
  const email = String(d?.email ?? '').trim().toLowerCase();
  const regiao = String(d?.regiao ?? '').trim();
  if (!nome || !unidade || !regiao) return { ok: false, erro: 'Preencha nome do corretor, unidade e cidade/região.' };
  if (!/^55\d{10,11}$/.test(wa)) return { ok: false, erro: 'WhatsApp do corretor inválido (DDD + número).' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: 'E-mail inválido.' };
  const sb = supabaseAdmin();
  const { data: aberta } = await sb.from('indicacoes').select('id').eq('corretor_whatsapp', wa).in('status', ['aguardando_aceite', 'aceito_aguardando_email']).limit(1);
  if (aberta && aberta.length) return { ok: false, erro: 'Este corretor já tem um referenciamento aguardando aceite. Espere ele responder antes de mandar outro.' };
  const tel = String(c.telefone ?? '').replace(/\D/g, '');
  const imovel = [c.tipo, c.endereco, c.bairro && c.bairro !== 'Outro' ? c.bairro : ''].filter(Boolean).join(' · ');
  const { data: ind, error } = await sb.from('indicacoes').insert({
    direcao: 'saida', tipo_indicacao: 'captacao', captacao_id: c.id,
    cliente_nome: c.nome, cliente_telefone: tel ? (tel.length <= 11 ? '55' + tel : tel) : null,
    cidade: regiao, tipo_transacao: /^alug/i.test(String(c.intencao ?? '')) ? 'locacao' : 'venda',
    corretor_nome: nome, corretor_whatsapp: wa, unidade_nome: unidade, email_corretor: email || null,
    percentual_referenciamento: 25, status: 'aguardando_aceite',
    observacoes: 'Imóvel: ' + (imovel || 'não informado') + ' | pedido por ' + eu.email,
  }).select('id').single();
  if (error || !ind) return { ok: false, erro: 'Não foi possível registrar: ' + (error?.message ?? '') };
  let resposta = '';
  let ok = false;
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'referenciar_captacao', indicacao_id: ind.id }),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    ok = r.ok && j.ok === true;
    resposta = String(j.resposta ?? '');
  } catch {
    resposta = 'o n8n não respondeu';
  }
  if (!ok) {
    await sb.from('indicacoes').update({ status: 'cancelada', observacoes: 'Imóvel: ' + (imovel || 'não informado') + ' | convite não saiu: ' + resposta }).eq('id', ind.id);
    return { ok: false, erro: 'O convite ao corretor não saiu (' + (resposta || 'erro') + '). Nada ficou pendente — confira o WhatsApp e tente de novo.' };
  }
  const f8 = fim8tel(c.telefone);
  const q = sb.from('captacao_leads').update({ referenciado_em: new Date().toISOString(), indicacao_id: ind.id });
  if (f8.length === 8) await q.like('telefone', '%' + f8); else await q.eq('id', c.id);
  return { ok: true, msg: 'Convite enviado a ' + nome + '. Quando ele aceitar, a Eva pede o e-mail e manda os dados do proprietário.' };
}
