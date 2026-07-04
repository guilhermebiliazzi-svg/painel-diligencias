import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lê uma cobrança JÁ GRAVADA (com itens e despesa) e devolve no mesmo
// formato "Previa" que a tela /cobrancas/nova entende — para o botão
// "Revisar" abrir com os dados gravados em vez de tela vazia.
// GET /api/adm/cobranca-gravada?contrato=30&competencia=2026-07
export async function GET(req: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const contrato = searchParams.get("contrato");
  const comp = searchParams.get("competencia"); // "YYYY-MM"
  if (!contrato || !/^\d+$/.test(contrato)) {
    return NextResponse.json({ error: "contrato é obrigatório." }, { status: 400 });
  }
  if (!comp || !/^\d{4}-\d{2}$/.test(comp)) {
    return NextResponse.json({ error: "competencia (YYYY-MM) é obrigatória." }, { status: 400 });
  }
  const competenciaData = `${comp}-01`;

  const h = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // 1) cobrança gravada da competência
    const rCob = await fetch(
      `${url}/rest/v1/adm_cobrancas?contrato_id=eq.${contrato}&competencia=eq.${competenciaData}` +
        `&select=id,contrato_id,competencia,vencimento,total,status,multa_percentual,mora_percentual&limit=1`,
      { headers: h, cache: "no-store" }
    );
    if (!rCob.ok) {
      const detail = await rCob.text();
      return NextResponse.json({ error: "Falha ao buscar cobrança", detail }, { status: 502 });
    }
    const cobs = (await rCob.json()) as any[];
    if (!cobs.length) {
      // não há cobrança gravada — a tela segue o fluxo normal (vazio)
      return NextResponse.json({ gravada: false });
    }
    const cob = cobs[0];

    // 2) itens da cobrança (na ordem gravada)
    const rIt = await fetch(
      `${url}/rest/v1/adm_cobranca_itens?cobranca_id=eq.${cob.id}` +
        `&select=descricao,valor,categoria,no_boleto,ordem&order=ordem.asc`,
      { headers: h, cache: "no-store" }
    );
    const itensRaw = rIt.ok ? ((await rIt.json()) as any[]) : [];
    // a composição exibida é a do boleto (no_boleto=true); itens fora do boleto
    // (ex.: IPTU deduzido do repasse) não entram na tabela de composição
    const itens = itensRaw
      .filter((i) => i.no_boleto)
      .map((i) => ({ descricao: i.descricao, valor: Number(i.valor), categoria: i.categoria }));

    // 3) despesa da competência (valores brutos p/ preencher os campos editáveis)
    const rDesp = await fetch(
      `${url}/rest/v1/adm_despesas?contrato_id=eq.${contrato}&competencia=eq.${competenciaData}` +
        `&select=condominio,extraordinaria,iptu,descricao_extras,valor_avulso,descricao_avulso&limit=1`,
      { headers: h, cache: "no-store" }
    );
    const desps = rDesp.ok ? ((await rDesp.json()) as any[]) : [];
    const d = desps[0] || {};
    const despesa = {
      condominio: d.condominio != null ? Number(d.condominio) : undefined,
      extraordinaria: d.extraordinaria != null ? Number(d.extraordinaria) : undefined,
      iptu: d.iptu != null ? Number(d.iptu) : undefined,
      extra_desc: d.descricao_extras || undefined,
      valor_avulso: d.valor_avulso != null ? Number(d.valor_avulso) : undefined,
      descricao_avulso: d.descricao_avulso || undefined,
    };

    return NextResponse.json({
      gravada: true,
      cobranca_id: cob.id,
      total: Number(cob.total),
      vencimento: cob.vencimento,
      status: cob.status,
      multa_percentual: cob.multa_percentual != null ? Number(cob.multa_percentual) : undefined,
      mora_percentual: cob.mora_percentual != null ? Number(cob.mora_percentual) : undefined,
      itens,
      despesa,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
