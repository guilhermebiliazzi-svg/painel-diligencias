import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista as contas bancárias de um locador/contrato para escolher o destino do
// repasse via Pix.
//   GET /api/adm/contas-bancarias?contrato=30   (ou ?locador=12)
export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const contrato = searchParams.get("contrato");
  const locador = searchParams.get("locador");

  if (!contrato && !locador) {
    return NextResponse.json({ error: "Informe contrato ou locador." }, { status: 400 });
  }

  let q = adm
    .from("adm_contas_bancarias")
    .select("id,contrato_id,imovel_id,locador_id,titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta")
    .order("id");

  // Preferimos a conta específica do contrato; se não houver, cai para as do locador.
  if (contrato) {
    q = q.eq("contrato_id", Number(contrato));
  } else if (locador) {
    q = q.eq("locador_id", Number(locador));
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let contas = data || [];
  // Fallback: contrato sem conta própria → usa as do locador
  if (!contas.length && contrato) {
    const { data: rep } = await adm
      .from("adm_repasses")
      .select("locador_id")
      .eq("contrato_id", Number(contrato))
      .order("competencia", { ascending: false })
      .limit(1);
    const locId = rep?.[0]?.locador_id;
    if (locId) {
      const { data: dl } = await adm
        .from("adm_contas_bancarias")
        .select("id,contrato_id,imovel_id,locador_id,titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta")
        .eq("locador_id", locId)
        .order("id");
      contas = dl || [];
    }
  }

  return NextResponse.json({ contas });
}
