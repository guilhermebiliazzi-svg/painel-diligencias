import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Baixa o PDF oficial do boleto do Banco Inter (via ponte) a partir da cobrança.
// O Inter devolve { pdf: "<base64>" }; aqui decodificamos e servimos como PDF.
// GET /api/adm/boleto-pdf?cobranca=33          → abre inline (visualizar/imprimir)
// GET /api/adm/boleto-pdf?cobranca=33&dl=1     → força download do arquivo
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ponteBase = process.env.PONTE_INTER_URL || "https://ponte-inter-api.onrender.com";
  const ponteAuth = process.env.PONTE_INTER_TOKEN; // ex.: Ville2026
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  }
  if (!ponteAuth) {
    return NextResponse.json({ error: "PONTE_INTER_TOKEN não configurado." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const cobranca = searchParams.get("cobranca");
  const forcarDownload = searchParams.get("dl") === "1";
  if (!cobranca || !/^\d+$/.test(cobranca)) {
    return NextResponse.json({ error: "cobranca é obrigatória." }, { status: 400 });
  }

  try {
    // 1) buscar codigo_solicitacao + dados para nomear o arquivo
    const rCob = await fetch(
      `${url}/rest/v1/adm_cobrancas?id=eq.${cobranca}` +
        `&select=id,contrato_id,competencia,codigo_solicitacao,status&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!rCob.ok) {
      const detail = await rCob.text();
      return NextResponse.json({ error: "Falha ao buscar cobrança", detail }, { status: 502 });
    }
    const cobs = (await rCob.json()) as any[];
    if (!cobs.length) {
      return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
    }
    const cob = cobs[0];
    if (!cob.codigo_solicitacao) {
      return NextResponse.json(
        { error: "Esta cobrança ainda não foi emitida no Inter (sem código de solicitação)." },
        { status: 409 }
      );
    }

    // 2) chamar a ponte no mesmo padrão do WF-ADM-03: ?auth=...&path=<encoded>
    const interPath = `/cobranca/v3/cobrancas/${cob.codigo_solicitacao}/pdf`;
    const ponteUrl = `${ponteBase}?auth=${encodeURIComponent(ponteAuth)}&path=${encodeURIComponent(
      interPath
    )}`;

    const rPonte = await fetch(ponteUrl, {
      method: "GET",
      cache: "no-store",
      // a ponte no Render (free) hiberna; damos folga no tempo
      signal: AbortSignal.timeout(90000),
    });

    const texto = await rPonte.text();
    if (!rPonte.ok) {
      return NextResponse.json(
        { error: "A ponte do Inter retornou erro", status: rPonte.status, detail: texto.slice(0, 400) },
        { status: 502 }
      );
    }

    // 3) extrair o base64 do PDF (o Inter devolve { pdf: "JVBER..." })
    let base64: string | null = null;
    try {
      const j = JSON.parse(texto);
      base64 = j?.pdf || j?.pdfBase64 || j?.data || null;
    } catch {
      // caso a ponte um dia devolva o base64 cru
      base64 = texto.trim().startsWith("JVBER") ? texto.trim() : null;
    }
    if (!base64 || !base64.startsWith("JVBER")) {
      return NextResponse.json(
        { error: "Resposta da ponte não contém um PDF válido.", detail: texto.slice(0, 200) },
        { status: 502 }
      );
    }

    const pdf = Buffer.from(base64, "base64");
    const comp = String(cob.competencia || "").slice(0, 7); // YYYY-MM
    const nomeArquivo = `boleto-contrato-${cob.contrato_id}-${comp}.pdf`;
    const disposition = forcarDownload ? "attachment" : "inline";

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${nomeArquivo}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    const msg = e?.name === "TimeoutError" ? "Tempo esgotado ao falar com a ponte do Inter (ela pode estar hibernando — tente de novo)." : String(e);
    return NextResponse.json({ error: "Erro ao obter o boleto", detail: msg }, { status: 502 });
  }
}
