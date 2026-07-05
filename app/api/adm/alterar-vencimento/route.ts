import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Altera o vencimento de um boleto emitido no Banco Inter (WF-ADM-07).
// O Inter edita o MESMO boleto (mesma linha digitável), só muda a data.
// Se o Inter aceitar, a nova data é gravada na base (fica sincronizado).
// POST /api/adm/alterar-vencimento  body: { cobranca_id: number, nova_data: "AAAA-MM-DD" }
export async function POST(req: Request) {
  const n8n = process.env.N8N_WF_ADM_07_URL;
  if (!n8n) {
    return NextResponse.json({ error: "N8N_WF_ADM_07_URL não configurado." }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const id = body?.cobranca_id;
  const novaData = body?.nova_data;
  if (!id || typeof id !== "number") {
    return NextResponse.json({ error: "cobranca_id é obrigatório." }, { status: 400 });
  }
  if (!novaData || !/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
    return NextResponse.json({ error: "nova_data (AAAA-MM-DD) é obrigatória." }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.N8N_WEBHOOK_SECRET) headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET;

    const res = await fetch(n8n, {
      method: "POST",
      headers,
      body: JSON.stringify({ cobranca_id: id, nova_data: novaData }),
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
      return NextResponse.json({ error: "Falha ao alterar vencimento", detail: payload }, { status: 502 });
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    const msg = e?.name === "TimeoutError"
      ? "Tempo esgotado ao falar com o n8n/ponte (pode estar hibernando — tente de novo)."
      : String(e);
    return NextResponse.json({ error: "Erro ao chamar o n8n", detail: msg }, { status: 502 });
  }
}
