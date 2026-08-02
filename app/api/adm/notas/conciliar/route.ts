import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conciliação de NFS-e.
 *
 * Pergunta à Prefeitura, pelo número de RPS reservado, se a nota foi
 * emitida — e grava o desfecho que ficou faltando.
 *
 * Existe porque a emissão pode dar certo na Prefeitura e falhar no
 * registro aqui (timeout, queda, deploy no meio). Sem isso, a nota fica
 * órfã: emitida lá, invisível no painel. Foi o que aconteceu com a 187.
 *
 * Alcança qualquer nota que tenha rps_numero gravado e ainda não esteja
 * como 'emitida' — inclusive as que voltaram para 'a_emitir' por erro,
 * já que "erro ao gravar" e "erro ao emitir" são indistinguíveis daqui.
 *
 * POST /api/adm/notas/conciliar   { competencia? }
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

function linkNota(im: string, numero: string | number, verificacao: string) {
  const cod = String(verificacao || "").replace(/[^A-Za-z0-9]/g, "");
  return (
    `https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx` +
    `?inscricao=${im}&nf=${numero}&verificacao=${cod}`
  );
}

export async function POST(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  const base = process.env.NFSE_RENDER_URL;
  if (!base) {
    return NextResponse.json({ error: "NFSE_RENDER_URL não configurada." }, { status: 500 });
  }

  const im = process.env.NFSE_SP_IM || "69033951";
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* corpo opcional */
  }
  const competencia = body?.competencia; // "YYYY-MM", opcional

  try {
    /* candidatas: têm RPS reservado e não estão como emitida */
    let q =
      `${c.url}/rest/v1/adm_notas_fiscais` +
      `?rps_numero=not.is.null&status=neq.emitida` +
      `&select=id,repasse_id,competencia,rps_serie,rps_numero,status&limit=50`;
    if (competencia && /^\d{4}-\d{2}$/.test(competencia)) {
      q += `&competencia=eq.${competencia}-01`;
    }

    const rCand = await fetch(q, { headers: c.headers, cache: "no-store" });
    if (!rCand.ok) {
      return NextResponse.json(
        { error: "Falha ao listar candidatas", detail: await rCand.text() },
        { status: 502 }
      );
    }
    const candidatas = (await rCand.json()) as any[];
    if (candidatas.length === 0) {
      return NextResponse.json({
        ok: true,
        verificadas: 0,
        recuperadas: 0,
        mensagem: "Nenhuma nota pendente com RPS reservado — nada a conciliar.",
      });
    }

    /* consulta a Prefeitura em uma chamada só */
    const headersRender: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.NFSE_SP_TOKEN) headersRender["x-nfse-token"] = process.env.NFSE_SP_TOKEN;

    const rCons = await fetch(`${base.replace(/\/$/, "")}/nfse-sp/consultar-rps`, {
      method: "POST",
      headers: headersRender,
      body: JSON.stringify({
        chaves: candidatas.map((n) => ({ serie: n.rps_serie, numero: n.rps_numero })),
      }),
      cache: "no-store",
    });
    const cons = await rCons.json().catch(() => null);
    if (!rCons.ok || !cons) {
      return NextResponse.json(
        { error: "Falha ao consultar a Prefeitura", detail: cons },
        { status: 502 }
      );
    }

    /* indexa o retorno por serie|numero */
    const achadas = new Map<string, any>();
    for (const nf of cons.notas || []) {
      if (nf.numeroRps) achadas.set(`${nf.serie || ""}|${Number(nf.numeroRps)}`, nf);
    }

    const recuperadas: any[] = [];
    const semNota: any[] = [];

    for (const cand of candidatas) {
      const achou = achadas.get(`${cand.rps_serie}|${Number(cand.rps_numero)}`);

      if (!achou || !achou.numeroNota) {
        // RPS não virou nota: o envio realmente não chegou. Volta para a fila.
        if (cand.status === "enviando") {
          await fetch(`${c.url}/rest/v1/adm_notas_fiscais?id=eq.${cand.id}`, {
            method: "PATCH",
            headers: { ...c.headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "a_emitir",
              emissao_erro:
                `RPS ${cand.rps_serie} ${cand.rps_numero} não consta na Prefeitura — ` +
                `o envio não chegou. Número queimado; a próxima tentativa usa outro.`,
            }),
            cache: "no-store",
          });
        }
        semNota.push({ repasse_id: cand.repasse_id, rps: `${cand.rps_serie} ${cand.rps_numero}` });
        continue;
      }

      const cancelada = String(achou.status || "").toUpperCase() === "C";
      await fetch(`${c.url}/rest/v1/adm_notas_fiscais?id=eq.${cand.id}`, {
        method: "PATCH",
        headers: { ...c.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          status: cancelada ? "cancelada" : "emitida",
          numero_nota: String(achou.numeroNota),
          codigo_verificacao: achou.codigoVerificacao || null,
          data_emissao: String(achou.dataEmissao || "").slice(0, 10) || null,
          pdf_url: linkNota(im, achou.numeroNota, achou.codigoVerificacao || ""),
          emissao_erro: null,
          enviado_em: new Date().toISOString(),
        }),
        cache: "no-store",
      });

      recuperadas.push({
        repasse_id: cand.repasse_id,
        rps: `${cand.rps_serie} ${cand.rps_numero}`,
        numeroNota: achou.numeroNota,
        situacao: cancelada ? "cancelada" : "emitida",
      });
    }

    return NextResponse.json({
      ok: true,
      verificadas: candidatas.length,
      recuperadas: recuperadas.length,
      sem_nota: semNota.length,
      detalhe: { recuperadas, semNota },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro inesperado", detail: String(e) }, { status: 500 });
  }
}
