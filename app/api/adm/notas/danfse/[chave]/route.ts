import { NextResponse } from "next/server";
import { headersRender } from "@/lib/nfse-nacional";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PDF oficial da NFS-e (DANFSe) emitida pelo Emissor Nacional.
 *
 * O ADN só entrega o PDF com o certificado da empresa (TLS mútuo), que fica
 * no Render. O link gravado em pdf_url aponta para cá; esta rota pede o PDF
 * ao Render e repassa ao navegador.
 *
 * GET /api/adm/notas/danfse/<chave de acesso, 50 dígitos>
 */
export async function GET(_req: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  const ch = String(chave || "").replace(/\D/g, "");
  if (ch.length !== 50) {
    return NextResponse.json({ error: "Chave de acesso inválida (são 50 dígitos)." }, { status: 400 });
  }
  const base = process.env.NFSE_RENDER_URL;
  if (!base) return NextResponse.json({ error: "NFSE_RENDER_URL não configurada." }, { status: 500 });

  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/nfse-nacional/danfse/${ch}`, {
      headers: headersRender(),
      cache: "no-store",
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      return new NextResponse(
        `Não foi possível obter o PDF da nota agora (${d?.error || `HTTP ${r.status}`}). ` +
          `Tente de novo em alguns minutos ou consulte em https://www.nfse.gov.br/ConsultaPublica com a chave ${ch}.`,
        { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    const pdf = await r.arrayBuffer();
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="NFSe-${ch.slice(-12)}.pdf"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro ao buscar o PDF", detail: String(e) }, { status: 502 });
  }
}
