import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Classifica os contratos ativos de uma competência em: pronto / aguardando / gravada.
// Agrega também a composição (aluguel / condomínio / IPTU / outros) das cobranças gravadas,
// somando apenas itens no_boleto=true — assim as colunas fecham com o Total.
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
    let linhas = (await res.json()) as any[];

    // composição por cobrança (só itens que entram no boleto)
    const ids = linhas.map((l) => l.cobranca_id).filter((id) => id != null);
    if (ids.length > 0) {
      const rIt = await fetch(
        `${url}/rest/v1/adm_cobranca_itens?cobranca_id=in.(${ids.join(",")})&no_boleto=eq.true&select=cobranca_id,categoria,valor`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
      );
      if (rIt.ok) {
        const itens = (await rIt.json()) as { cobranca_id: number; categoria: string; valor: number }[];
        const porCob: Record<number, { aluguel: number; condominio: number; iptu: number; outros: number }> = {};
        for (const it of itens) {
          const c = (porCob[it.cobranca_id] ||= { aluguel: 0, condominio: 0, iptu: 0, outros: 0 });
          const v = Number(it.valor) || 0;
          if (it.categoria === "aluguel") c.aluguel += v;
          else if (it.categoria === "condominio") c.condominio += v;
          else if (it.categoria === "iptu") c.iptu += v;
          else c.outros += v; // seguros, taxa (IRRF), desconto, multa, outro…
        }
        for (const k of Object.keys(porCob)) {
          const c = porCob[Number(k)];
          c.aluguel = Math.round(c.aluguel * 100) / 100;
          c.condominio = Math.round(c.condominio * 100) / 100;
          c.iptu = Math.round(c.iptu * 100) / 100;
          c.outros = Math.round(c.outros * 100) / 100;
        }
        linhas = linhas.map((l) =>
          l.cobranca_id != null && porCob[l.cobranca_id] ? { ...l, comp: porCob[l.cobranca_id] } : { ...l, comp: null }
        );
      } else {
        linhas = linhas.map((l) => ({ ...l, comp: null }));
      }
    }

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
