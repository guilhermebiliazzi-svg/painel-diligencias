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
//
// Desvio por número (14/10/2026):
//  - O número +55 11 5192-8192 (phone_number_id 1047751435080046) é a IA de
//    onboarding dos novos corretores. Tudo que chega para ele vai para o fluxo
//    ONB no n8n (N8N_ONB_URL) e NUNCA para a EVA.
//  - Enquanto N8N_ONB_URL não estiver configurada na Vercel, as mensagens desse
//    número são descartadas com 200 (não vão para a EVA nem geram erro na Meta).
//  - A mesma regra de status vale para os dois números.

const N8N_EVA = 'https://villejds.app.n8n.cloud/webhook/6b645b70-61db-4d4d-af47-2f39295cf196/webhook';
const N8N_ONB = process.env.N8N_ONB_URL || '';
const ONB_PHONE_ID = '1047751435080046';
const VERIFY = process.env.WA_VERIFY_TOKEN || 'ville-eva-wa-filtro-2026';
const SO_GRAVAR = new Set(['sent', 'delivered', 'read']);

type Status = { id?: string; status?: string; recipient_id?: string; errors?: { code?: number; title?: string }[] };
type Valor = { statuses?: Status[]; messages?: unknown[]; metadata?: { phone_number_id?: string } };
type Change = { field?: string; value?: Valor };
type Entry = { id?: string; changes?: Change[] };
type Corpo = { object?: string; entry?: Entry[] };

// Verificação do endereço pela Meta (hub.challenge)
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === VERIFY) {
    return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

const ehOnb = (c: Change) => c.value?.metadata?.phone_number_id === ONB_PHONE_ID;

// Analisa um conjunto de changes: quais status só gravar e se precisa repassar ao n8n.
function analisar(changes: Change[]) {
  const gravar: Status[] = [];
  let repassar = false;
  for (const c of changes) {
    const v = c.value ?? {};
    const temOutros = Object.keys(v).some((k) => !['messaging_product', 'metadata', 'statuses', 'contacts'].includes(k));
    if (temOutros || (v.messages && v.messages.length)) repassar = true;
    for (const s of v.statuses ?? []) {
      if (s.status && SO_GRAVAR.has(s.status)) gravar.push(s);
      else repassar = true; // failed e qualquer status novo seguem para o n8n
    }
    if (!v.statuses && !temOutros) repassar = true;
  }
  return { gravar, repassar };
}

// Monta um corpo só com as changes escolhidas, mantendo a estrutura da Meta.
function filtrarCorpo(corpo: Corpo, manter: (c: Change) => boolean): Corpo {
  return {
    ...corpo,
    entry: (corpo.entry ?? [])
      .map((e) => ({ ...e, changes: (e.changes ?? []).filter(manter) }))
      .filter((e) => e.changes.length > 0),
  };
}

async function repassarPara(url: string, req: Request, corpoTexto: string, original: boolean) {
  const cab: Record<string, string> = { 'content-type': req.headers.get('content-type') || 'application/json' };
  // A assinatura da Meta só vale para o corpo original, byte a byte.
  if (original) {
    const sig = req.headers.get('x-hub-signature-256');
    if (sig) cab['x-hub-signature-256'] = sig;
    const sig1 = req.headers.get('x-hub-signature');
    if (sig1) cab['x-hub-signature'] = sig1;
  }
  const r = await fetch(url, { method: 'POST', headers: cab, body: corpoTexto, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error('n8n ' + r.status);
}

export async function POST(req: Request) {
  const bruto = await req.text();
  let corpo: Corpo | null = null;
  try { corpo = JSON.parse(bruto) as Corpo; } catch { corpo = null; }

  // Corpo ilegível: deixa o n8n da EVA decidir (comportamento anterior).
  if (!corpo) {
    try { await repassarPara(N8N_EVA, req, bruto, true); }
    catch (e) { return NextResponse.json({ erro: String(e) }, { status: 502 }); }
    return NextResponse.json({ ok: true, repassado: true });
  }

  const todas = (corpo.entry ?? []).flatMap((e) => e.changes ?? []);
  const changesOnb = todas.filter(ehOnb);
  const changesEva = todas.filter((c) => !ehOnb(c));
  // Sem nenhuma change (evento sem estrutura conhecida): vai para a EVA, como antes.
  const semChanges = todas.length === 0;

  const eva = analisar(changesEva);
  const onb = analisar(changesOnb);
  if (semChanges) eva.repassar = true;

  // 1) Grava os status sent/delivered/read dos dois números.
  const gravar = [...eva.gravar, ...onb.gravar];
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

  const misturado = changesOnb.length > 0 && (changesEva.length > 0 || semChanges);

  // 2) EVA: sempre o corpo original, byte a byte, com a assinatura da Meta —
  //    exatamente como antes. (Se vier misturado com o número ONB, o que é raro,
  //    a EVA recebe o corpo inteiro para não arriscar a validação da assinatura.)
  if (eva.repassar) {
    try {
      await repassarPara(N8N_EVA, req, bruto, true);
    } catch (e) {
      return NextResponse.json({ erro: 'eva: ' + String(e) }, { status: 502 });
    }
  }

  // 3) ONB: só as changes do número de onboarding. Sem URL configurada, descarta.
  let onbRepassado = false;
  if (onb.repassar && N8N_ONB) {
    try {
      if (!misturado && changesEva.length === 0) await repassarPara(N8N_ONB, req, bruto, true);
      else await repassarPara(N8N_ONB, req, JSON.stringify(filtrarCorpo(corpo, ehOnb)), false);
      onbRepassado = true;
    } catch (e) {
      return NextResponse.json({ erro: 'onb: ' + String(e) }, { status: 502 });
    }
  }

  return NextResponse.json({
    ok: true,
    gravados: gravar.length,
    repassado: eva.repassar,
    onb: onb.repassar ? (onbRepassado ? 'repassado' : 'descartado (N8N_ONB_URL ausente)') : 'nada',
  });
}
