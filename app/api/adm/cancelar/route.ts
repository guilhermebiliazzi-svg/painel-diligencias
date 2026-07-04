import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispara o cancelamento de um boleto no Banco Inter (WF-ADM-06).
// O workflow consulta a situação atual no Inter e BLOQUEIA se já estiver pago;
// se cancelar, a cobrança volta para 'a_emitir' mantendo a composição.
// POST /api/adm/cancelar  body: { cobranca_id: number }
export async function POST(req: Request) {
  const n8n = process.env.N8N_WF_ADM_06_URL;
  if (!n8n) {
    return NextResponse.json({ error: "N8N_WF_ADM_06_URL não configurado." }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const id = body?.cobranca_id;
  if (!id || typeof id !== "number") {
    return NextResponse.json({ error: "cobranca_id é obrigatório." }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.N8N_WEBHOOK_SECRET) headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET;

    const res = await fetch(n8n, {
      method: "POST",
      headers,
      body: JSON.stringify({ cobranca_id: id }),
      cache: "no-store",
      signal: AbortSignal.timeout(120000),
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    const payload = Array.isArray(data) ? data[0] : data;
    if (!res.ok) {
      return NextResponse.json({ error: "Falha no cancelamento", detail: payload }, { status: 502 });
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    const msg = e?.name === "TimeoutError"
      ? "Tempo esgotado ao falar com o n8n/ponte (pode estar hibernando — tente de novo)."
      : String(e);
    return NextResponse.json({ error: "Erro ao chamar o n8n", detail: msg }, { status: 502 });
  }
}
