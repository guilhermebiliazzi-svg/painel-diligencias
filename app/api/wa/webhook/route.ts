import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook do WhatsApp (Meta) da Eva — filtro antes do n8n (11/10/2026).
//
// Por quê: 92% das execuções do fluxo EVA no n8n eram só avisos de status
// (enviada / entregue / lida), ~19 mil execuções por mês, estourando a cota.
//
// Regra:
//  - status "sent", "delivered", "read": grava direto em sdr_wa_status e NÃO vai ao n8n;
//  - qualquer outra coisa (mensagens de clientes/corretores, status "failed", eventos
//    desconhecidos): repassa o corpo original, byte a byte, com a assinatura da Meta,
//    para o gatilho do WhatsApp da EVA no n8n — que segue tratando tudo como antes.
// Se o repasse ao n8n falhar, responde erro para a Meta tentar de novo.

const N8N_EVA = 'https://villejds.app.n8n.cloud/webhook/6b645b70-61db-4d4d-af47-2f39295cf196/webhook';
const VERIFY = process.env.WA_VERIFY_TOKEN || 'ville-eva-wa-filtro-2026';
const SO_GRAVAR = new Set(['sent', 'delivered', 'read']);

type Status = { id?: string; status?: string; recipient_id?: string; errors?: { code?: number; title?: string }[] };
type Valor = { statuses?: Status[]; messages?: unknown[] };
type Corpo = { object?: string; entry?: { changes?: { field?: string; value?: Valor }[] }[] };

// Verificação do endereço pela Meta (hub.challenge)
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const bruto = await req.text();
  let corpo: Corpo | null = null;
  try { corpo = JSON.parse(bruto) as Corpo; } catch { corpo = null; }

  const gravar: Status[] = [];
  let repassar = !corpo; // corpo ilegível: deixa o n8n decidir
  for (const e of corpo?.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value ?? {};
      const temOutros = Object.keys(v).some((k) => !['messaging_product', 'metadata', 'statuses', 'contacts'].includes(k));
      if (temOutros || (v.messages && v.messages.length)) repassar = true;
      for (const s of v.statuses ?? []) {
        if (s.status && SO_GRAVAR.has(s.status)) gravar.push(s);
        else repassar = true; // failed e qualquer status novo seguem para o n8n
      }
      if (!v.statuses && !temOutros) repassar = true;
    }
  }

  if (gravar.length) {
    const sb = supabaseAdmin();
    for (const s of gravar) {
      if (!s.id || !s.status) continue;
      const { error } = await sb.from('sdr_wa_status').insert({
        wa_message_id: s.id, status: s.status,
        erro_codigo: s.errors?.[0]?.code != null ? String(s.errors[0].code) : null,
        erro_titulo: s.errors?.[0]?.title ?? null,
        destinatario: s.recipient_id ?? null,
      });
      // duplicado (a Meta reenvia o mesmo status) não é erro
      if (error && error.code !== '23505') {
        return NextResponse.json({ erro: 'gravar status: ' + error.message }, { status: 500 });
      }
    }
  }

  if (repassar) {
    const cab: Record<string, string> = { 'content-type': req.headers.get('content-type') || 'application/json' };
    const sig = req.headers.get('x-hub-signature-256');
    if (sig) cab['x-hub-signature-256'] = sig;
    const sig1 = req.headers.get('x-hub-signature');
    if (sig1) cab['x-hub-signature'] = sig1;
    try {
      const r = await fetch(N8N_EVA, { method: 'POST', headers: cab, body: bruto, signal: AbortSignal.timeout(9000) });
      if (!r.ok) return NextResponse.json({ erro: 'n8n ' + r.status }, { status: 502 });
    } catch (e) {
      return NextResponse.json({ erro: 'n8n: ' + String(e) }, { status: 502 });
    }
  }

  return NextResponse.json({ ok: true, gravados: gravar.length, repassado: repassar });
}
