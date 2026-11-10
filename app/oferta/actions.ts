'use server';
// 09/11: o corretor responde à oferta de lead pelo app (mesmo caminho do SIM/NÃO no WhatsApp: SDR-12 → SDR-02).
import { exigirPerfil, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';
const f8 = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '').slice(-8);

export async function responderOferta(id: string, resposta: 'sim' | 'nao'): Promise<{ ok: boolean; texto: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['sim', 'nao'].includes(resposta)) return { ok: false, texto: 'Pedido inválido.' };
  const perfil = await exigirPerfil();
  const cor = await corretorDaPessoa(perfil.email);
  const { data: atr } = await supabaseAdmin().from('sdr_atribuicoes').select('id,lead_id,corretor_phone,resposta,prazo_em').eq('id', id).maybeSingle();
  if (!atr) return { ok: false, texto: 'Oferta não encontrada.' };
  if (!cor?.phone || f8(cor.phone) !== f8(atr.corretor_phone)) return { ok: false, texto: 'Esta oferta é de outro corretor.' };
  if (atr.resposta) return { ok: false, texto: 'Esta oferta já foi respondida.' };
  if (atr.prazo_em && new Date(atr.prazo_em).getTime() < Date.now()) return { ok: false, texto: 'O prazo de 15 minutos acabou e o lead foi para o próximo corretor.' };
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'responder_oferta', lead_id: atr.lead_id, atribuicao_id: atr.id, corretor_phone: atr.corretor_phone, resposta, por: perfil.email }),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    if (r.ok && j.ok) return { ok: true, texto: j.resposta || (resposta === 'sim' ? 'Lead assumido. Os dados do cliente foram para o seu WhatsApp.' : 'Certo, o lead vai para o próximo corretor.') };
    return { ok: false, texto: j.resposta || 'A Eva não confirmou. Responda pelo WhatsApp, por favor.' };
  } catch {
    return { ok: false, texto: 'Não consegui falar com a Eva. Responda pelo WhatsApp, por favor.' };
  }
}
