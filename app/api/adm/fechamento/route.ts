import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Classifica os contratos ativos de uma competência em: pronto / aguardando / gravada.
// GET /api/adm/fechamento?competencia=2026-07
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const comp = searchParams.get("competencia"); // "YYYY-MM"
  if (!comp || !/^\d{4}-\d{2}$/.test(comp)) {
    return NextResponse.json({ error: "competencia (YYYY-MM) é obrigatória." }, { status: 400 });
  }
  const competenciaData = `${comp}-01`;

  try {
    const res = await fetch(`${url}/rest/v1/rpc/adm_fechamento_competencia`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_competencia: competenciaData }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Falha ao classificar", detail }, { status: 502 });
    }
    const linhas = (await res.json()) as any[];

    const resumo = {
      total: linhas.length,
      gravadas: linhas.filter((l) => l.estado === "gravada").length,
      prontas: linhas.filter((l) => l.estado === "pronto").length,
      aguardando: linhas.filter((l) => l.estado === "aguardando").length,
    };

    return NextResponse.json({ competencia: comp, resumo, linhas });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
