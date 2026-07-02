import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista os contratos ativos para o seletor da tela de conferência.
// Roda no servidor: a service key nunca chega ao navegador.
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados." },
      { status: 500 }
    );
  }

  const select =
    "id,valor_atual_aluguel,dia_vencimento," +
    "locatario:adm_locatarios(nome)," +
    "imovel:adm_imoveis(rua,numero,bairro)";
  const endpoint =
    `${url}/rest/v1/adm_contratos?select=${encodeURIComponent(select)}` +
    `&status=eq.ativo&order=id.asc`;

  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Falha ao ler contratos", detail }, { status: 502 });
    }
    const rows = await res.json();

    const contratos = (rows as any[]).map((r) => {
      const im = r.imovel || {};
      const endereco = [im.rua, im.numero, im.bairro].filter(Boolean).join(", ");
      return {
        id: r.id,
        aluguel: Number(r.valor_atual_aluguel ?? 0),
        dia_vencimento: r.dia_vencimento,
        locatario: r.locatario?.nome ?? "—",
        endereco,
        // aluguel 0 = boleto de valor variável/manual (ex.: contrato 31)
        avulso: Number(r.valor_atual_aluguel ?? 0) === 0,
      };
    });

    return NextResponse.json({ contratos });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
