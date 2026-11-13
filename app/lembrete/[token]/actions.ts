'use server';

// 13/11: lembrete do corretor ("Lembrar mais tarde" no acompanhamento da Eva). Pausa o lead sem mensagem ao
// cliente: enquanto o lembrete estiver ativo, a Eva não faz follow-up com o cliente nem cobra o corretor.
// Na data, a Eva lembra só o corretor. Link público de uso único (token), válido por 7 dias.
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ResLembrete = { ok: boolean; msg?: string; erro?: string };

export async function definirLembrete(token: string, data: string, motivo: string): Promise<ResLembrete> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, erro: 'Link inválido.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'Escolha a data.' };
  // lembrete às 9h (São Paulo) do dia escolhido
  const quando = new Date(data + 'T09:00:00-03:00');
  const amanha = Date.now() + 12 * 3600e3;
  if (isNaN(quando.getTime()) || quando.getTime() < amanha) return { ok: false, erro: 'Escolha uma data a partir de amanhã.' };
  if (quando.getTime() > Date.now() + 366 * 864e5) return { ok: false, erro: 'Escolha uma data em até 1 ano.' };
  const sb = supabaseAdmin();
  const { data: lk } = await sb.from('sdr_lembretes').select('id,lead_id,definido_em,token_expira_em,cancelado_em').eq('token', token).maybeSingle();
  const l = lk as { id: string; lead_id: string; definido_em: string | null; token_expira_em: string; cancelado_em: string | null } | null;
  if (!l || l.cancelado_em) return { ok: false, erro: 'Link inválido.' };
  if (l.definido_em) return { ok: false, erro: 'Este lembrete já foi marcado por este link.' };
  if (new Date(l.token_expira_em).getTime() < Date.now()) return { ok: false, erro: 'Este link expirou. Toque de novo em "Lembrar mais tarde" na próxima mensagem da Eva.' };
  const agora = new Date().toISOString();
  // um lembrete ativo por lead: os anteriores ainda não enviados são substituídos por este
  await sb.from('sdr_lembretes').update({ cancelado_em: agora, cancelado_motivo: 'substituído por novo lembrete' })
    .eq('lead_id', l.lead_id).neq('id', l.id).is('enviado_em', null).is('cancelado_em', null).not('lembrar_em', 'is', null);
  const { error } = await sb.from('sdr_lembretes').update({
    lembrar_em: quando.toISOString(), definido_em: agora, motivo: motivo.trim().slice(0, 300) || null,
  }).eq('id', l.id).is('definido_em', null);
  if (error) return { ok: false, erro: 'Não consegui salvar agora. Tente de novo em instantes.' };
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(quando);
  return { ok: true, msg: `Combinado. A Eva te lembra deste cliente em ${dia}, às 9h. Até lá ela não manda nada ao cliente.` };
}
