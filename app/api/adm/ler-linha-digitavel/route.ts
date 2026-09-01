import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lerLinhaDigitavelDoPdf } from "@/lib/linha-digitavel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lê a linha digitável do PDF do boleto anexado (IPTU/condomínio) de uma
// competência, para pré-preencher a tela Contas a pagar.
//   GET /api/adm/ler-linha-digitavel?contrato=30&competencia=2026-07&subtipo=condominio
const compRe = /^\d{4}-\d{2}$/;

export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const contrato = searchParams.get("contrato");
  const comp = searchParams.get("competencia");
  const subtipo = String(searchParams.get("subtipo") || "");
  if (!contrato || !/^\d+$/.test(contrato)) return NextResponse.json({ error: "contrato inválido." }, { status: 400 });
  if (!comp || !compRe.test(comp)) return NextResponse.json({ error: "competencia inválida." }, { status: 400 });
  if (!["iptu", "condominio"].includes(subtipo)) return NextResponse.json({ error: "subtipo inválido." }, { status: 400 });

  const tipoDoc = `boleto_${subtipo}`;
  const { data: docs } = await adm
    .from("adm_documentos")
    .select("bucket,path")
    .eq("contrato_id", Number(contrato))
    .eq("competencia", `${comp}-01`)
    .eq("tipo", tipoDoc)
    .limit(1);
  const doc = docs?.[0];
  if (!doc) return NextResponse.json({ linha: null, motivo: "sem boleto anexado" });

  const { data: blob, error } = await adm.storage.from(doc.bucket || "documentos").download(doc.path);
  if (error || !blob) return NextResponse.json({ linha: null, motivo: "falha ao baixar o PDF" });

  const buf = await blob.arrayBuffer();
  const res = await lerLinhaDigitavelDoPdf(buf);
  if (!res) return NextResponse.json({ linha: null, motivo: "não foi possível ler (pode ser PDF escaneado)" });

  return NextResponse.json({
    linha: res.linha,
    tipo: res.tipo,
    vencimento: res.vencimento,
    vencimento_origem: res.vencimento_origem,
    valor: res.valor,
  });
}
