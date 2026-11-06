// Envio de mensagens do Max (5192-8192) a partir do painel, pelo n8n.
// (Saiu de app/treinamento/actions.ts para ser usado também pelo contrato.)
import { supabaseAdmin } from '@/lib/supabase/admin';

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/onb-painel-enviar';
// Chave combinada com o n8n (nó "Conferir envio do painel"), guardada na Vercel.
const CHAVE = process.env.ONB_PAINEL_CHAVE || '';
export const JANELA_MS = (23 * 60 + 50) * 60 * 1000;
export const LIMITE_TEXTO = 1000;


// Texto do modelo: a Meta não aceita quebra de linha, tab ou 4+ espaços nos parâmetros.
const limpaModelo = (s: string) =>
  s.replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean).join(' | ').replace(/\s{2,}/g, ' ').replace(/\t/g, ' ');

type Meta = { messages?: { id?: string }[]; error?: { message?: string; error_data?: { details?: string } } };

export async function enviarUm(n: { id: string; nome: string; phone: string }, texto: string, janela: boolean) {
  const primeiro = n.nome.split(' ')[0];
  const payload = janela
    ? { messaging_product: 'whatsapp', to: n.phone, type: 'text', text: { body: texto } }
    : {
        messaging_product: 'whatsapp', to: n.phone, type: 'template',
        template: {
          name: 'onb_aviso', language: { code: 'pt_BR' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: primeiro }, { type: 'text', text: limpaModelo(texto).slice(0, LIMITE_TEXTO) }] }],
        },
      };
  if (!CHAVE) return { ok: false as const, erro: 'falta configurar ONB_PAINEL_CHAVE na Vercel' };
  let j: Meta = {};
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE },
      body: JSON.stringify({ payload }),
      cache: 'no-store',
    });
    j = (await r.json().catch(() => ({}))) as Meta;
    if (!r.ok && !j.error) return { ok: false as const, erro: `o n8n respondeu ${r.status}` };
  } catch {
    return { ok: false as const, erro: 'o n8n não respondeu' };
  }
  const wamid = j.messages?.[0]?.id;
  if (!wamid) return { ok: false as const, erro: j.error?.error_data?.details || j.error?.message || 'a Meta não confirmou o envio' };
  // Registra o que o novato recebeu (no modelo, a Meta monta o texto a partir do onb_aviso).
  await supabaseAdmin().from('onb_mensagens').insert({
    novato_id: n.id, phone: n.phone, direcao: 'out',
    tipo: janela ? 'painel' : 'painel_modelo',
    texto: janela ? texto : limpaModelo(texto).slice(0, LIMITE_TEXTO),
    wa_message_id: wamid,
  });
  return { ok: true as const };
}

// O novato escreveu nas últimas 23h50? (janela de 24h da Meta aberta → texto livre)
export async function janelaAberta(phone: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const { count } = await supabaseAdmin().from('onb_mensagens').select('id', { count: 'exact', head: true })
    .eq('phone', phone).eq('direcao', 'in').gte('criado_em', desde);
  return (count ?? 0) > 0;
}
