import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RENDER = process.env.RENDER_URL || "https://eva-estudo-render.onrender.com";

// POST /api/adm/repasse-recibo
// body: { contrato_id, competencia (YYYY-MM), dados }
// 1) grava o snapshot conferido (adm_gravar_repasse)
// 2) chama o Render para gerar o PDF e subir ao Storage
// 3) devolve o pdf_url + um link assinado para baixar
export async function POST(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }

  const contrato = body?.contrato_id;
  const comp = body?.competencia;
  const dados = body?.dados;
  if (!contrato || !/^\d+$/.test(String(contrato)))
    return NextResponse.json({ error: "contrato_id inválido." }, { status: 400 });
  if (!comp || !/^\d{4}-\d{2}$/.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) obrigatória." }, { status: 400 });
  if (!dados || typeof dados !== "object")
    return NextResponse.json({ error: "dados obrigatórios." }, { status: 400 });

  try {
    // 1) grava o snapshot
    const gravaRes = await fetch(`${SUPA}/rest/v1/rpc/adm_gravar_repasse`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_contrato_id: Number(contrato), p_competencia: `${comp}-01`, p_dados: dados }),
      cache: "no-store",
    });
    if (!gravaRes.ok) return NextResponse.json({ error: "Falha ao gravar repasse", detail: await gravaRes.text() }, { status: 502 });
    const grava = await gravaRes.json();
    if (grava?.erro) return NextResponse.json({ error: grava.erro }, { status: 400 });
    const repasseId = grava?.repasse_id;

    // 2) chama o Render para gerar o PDF
    const genRes = await fetch(`${RENDER}/recibo-repasse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contrato_id: Number(contrato), competencia: `${comp}-01` }),
    });
    const gen = await genRes.json();
    if (!genRes.ok) return NextResponse.json({ error: "Falha ao gerar recibo", detail: gen }, { status: 502 });

    // 3) link assinado para baixar (bucket privado)
    let downloadUrl: string | null = null;
    if (repasseId) {
      try {
        const urlRes = await fetch(`${RENDER}/recibo-repasse/${repasseId}/url`, { cache: "no-store" });
        if (urlRes.ok) downloadUrl = (await urlRes.json())?.url || null;
      } catch { /* link é opcional */ }
    }

    return NextResponse.json({ ok: true, repasse_id: repasseId, pdf_url: gen?.pdf_url, download_url: downloadUrl });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
