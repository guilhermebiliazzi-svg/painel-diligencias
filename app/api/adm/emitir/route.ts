import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dispara a emissão de boletos no Banco Inter (WF-ADM-03).
// POST /api/adm/emitir  body: { cobranca_ids: number[] }
export async function POST(req: Request) {
  const n8n = process.env.N8N_WF_ADM_03_URL;
  if (!n8n) {
    return NextResponse.json({ error: "N8N_WF_ADM_03_URL não configurado." }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const ids = body?.cobranca_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "cobranca_ids é obrigatório." }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.N8N_WEBHOOK_SECRET) headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET;

    const res = await fetch(n8n, {
      method: "POST",
      headers,
      body: JSON.stringify({ cobranca_ids: ids }),
      cache: "no-store",
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
      return NextResponse.json({ error: "Falha na emissão", detail: payload }, { status: 502 });
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: "Erro ao chamar o n8n", detail: String(e) }, { status: 502 });
  }
}
