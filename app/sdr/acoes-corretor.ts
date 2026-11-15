'use server';

// 15/11: o que o corretor registra pelo "Meu funil" (botão Atualizar), além de "Registrar visita":
// visita feita, arquivar com motivo e novo contato numa data. Vale para o corretor do lead e para a
// gestão do SDR. Visita feita e arquivar seguem pelo n8n (SDR-12, acao corretor_lead), que grava,
// anota no C2S e avisa o Guilherme do arquivamento, igual aos botões da Eva no WhatsApp. O novo contato
// é o mesmo lembrete do botão "Lembrar mais tarde" (sdr_lembretes): a Eva lembra só o corretor e,
// até lá, não cobra o corretor nem manda follow-up ao cliente.
import { revalidatePath } from 'next/cache';
import { getSessaoPerfil, podeTela, escopoSdr, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ResAcao = { ok: boolean; msg?: string; erro?: string };

const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';
const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);

const MOTIVOS_ARQUIVO: Record<string, string> = {
  comprou_outro: 'comprou ou alugou outro imóvel',
  desistiu: 'cliente desistiu',
  sem_contato: 'não consegui contato',
  fora_perfil: 'fora do perfil / quer outro perfil',
  indisponivel: 'imóvel indisponível',
  outro: 'outro motivo',
};

type Lead = { id: string; status: string; corretor_phone: string | null; nome: string | null };

async function autorizar(leadId: string): Promise<{ lead: Lead; email: string } | { erro: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return { erro: 'Lead inválido.' };
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return { erro: 'Faça login de novo.' };
  if (!perfil || !perfil.ativo || !podeTela(perfil, 'sdr')) return { erro: 'Sua conta não tem acesso ao SDR.' };
  const { data } = await supabaseAdmin().from('sdr_leads').select('id,status,corretor_phone,nome').eq('id', leadId).maybeSingle();
  const lead = data as Lead | null;
  if (!lead || !lead.corretor_phone) return { erro: 'Lead não encontrado.' };
  if (['arquivado', 'encerrado'].includes(lead.status)) return { erro: 'Este lead já foi encerrado.' };
  if (escopoSdr(perfil) !== 'todos') {
    const cor = await corretorDaPessoa(email);
    if (!cor || fim8(cor.phone).length < 8 || fim8(cor.phone) !== fim8(lead.corretor_phone)) return { erro: 'Este lead não está com você.' };
  }
  return { lead, email };
}

async function n8n(corpo: Record<string, unknown>): Promise<ResAcao> {
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'corretor_lead', ...corpo }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    if (!r.ok) return { ok: false, erro: 'Não consegui registrar agora (' + r.status + '). Tente de novo em instantes.' };
    return j.ok ? { ok: true, msg: j.resposta || 'Registrado.' } : { ok: false, erro: j.resposta || 'Nada foi registrado.' };
  } catch {
    return { ok: false, erro: 'Não consegui registrar agora. Tente de novo em instantes.' };
  }
}

/** Visita feita: visitou, ou visitou e o cliente fez proposta. Vale para a visita já registrada que passou. */
export async function visitaFeita(leadId: string, resultado: string): Promise<ResAcao> {
  if (!['visitou', 'proposta'].includes(resultado)) return { ok: false, erro: 'Escolha como foi a visita.' };
  const a = await autorizar(leadId);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const r = await n8n({ tipo: 'resultado', lead_id: leadId, resultado, corretor_phone: a.lead.corretor_phone, por: a.email });
  if (r.ok) revalidatePath('/sdr');
  return r;
}

/** Arquivar com motivo. O Guilherme recebe o aviso no WhatsApp, como no botão da Eva. */
export async function arquivarLead(leadId: string, motivoK: string, obs: string): Promise<ResAcao> {
  const base = MOTIVOS_ARQUIVO[motivoK];
  if (!base) return { ok: false, erro: 'Escolha o motivo.' };
  const nota = String(obs || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (motivoK === 'outro' && nota.length < 3) return { ok: false, erro: 'Escreva o motivo.' };
  const a = await autorizar(leadId);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const motivo = (motivoK === 'outro' ? nota : base + (nota ? ': ' + nota : '')) + ' (corretor, pelo painel)';
  const r = await n8n({ tipo: 'arquivar', lead_id: leadId, motivo, corretor_phone: a.lead.corretor_phone, por: a.email });
  if (r.ok) revalidatePath('/sdr');
  return r;
}

/** Novo contato: a Eva lembra o corretor no dia e na hora escolhidos (9h às 20h). Nada vai para o cliente. */
export async function novoContato(leadId: string, data: string, hora: string, nota: string): Promise<ResAcao> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'Escolha o dia.' };
  const h = Number(hora);
  if (!Number.isInteger(h) || h < 9 || h > 20) return { ok: false, erro: 'Escolha a hora (9h às 20h).' };
  const quando = new Date(`${data}T${String(h).padStart(2, '0')}:00:00-03:00`);
  if (isNaN(quando.getTime()) || quando.getTime() < Date.now() + 30 * 60e3) return { ok: false, erro: 'Escolha um horário daqui a pelo menos 30 minutos.' };
  if (quando.getTime() > Date.now() + 366 * 864e5) return { ok: false, erro: 'Escolha uma data em até 1 ano.' };
  const a = await autorizar(leadId);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const sb = supabaseAdmin();
  const agora = new Date().toISOString();
  // um lembrete ativo por lead: o novo substitui os que ainda não foram enviados
  await sb.from('sdr_lembretes').update({ cancelado_em: agora, cancelado_motivo: 'substituído por novo contato (painel)' })
    .eq('lead_id', leadId).is('enviado_em', null).is('cancelado_em', null);
  const { error } = await sb.from('sdr_lembretes').insert({
    lead_id: leadId, corretor_phone: a.lead.corretor_phone, lembrar_em: quando.toISOString(), definido_em: agora,
    motivo: String(nota || '').replace(/\s+/g, ' ').trim().slice(0, 300) || null, origem: 'painel',
  });
  if (error) return { ok: false, erro: 'Não consegui salvar agora. Tente de novo em instantes.' };
  revalidatePath('/sdr');
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit' }).format(quando);
  return { ok: true, msg: `Combinado: a Eva te lembra de ${(a.lead.nome || 'o cliente').split(' ')[0]} ${dia}, às ${h}h. Até lá ela não manda nada ao cliente nem te cobra.` };
}
