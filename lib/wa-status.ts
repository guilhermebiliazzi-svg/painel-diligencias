// 29/10: status de entrega/leitura do WhatsApp nas conversas do painel.
// - sdr_wa_status: todos os status que o WhatsApp devolve (gravados pelo webhook /api/wa/webhook).
// - eva_envios: id de cada resposta da Eva enviada pelo n8n (desde 29/10), para ligar o texto do
//   histórico (n8n_chat_histories, que não guarda id nem horário) ao status e ao horário exato.
import type { supabaseAdmin } from '@/lib/supabase/admin';
type SupabaseClient = ReturnType<typeof supabaseAdmin>;

const ORDEM: Record<string, number> = { failed: 0, sent: 1, delivered: 2, read: 3 };
export const ST_TXT: Record<string, string> = { failed: 'não entregue', sent: 'enviada', delivered: 'entregue', read: 'lida' };

export type EnvioEva = { wa_message_id: string; texto: string | null; enviado_em: string; usado?: boolean };

/** Status mais avançado de cada mensagem (lida > entregue > enviada > não entregue). */
export async function statusDasMensagens(sb: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wids = [...new Set(ids.filter((x): x is string => !!x))];
  const st = new Map<string, string>();
  for (let i = 0; i < wids.length; i += 200) {
    const { data } = await sb.from('sdr_wa_status').select('wa_message_id,status').in('wa_message_id', wids.slice(i, i + 200));
    for (const s of (data ?? []) as { wa_message_id: string; status: string }[]) {
      const a = st.get(s.wa_message_id);
      if (!a || (ORDEM[s.status] ?? -1) > (ORDEM[a] ?? -1)) st.set(s.wa_message_id, s.status);
    }
  }
  return st;
}

/** Respostas da Eva enviadas para um telefone (pelos 8 últimos dígitos). */
export async function enviosDaEva(sb: SupabaseClient, fim8: string, desdeIso?: string): Promise<EnvioEva[]> {
  if (fim8.length !== 8) return [];
  let q = sb.from('eva_envios').select('wa_message_id,texto,enviado_em').like('telefone', '%' + fim8);
  if (desdeIso) q = q.gte('enviado_em', desdeIso);
  const { data } = await q.order('enviado_em', { ascending: true }).limit(600);
  return (data ?? []) as EnvioEva[];
}

// Compara sem formatação (a resposta enviada passa por limpeza de * e espaços antes de sair).
const norm = (s: string | null | undefined) => String(s ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Acha o envio correspondente a uma resposta do histórico (mesmo texto, depois da mensagem que a originou). */
export function casarEnvio(envios: EnvioEva[], texto: string, depoisDe: number | null): EnvioEva | null {
  const t = norm(texto);
  if (!t) return null;
  const min = depoisDe == null ? 0 : depoisDe - 10 * 60e3;
  for (const e of envios) {
    if (e.usado) continue;
    if (new Date(e.enviado_em).getTime() < min) continue;
    const x = norm(e.texto);
    if (x === t || (x.length >= 30 && t.length >= 30 && x.slice(0, 80) === t.slice(0, 80))) { e.usado = true; return e; }
  }
  return null;
}

/** Texto do status para exibir; undefined quando não há id (mensagem sem rastreio). */
export function rotuloStatus(st: Map<string, string>, wid: string | null | undefined, erro = false): string | undefined {
  if (!wid) return erro ? 'não saiu' : undefined;
  return ST_TXT[st.get(wid) ?? ''] ?? 'enviada';
}

/**
 * Mensagens enviadas a um telefone que não estão em sdr_mensagens nem em eva_envios (ex.: respostas da Eva
 * de antes de 29/10). Só têm id, horário e status — servem para casar pelo horário com a resposta do histórico.
 */
export async function mensagensAvulsas(sb: SupabaseClient, fim8: string, desdeIso: string | undefined, conhecidos: (string | null | undefined)[]): Promise<EnvioEva[]> {
  if (fim8.length !== 8) return [];
  const ja = new Set(conhecidos.filter((x): x is string => !!x));
  let q = sb.from('sdr_wa_status').select('wa_message_id,recebido_em').like('destinatario', '%' + fim8);
  q = q.gte('recebido_em', desdeIso ?? new Date(Date.now() - 90 * 864e5).toISOString());
  const { data } = await q.order('recebido_em', { ascending: true }).limit(2000);
  const prim = new Map<string, string>();
  for (const r of (data ?? []) as { wa_message_id: string; recebido_em: string }[]) {
    if (ja.has(r.wa_message_id)) continue;
    const a = prim.get(r.wa_message_id);
    if (!a || r.recebido_em < a) prim.set(r.wa_message_id, r.recebido_em);
  }
  return [...prim.entries()].map(([wa_message_id, enviado_em]) => ({ wa_message_id, texto: null, enviado_em })).sort((a, b) => a.enviado_em.localeCompare(b.enviado_em));
}

/** Casa pelo horário: primeira mensagem avulsa enviada até 10 min depois da mensagem que a Eva respondeu. */
export function casarAvulsa(avulsas: EnvioEva[], depoisDe: number | null): EnvioEva | null {
  if (depoisDe == null) return null;
  for (const e of avulsas) {
    if (e.usado) continue;
    const t = new Date(e.enviado_em).getTime();
    if (t < depoisDe - 60e3) continue;
    if (t > depoisDe + 10 * 60e3) return null;
    e.usado = true; return e;
  }
  return null;
}
