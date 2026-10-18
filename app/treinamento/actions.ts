'use server';

// Mensagens do Guilherme para os novatos, enviadas pelo número do Max (5192-8192).
// Quem envia de fato é o fluxo "ONB – Entrada" no n8n (webhook onb-painel-enviar),
// que só repassa à Meta com a credencial do WhatsApp. O painel decide o formato:
//  - novato escreveu nas últimas 23h50 → texto livre (janela de 24h aberta);
//  - fora da janela → modelo aprovado onb_aviso ({{1}} = primeiro nome, {{2}} = texto).
// Cada envio fica registrado em onb_mensagens (tipo "painel" ou "painel_modelo"),
// então aparece na conversa do painel e entra no histórico que o Max lê.
import { revalidatePath } from 'next/cache';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/onb-painel-enviar';
// Chave combinada com o n8n (nó "Conferir envio do painel"), guardada na Vercel.
const CHAVE = process.env.ONB_PAINEL_CHAVE || '';
const JANELA_MS = (23 * 60 + 50) * 60 * 1000;
const LIMITE_TEXTO = 1000;

export type ResultadoEnvio = { ok: boolean; enviados: string[]; falhas: { nome: string; erro: string }[] };

// Texto do modelo: a Meta não aceita quebra de linha, tab ou 4+ espaços nos parâmetros.
const limpaModelo = (s: string) =>
  s.replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean).join(' | ').replace(/\s{2,}/g, ' ').replace(/\t/g, ' ');

type Meta = { messages?: { id?: string }[]; error?: { message?: string; error_data?: { details?: string } } };

async function enviarUm(n: { id: string; nome: string; phone: string }, texto: string, janela: boolean) {
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

export async function enviarMensagem(ids: string[], textoBruto: string): Promise<ResultadoEnvio> {
  await exigirTela('treinamento');
  const texto = String(textoBruto ?? '').trim();
  const lista = [...new Set((ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))))];
  if (!texto) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: 'Escreva a mensagem.' }] };
  if (texto.length > LIMITE_TEXTO) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: `Mensagem longa demais (máx. ${LIMITE_TEXTO} caracteres).` }] };
  if (!lista.length) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: 'Escolha pelo menos um corretor.' }] };

  const sb = supabaseAdmin();
  const { data: novatos, error } = await sb.from('onb_novatos').select('id,nome,phone').in('id', lista);
  if (error) return { ok: false, enviados: [], falhas: [{ nome: '—', erro: error.message }] };

  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const res: ResultadoEnvio = { ok: true, enviados: [], falhas: [] };
  for (const n of (novatos ?? []) as { id: string; nome: string; phone: string }[]) {
    const { count } = await sb.from('onb_mensagens').select('id', { count: 'exact', head: true })
      .eq('phone', n.phone).eq('direcao', 'in').gte('criado_em', desde);
    const r = await enviarUm(n, texto, (count ?? 0) > 0);
    if (r.ok) res.enviados.push(n.nome);
    else res.falhas.push({ nome: n.nome, erro: r.erro });
  }
  res.ok = res.falhas.length === 0;
  revalidatePath('/treinamento');
  for (const id of lista) revalidatePath(`/treinamento/${id}`);
  return res;
}
