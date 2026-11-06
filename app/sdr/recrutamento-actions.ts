'use server';

// 05/11: ações do funil de recrutamento (painel). A etapa fica em public.recrutamento_candidatos.
// Mensagens saem pela Eva via n8n (sdr-painel-acao); o telefone é sempre resolvido no banco.
import { exigirRecrutamento } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { MOTIVOS_DESCARTE, telFmt, type EtapaRec } from '@/lib/recrutamento';

export type ResultadoRec = { ok: boolean; msg?: string; erro?: string };

const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';
const fim8 = (t: string) => String(t ?? '').replace(/\D/g, '').slice(-8);

type Cand = { id: string; nome: string | null; telefone: string; momento: string | null; bairro: string | null; creci: string | null };

async function lerCandidato(tel: string): Promise<Cand | null> {
  const f8 = fim8(tel);
  if (f8.length !== 8) return null;
  const { data } = await supabaseAdmin().from('recrutamento_leads').select('id,nome,telefone,momento,bairro,creci,evento')
    .like('telefone', '%' + f8).order('criado_em', { ascending: false }).limit(20);
  const xs = (data ?? []) as (Cand & { evento: string })[];
  if (!xs.length) return null;
  const pick = (k: keyof Cand) => xs.map((x) => x[k]).find((v) => v) ?? null;
  return { id: (xs.find((x) => x.evento === 'formulario') ?? xs[0]).id, telefone: xs[0].telefone, nome: pick('nome'), momento: pick('momento'), bairro: pick('bairro'), creci: pick('creci') };
}

async function gravar(tel: string, patch: Record<string, unknown>, evento: string, por: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data: atual } = await sb.from('recrutamento_candidatos').select('historico').eq('telefone', tel).maybeSingle();
  const hist = Array.isArray((atual as { historico?: unknown[] } | null)?.historico) ? (atual as { historico: unknown[] }).historico : [];
  const agora = new Date().toISOString();
  const { error } = await sb.from('recrutamento_candidatos').upsert({
    telefone: tel, ...patch, atualizado_em: agora, atualizado_por: por,
    historico: [...hist, { em: agora, por, evento }].slice(-50),
  }, { onConflict: 'telefone' });
  return error ? error.message : null;
}

async function acaoN8n(body: Record<string, unknown>): Promise<ResultadoRec> {
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    if (!r.ok) return { ok: false, erro: 'A Eva não respondeu (' + r.status + '). Nada foi enviado.' };
    const resposta = String(j.resposta ?? '').trim();
    return j.ok ? { ok: true, msg: resposta || 'Enviada.' } : { ok: false, erro: resposta || 'Não saiu. Nada foi enviado.' };
  } catch {
    return { ok: false, erro: 'A Eva não respondeu. Nada foi enviado — tente de novo em instantes.' };
  }
}

// Muda a etapa (descartar, entrou, voltar para decidir, marcar entrevista).
export async function mudarEtapaCandidato(tel: string, etapa: EtapaRec, extra?: { motivo?: string; entrevista_em?: string; retomar_em?: string }): Promise<ResultadoRec> {
  const eu = await exigirRecrutamento();
  const c = await lerCandidato(tel);
  if (!c) return { ok: false, erro: 'Candidato não encontrado.' };
  if (!['decidir', 'contato', 'entrevista', 'pensando', 'entrou', 'descartado'].includes(etapa)) return { ok: false, erro: 'Etapa inválida.' };
  const patch: Record<string, unknown> = { etapa };
  let evento: string = etapa;
  if (etapa === 'descartado') {
    const motivo = String(extra?.motivo ?? '').trim();
    if (!MOTIVOS_DESCARTE.includes(motivo)) return { ok: false, erro: 'Escolha o motivo.' };
    patch.motivo = motivo;
    evento = 'descartado: ' + motivo;
  } else if (etapa === 'entrevista') {
    const q = String(extra?.entrevista_em ?? '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(q)) return { ok: false, erro: 'Informe data e hora da entrevista.' };
    const iso = new Date(q + ':00-03:00').toISOString();
    patch.entrevista_em = iso;
    patch.motivo = null;
    evento = 'entrevista marcada: ' + q.replace('T', ' ');
  } else if (etapa === 'pensando') {
    // 06/11: fez entrevista e ficou de pensar — data para retomar o contato
    const d = String(extra?.retomar_em ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, erro: 'Informe a data para retomar.' };
    patch.retomar_em = d;
    patch.motivo = null;
    evento = 'pensando, retomar em ' + d.split('-').reverse().join('/');
  } else {
    patch.motivo = null;
  }
  const erro = await gravar(c.telefone, patch, evento, eu.email);
  return erro ? { ok: false, erro: 'Não foi possível gravar: ' + erro } : { ok: true, msg: 'Atualizado.' };
}

// Encaminha o candidato para quem o Guilherme escolher (corretor da Ville) — ou "eu mesmo", sem mensagem.
export async function encaminharCandidato(tel: string, corretorId: number | null): Promise<ResultadoRec> {
  const eu = await exigirRecrutamento();
  const c = await lerCandidato(tel);
  if (!c) return { ok: false, erro: 'Candidato não encontrado.' };
  if (corretorId == null) {
    const erro = await gravar(c.telefone, { etapa: 'contato', encaminhado_para: null, encaminhado_nome: 'Guilherme' }, 'contato: Guilherme', eu.email);
    return erro ? { ok: false, erro } : { ok: true, msg: 'Marcado como em contato com você.' };
  }
  const { data: cor } = await supabaseAdmin().from('corretores_associados').select('id,nome,apelido,phone,status').eq('id', corretorId).maybeSingle();
  const k = cor as { id: number; nome: string; apelido: string | null; phone: string | null; status: string } | null;
  if (!k || k.status !== 'ativo' || !k.phone) return { ok: false, erro: 'Corretor não encontrado ou sem WhatsApp.' };
  const primeiro = (k.apelido || k.nome.split(' ')[0]).trim();
  const texto = [
    `${primeiro}, candidato a corretor para você conversar:`,
    `${c.nome || 'Sem nome'} — ${telFmt(c.telefone)}`,
    c.momento ? `Momento: ${c.momento}` : '',
    c.bairro ? `Mora em: ${c.bairro}` : '',
    c.creci ? `CRECI: ${c.creci === 'sim' ? 'sim' : 'não'}` : '',
    'Pode fazer o contato?',
  ].filter(Boolean).join('\n');
  const r = await acaoN8n({ acao: 'enviar_mensagem_associado', corretor_id: k.id, texto, por: eu.email });
  if (!r.ok) return r;
  const erro = await gravar(c.telefone, { etapa: 'contato', encaminhado_para: k.phone, encaminhado_nome: k.nome.split(' - ')[0] }, 'encaminhado: ' + k.nome.split(' - ')[0], eu.email);
  return erro ? { ok: false, erro: 'A mensagem saiu, mas não consegui gravar a etapa: ' + erro } : { ok: true, msg: 'Encaminhado para ' + primeiro + '. ' + (r.msg ?? '') };
}

// Mensagem da Eva para o candidato (texto livre na janela de 24h; fora dela, mensagem-modelo).
export async function chamarCandidato(tel: string, texto: string): Promise<ResultadoRec> {
  const eu = await exigirRecrutamento();
  const c = await lerCandidato(tel);
  if (!c) return { ok: false, erro: 'Candidato não encontrado.' };
  const t = String(texto ?? '').replace(/\r/g, '').trim();
  if (!t) return { ok: false, erro: 'Escreva a mensagem.' };
  if (t.length > 900) return { ok: false, erro: 'Mensagem longa demais (máx. 900 caracteres).' };
  return acaoN8n({ acao: 'enviar_mensagem_recrutamento', recrutamento_id: c.id, texto: t, por: eu.email });
}
