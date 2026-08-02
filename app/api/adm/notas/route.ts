import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notas fiscais da taxa de administração.
 *
 * Âncora: adm_repasses (1 por contrato/competência, só existe do que foi
 * recebido). A view adm_v_notas traz todo repasse com a nota se já houver;
 * adm_v_faturamento agrega o faturamento por competência.
 *
 * GET  /api/adm/notas?competencia=2026-07
 * POST /api/adm/notas   { repasse_id, status, numero_nota, data_emissao, ... }
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const n = (v: any) => (v == null ? 0 : Number(v) || 0);

/* ------------------------------------------------------------------ */
/* GET — linhas da competência + faturamento + série histórica         */
/* ------------------------------------------------------------------ */
export async function GET(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const comp = searchParams.get("competencia"); // "YYYY-MM"
  if (!comp || !/^\d{4}-\d{2}$/.test(comp)) {
    return NextResponse.json({ error: "competencia (YYYY-MM) é obrigatória." }, { status: 400 });
  }
  const competenciaData = `${comp}-01`;

  try {
    const [rLinhas, rFat] = await Promise.all([
      fetch(
        `${c.url}/rest/v1/adm_v_notas?competencia=eq.${competenciaData}&order=locador.asc,contrato_id.asc`,
        { headers: c.headers, cache: "no-store" }
      ),
      fetch(`${c.url}/rest/v1/adm_v_faturamento?order=competencia.desc&limit=12`, {
        headers: c.headers,
        cache: "no-store",
      }),
    ]);

    if (!rLinhas.ok) {
      const detail = await rLinhas.text();
      return NextResponse.json({ error: "Falha ao carregar as notas", detail }, { status: 502 });
    }

    const linhas = ((await rLinhas.json()) as any[]).map((l) => ({
      ...l,
      total_recebido: n(l.total_recebido),
      taxa_adm_valor: n(l.taxa_adm_valor),
      taxa_percentual: l.taxa_percentual == null ? null : Number(l.taxa_percentual),
    }));

    // série histórica (mais antiga → mais recente, para o gráfico)
    const serieBruta = rFat.ok ? ((await rFat.json()) as any[]) : [];
    const serie = serieBruta
      .map((f) => ({
        competencia: String(f.competencia).slice(0, 7),
        qtd_contratos: n(f.qtd_contratos),
        total_recebido: n(f.total_recebido),
        faturamento_adm: n(f.faturamento_adm),
        faturamento_com_nota: n(f.faturamento_com_nota),
        faturamento_sem_nota: n(f.faturamento_sem_nota),
        notas_emitidas: n(f.notas_emitidas),
        notas_pendentes: n(f.notas_pendentes),
      }))
      .reverse();

    const faturamento =
      serie.find((s) => s.competencia === comp) || {
        competencia: comp,
        qtd_contratos: 0,
        total_recebido: 0,
        faturamento_adm: 0,
        faturamento_com_nota: 0,
        faturamento_sem_nota: 0,
        notas_emitidas: 0,
        notas_pendentes: 0,
      };

    // acumulado do ano da competência selecionada
    const ano = comp.slice(0, 4);
    const acumulado_ano = serie
      .filter((s) => s.competencia.startsWith(ano))
      .reduce((a, s) => a + s.faturamento_adm, 0);

    return NextResponse.json({ competencia: comp, faturamento, acumulado_ano, serie, linhas });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}

/* ------------------------------------------------------------------ */
/* POST — registra / atualiza / desfaz o registro da nota              */
/* ------------------------------------------------------------------ */
export async function POST(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const repasse_id = Number(body?.repasse_id);
  if (!repasse_id) {
    return NextResponse.json({ error: "repasse_id é obrigatório." }, { status: 400 });
  }

  const status = String(body?.status || "emitida");
  const validos = ["a_emitir", "emitida", "cancelada", "dispensada"];
  if (!validos.includes(status)) {
    return NextResponse.json({ error: `status inválido: ${status}` }, { status: 400 });
  }

  const numero_nota = (body?.numero_nota ?? "").toString().trim() || null;
  const codigo_verificacao = (body?.codigo_verificacao ?? "").toString().trim() || null;
  const data_emissao = (body?.data_emissao ?? "").toString().trim() || null;
  const pdf_url = (body?.pdf_url ?? "").toString().trim() || null;
  const observacao = (body?.observacao ?? "").toString().trim() || null;

  // espelha o CHECK do banco, mas com mensagem legível
  if (status === "emitida" && (!numero_nota || !data_emissao)) {
    return NextResponse.json(
      { error: "Para marcar como emitida, informe o número da nota e a data de emissão." },
      { status: 400 }
    );
  }
  if (data_emissao && !/^\d{4}-\d{2}-\d{2}$/.test(data_emissao)) {
    return NextResponse.json({ error: "data_emissao deve ser AAAA-MM-DD." }, { status: 400 });
  }

  try {
    // "a_emitir" = desfazer o registro: apaga a linha e volta ao estado limpo
    if (status === "a_emitir") {
      const del = await fetch(
        `${c.url}/rest/v1/adm_notas_fiscais?repasse_id=eq.${repasse_id}`,
        { method: "DELETE", headers: c.headers, cache: "no-store" }
      );
      if (!del.ok) {
        const detail = await del.text();
        return NextResponse.json({ error: "Falha ao desfazer", detail }, { status: 502 });
      }
      return NextResponse.json({ ok: true, desfeito: true });
    }

    // busca o repasse para congelar os valores na nota
    const rRep = await fetch(
      `${c.url}/rest/v1/adm_repasses?id=eq.${repasse_id}&select=id,contrato_id,locador_id,competencia,total_recebido,taxa_adm_valor`,
      { headers: c.headers, cache: "no-store" }
    );
    if (!rRep.ok) {
      const detail = await rRep.text();
      return NextResponse.json({ error: "Falha ao ler o repasse", detail }, { status: 502 });
    }
    const rep = ((await rRep.json()) as any[])[0];
    if (!rep) {
      return NextResponse.json({ error: `Repasse #${repasse_id} não encontrado.` }, { status: 404 });
    }

    const payload = {
      repasse_id,
      contrato_id: rep.contrato_id,
      locador_id: rep.locador_id,
      competencia: rep.competencia,
      valor_servico: n(rep.taxa_adm_valor),
      base_recebida: n(rep.total_recebido),
      status,
      numero_nota,
      codigo_verificacao,
      data_emissao,
      pdf_url,
      observacao,
    };

    const up = await fetch(`${c.url}/rest/v1/adm_notas_fiscais?on_conflict=repasse_id`, {
      method: "POST",
      headers: {
        ...c.headers,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!up.ok) {
      const detail = await up.text();
      return NextResponse.json({ error: "Falha ao gravar a nota", detail }, { status: 502 });
    }

    const nota = ((await up.json()) as any[])[0] || null;
    return NextResponse.json({ ok: true, nota });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
