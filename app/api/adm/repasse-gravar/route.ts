import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// POST /api/adm/repasse-gravar
// body: { contrato_id, competencia (YYYY-MM), dados: {...} }
export async function POST(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }

  const contrato = body?.contrato_id;
  const comp = body?.competencia; // YYYY-MM
  const dados = body?.dados;
  if (!contrato || !/^\d+$/.test(String(contrato)))
    return NextResponse.json({ error: "contrato_id inválido." }, { status: 400 });
  if (!comp || !/^\d{4}-\d{2}$/.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) obrigatória." }, { status: 400 });
  if (!dados || typeof dados !== "object")
    return NextResponse.json({ error: "dados obrigatórios." }, { status: 400 });

  try {
    const res = await fetch(`${SUPA}/rest/v1/rpc/adm_gravar_repasse`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_contrato_id: Number(contrato),
        p_competencia: `${comp}-01`,
        p_dados: dados,
      }),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Falha ao gravar", detail: await res.text() }, { status: 502 });
    const data = await res.json();
    if (data?.erro) return NextResponse.json({ error: data.erro }, { status: 400 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
