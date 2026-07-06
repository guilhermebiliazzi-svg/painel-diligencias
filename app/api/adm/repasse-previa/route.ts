import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET /api/adm/repasse-previa?contrato=8&competencia=2026-07
export async function GET(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  const sp = new URL(req.url).searchParams;
  const contrato = sp.get("contrato");
  const comp = sp.get("competencia"); // YYYY-MM
  if (!contrato || !/^\d+$/.test(contrato))
    return NextResponse.json({ error: "contrato inválido." }, { status: 400 });
  if (!comp || !/^\d{4}-\d{2}$/.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) obrigatória." }, { status: 400 });

  try {
    const res = await fetch(`${SUPA}/rest/v1/rpc/adm_previa_repasse`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_contrato_id: Number(contrato), p_competencia: `${comp}-01` }),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Falha ao calcular prévia", detail: await res.text() }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}

// lista os contratos (para o seletor)
export async function POST(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  try {
    const sel = "id,adm_locatarios(nome),adm_imoveis(rua,numero,bairro)";
    const res = await fetch(
      `${SUPA}/rest/v1/adm_contratos?status=eq.ativo&select=${encodeURIComponent(sel)}&order=id.asc`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: "Falha ao listar contratos" }, { status: 502 });
    const arr = (await res.json()) as any[];
    const contratos = arr.map((c) => ({
      id: c.id,
      locatario: c.adm_locatarios?.nome || "—",
      endereco: c.adm_imoveis ? `${c.adm_imoveis.rua}, ${c.adm_imoveis.numero}` : "",
    }));
    return NextResponse.json({ contratos });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
