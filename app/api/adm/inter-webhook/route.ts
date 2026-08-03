import { NextResponse } from "next/server";
import { interFetch } from "@/lib/inter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registra/consulta os webhooks de pagamento no Banco Inter (via ponte).
//   GET  /api/adm/inter-webhook            -> consulta os webhooks cadastrados
//   POST /api/adm/inter-webhook            -> (re)registra pix-pagamento e boleto-pagamento
//
// Requer INTER_WEBHOOK_SECRET (compartilhado com a rota de callback) e o escopo
// webhook-banking.write na aplicação Pagamentos (a ponte precisa rotear /webhooks
// para a app PAG).

const TIPOS = ["pix-pagamento", "boleto-pagamento"] as const;

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://painel.villejardins.com.br").replace(/\/+$/, "");
}

export async function GET() {
  const out: Record<string, any> = {};
  for (const t of TIPOS) {
    const r = await interFetch<any>(`/banking/v2/webhooks/${t}`, { method: "GET" });
    out[t] = r.ok ? r.data : { erro: r.error, status: r.status };
  }
  return NextResponse.json({ webhooks: out });
}

export async function POST() {
  const secret = process.env.INTER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INTER_WEBHOOK_SECRET não configurado no painel." }, { status: 500 });
  }
  const resultados: Record<string, any> = {};
  for (const t of TIPOS) {
    const webhookUrl = `${baseUrl()}/api/inter/webhook/${secret}/${t}`;
    const r = await interFetch<any>(`/banking/v2/webhooks/${t}`, { method: "PUT", body: { webhookUrl } });
    resultados[t] = r.ok ? { ok: true, webhookUrl } : { ok: false, erro: r.error, status: r.status };
  }
  return NextResponse.json({ resultados });
}
