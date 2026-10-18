'use server';

// Mensagem manual pela Eva, a partir da tela do lead. O painel só diz o lead, o tipo de
// destinatário e o texto; o telefone é resolvido no n8n a partir do banco (sdr-painel-acao,
// acao enviar_mensagem) — não há como a mensagem sair para um número digitado.
import { exigirSdrGestao } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ResultadoMsg = { ok: boolean; msg?: string; erro?: string };
export type DestinoTipo = 'cliente' | 'corretor' | 'parceiro';

const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';

export async function enviarMensagemEva(leadId: string, destino: DestinoTipo, texto: string, imovelId?: string): Promise<ResultadoMsg> {
  const eu = await exigirSdrGestao();
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return { ok: false, erro: 'Lead inválido.' };
  if (!['cliente', 'corretor', 'parceiro'].includes(destino)) return { ok: false, erro: 'Escolha o destinatário.' };
  const t = String(texto ?? '').replace(/\r/g, '').trim();
  if (!t) return { ok: false, erro: 'Escreva a mensagem.' };
  if (t.length > 900) return { ok: false, erro: 'Mensagem longa demais (máx. 900 caracteres).' };
  const { data: lead } = await supabaseAdmin().from('sdr_leads').select('id').eq('id', leadId).maybeSingle();
  if (!lead) return { ok: false, erro: 'Lead não encontrado.' };
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'enviar_mensagem', lead_id: leadId, destino, texto: t, imovel_id: imovelId ?? '', por: eu.email }),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string; message?: string };
    if (!r.ok) return { ok: false, erro: 'A Eva não respondeu (' + r.status + '). Nada foi enviado.' };
    const resposta = String(j.resposta ?? '').trim();
    return j.ok ? { ok: true, msg: resposta || 'Enviada.' } : { ok: false, erro: resposta || 'Não saiu. Nada foi enviado.' };
  } catch {
    return { ok: false, erro: 'A Eva não respondeu. Nada foi enviado — tente de novo em instantes.' };
  }
}
