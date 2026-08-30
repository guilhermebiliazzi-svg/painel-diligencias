import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { somaSplits } from "@/lib/asaas-split";

/**
 * Notas fiscais de comissão.
 *
 * GET  /api/adm/notas-comissao
 *   Lista as cobranças do Asaas já recebidas, com a nota se já houver, e as
 *   notas avulsas. O valor sugerido é a parte da Ville: total menos a soma
 *   dos splits — porque quem tem subconta recebe direto e emite a própria
 *   nota pela parte dele.
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const n = (v: any) => (v == null ? 0 : Number(v) || 0);

/** Status do Asaas que significam dinheiro efetivamente recebido. */
const RECEBIDO = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];

export async function GET() {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  try {
    const [rCob, rNotas] = await Promise.all([
      fetch(
        `${c.url}/rest/v1/asaas_cobrancas?select=id,asaas_payment_id,status,valor,vencimento,link,split,criado_em` +
          `&status=in.(${RECEBIDO.join(",")})&order=criado_em.desc&limit=200`,
        { headers: c.headers, cache: "no-store" }
      ),
      fetch(`${c.url}/rest/v1/adm_notas_comissao?order=created_at.desc&limit=400`, {
        headers: c.headers,
        cache: "no-store",
      }),
    ]);

    if (!rCob.ok) {
      return NextResponse.json(
        { error: "Falha ao carregar as cobranças", detail: await rCob.text() },
        { status: 502 }
      );
    }
    if (!rNotas.ok) {
      return NextResponse.json(
        { error: "Falha ao carregar as notas", detail: await rNotas.text() },
        { status: 502 }
      );
    }

    const notas = (await rNotas.json()) as any[];
    const notaPor: Record<string, any> = {};
    for (const nt of notas) {
      if (nt.asaas_payment_id && nt.status !== "cancelada") notaPor[nt.asaas_payment_id] = nt;
    }

    const cobrancas = ((await rCob.json()) as any[]).map((cb) => {
      const total = n(cb.valor);
      const splits = somaSplits(cb.split);
      return {
        asaas_payment_id: cb.asaas_payment_id,
        status: cb.status,
        vencimento: cb.vencimento,
        link: cb.link,
        valor_cobranca: total,
        valor_splits: splits,
        // a parte da Ville; nunca negativa, mesmo com dado inconsistente
        valor_sugerido: Math.max(0, Math.round((total - splits) * 100) / 100,),
        nota: notaPor[cb.asaas_payment_id] ?? null,
      };
    });

    const avulsas = notas.filter((nt) => nt.origem === "avulsa");

    return NextResponse.json({ cobrancas, avulsas });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
