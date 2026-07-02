import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ponte entre a tela e o WF-ADM-02 no n8n.
// O navegador fala só com esta rota (mesma origem); a URL do n8n e
// qualquer credencial ficam no servidor.
export async function POST(req: Request) {
  const n8n = process.env.N8N_WF_ADM_02_URL;
  if (!n8n) {
    return NextResponse.json(
      { error: "N8N_WF_ADM_02_URL não configurado." },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const { modo, contrato_id, competencia } = body || {};
  if (!["calcular", "confirmar"].includes(modo)) {
    return NextResponse.json({ error: "modo deve ser 'calcular' ou 'confirmar'." }, { status: 400 });
  }
  if (!contrato_id || !competencia) {
    return NextResponse.json({ error: "contrato_id e competencia são obrigatórios." }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Opcional: proteja o webhook de produção com um header secreto
    if (process.env.N8N_WEBHOOK_SECRET) headers["x-webhook-secret"] = process.env.N8N_WEBHOOK_SECRET;

    const res = await fetch(n8n, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    // o n8n devolve um array com um item — desembrulha para a tela
    const payload = Array.isArray(data) ? data[0] : data;

    if (!res.ok) {
      return NextResponse.json({ error: "Falha no cálculo", detail: payload }, { status: 502 });
    }
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: "Erro ao chamar o n8n", detail: String(e) }, { status: 502 });
  }
}
