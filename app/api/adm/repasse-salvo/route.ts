import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RENDER = process.env.RENDER_URL || "https://eva-estudo-render.onrender.com";

// GET /api/adm/repasse-salvo?contrato=8&competencia=2026-08
// Retorna o repasse JÁ GRAVADO desta competência (se existir), com o link do
// recibo salvo e se já foi pago — para a tela abrir o recibo sem regerar.
export async function GET(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  const sp = new URL(req.url).searchParams;
  const contrato = sp.get("contrato");
  const comp = sp.get("competencia"); // YYYY-MM
  if (!contrato || !/^\d+$/.test(contrato))
    return NextResponse.json({ error: "contrato inválido." }, { status: 400 });
  if (!comp || !/^\d{4}-\d{2}$/.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) obrigatória." }, { status: 400 });

  const h = { apikey: KEY, Authorization: `Bearer ${KEY}` } as Record<string, string>;
  try {
    const res = await fetch(
      `${SUPA}/rest/v1/adm_repasses?contrato_id=eq.${Number(contrato)}&competencia=eq.${comp}-01&select=*&limit=1`,
      { headers: h, cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: "Falha ao consultar repasse." }, { status: 502 });
    const rows = (await res.json()) as any[];
    const rep = rows?.[0];
    if (!rep) return NextResponse.json({ exists: false });

    // já pago? data_pagamento preenchida OU pagamento pix efetivado
    let pago = !!rep.data_pagamento;
    if (!pago && rep.id) {
      const pr = await fetch(
        `${SUPA}/rest/v1/adm_pagamentos?tipo=eq.pix_repasse&repasse_id=eq.${rep.id}&status=eq.efetivado&select=id&limit=1`,
        { headers: h, cache: "no-store" }
      );
      if (pr.ok) pago = ((await pr.json()) as any[]).length > 0;
    }

    // link do recibo salvo (via Render, bucket privado)
    let downloadUrl: string | null = null;
    if (rep.id) {
      try {
        const u = await fetch(`${RENDER}/recibo-repasse/${rep.id}/url`, { cache: "no-store" });
        if (u.ok) downloadUrl = (await u.json())?.url || null;
      } catch { /* opcional */ }
    }

    return NextResponse.json({
      exists: true,
      repasse_id: rep.id,
      total_liquido: rep.total_liquido ?? null,
      data_pagamento: rep.data_pagamento ?? null,
      status_envio: rep.status_envio ?? null,
      atualizado_em: rep.atualizado_em ?? rep.updated_at ?? rep.criado_em ?? null,
      pdf_url: rep.pdf_url ?? null,
      download_url: downloadUrl || rep.pdf_url || null,
      pago,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
