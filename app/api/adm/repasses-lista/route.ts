import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET /api/adm/repasses-lista?competencia=2026-10
// Uma linha por contrato (ativos + qualquer um com boleto/repasse na competência):
// situação do boleto do inquilino e situação do repasse ao proprietário.
export async function GET(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  const comp = new URL(req.url).searchParams.get("competencia"); // YYYY-MM
  if (!comp || !/^\d{4}-\d{2}$/.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) obrigatória." }, { status: 400 });
  const dia = `${comp}-01`;
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}` } as Record<string, string>;
  const get = async (path: string) => {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: h, cache: "no-store" });
    if (!r.ok) throw new Error(`${path.split("?")[0]}: ${await r.text()}`);
    return (await r.json()) as any[];
  };

  try {
    const [cobrancas, repasses, pagamentos] = await Promise.all([
      get(`adm_cobrancas?competencia=eq.${dia}&select=id,contrato_id,vencimento,total,status_pgto,situacao_inter,data_recebimento,data_situacao,valor_recebido,valor_total_pago&order=id.desc`),
      get(`adm_repasses?competencia=eq.${dia}&select=id,contrato_id,total_liquido,data_pagamento,updated_at`),
      get(`adm_pagamentos?tipo=eq.pix_repasse&competencia=eq.${dia}&select=id,repasse_id,contrato_id,status,valor,atualizado_em,criado_em&order=id.desc`),
    ]);

    const extras = [...new Set([...cobrancas, ...repasses].map((x) => Number(x.contrato_id)).filter(Boolean))];
    const sel = encodeURIComponent("id,status,adm_locatarios(nome),adm_imoveis(rua,numero,complemento,adm_locadores(nome))");
    const filtro = extras.length ? `or=(status.eq.ativo,id.in.(${extras.join(",")}))` : "status=eq.ativo";
    const contratos = await get(`adm_contratos?${filtro}&select=${sel}&order=id.asc`);

    // boleto: prefere o não cancelado mais recente
    const cobPor = new Map<number, any>();
    for (const c of cobrancas) {
      const atual = cobPor.get(c.contrato_id);
      const cancel = String(c.situacao_inter || "").toUpperCase() === "CANCELADO";
      if (!atual || (String(atual.situacao_inter || "").toUpperCase() === "CANCELADO" && !cancel)) cobPor.set(c.contrato_id, c);
    }
    const repPor = new Map<number, any>(repasses.map((r) => [Number(r.contrato_id), r]));
    const pixPor = new Map<number, any[]>();
    for (const p of pagamentos) {
      const k = Number(p.contrato_id);
      pixPor.set(k, [...(pixPor.get(k) || []), p]);
    }

    const linhas = contratos.map((k) => {
      const im = k.adm_imoveis || {};
      const cob = cobPor.get(k.id) || null;
      const rep = repPor.get(k.id) || null;
      const pixes = (pixPor.get(k.id) || []).filter((p) => !rep || !p.repasse_id || p.repasse_id === rep.id);
      const pixOk = pixes.find((p) => p.status === "efetivado");
      const pixUlt = pixes[0] || null;

      let repasse: "pago" | "aguardando_aprovacao" | "erro" | "recibo_gerado" | "pendente" = "pendente";
      if (rep?.data_pagamento || pixOk) repasse = "pago";
      else if (pixUlt?.status === "aguardando_aprovacao" || pixUlt?.status === "submetido") repasse = "aguardando_aprovacao";
      else if (pixUlt?.status === "erro") repasse = "erro";
      else if (rep) repasse = "recibo_gerado";

      return {
        contrato_id: k.id,
        contrato_status: k.status,
        locatario: k.adm_locatarios?.nome || "—",
        proprietario: im.adm_locadores?.nome || "—",
        endereco: [im.rua, im.numero].filter(Boolean).join(", ") + (im.complemento ? `, ${im.complemento}` : ""),
        boleto: cob,
        repasse,
        repasse_id: rep?.id ?? null,
        total_liquido: rep?.total_liquido ?? null,
        repassado_em: rep?.data_pagamento || (pixOk ? String(pixOk.atualizado_em || pixOk.criado_em || "").slice(0, 10) : null),
      };
    });

    return NextResponse.json({ competencia: comp, linhas });
  } catch (e: any) {
    return NextResponse.json({ error: "Falha ao listar repasses", detail: String(e?.message || e) }, { status: 502 });
  }
}
