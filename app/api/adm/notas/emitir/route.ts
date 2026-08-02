import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Emissão de NFS-e da taxa de administração — uma nota por requisição.
 *
 * Fluxo:
 *   1. lê o repasse em adm_v_notas e valida o que pode barrar
 *   2. reserva o próximo número de RPS (adm_proximo_rps, atômico)
 *   3. grava a nota como 'enviando' com o número já reservado
 *   4. chama o Render, que assina e envia à Prefeitura
 *   5. grava 'emitida' com número e código, ou volta para 'a_emitir'
 *      registrando o erro
 *
 * O número de RPS fica gravado mesmo em falha: número queimado é visível
 * em vez de ser reutilizado às cegas.
 *
 * POST /api/adm/notas/emitir  { repasse_id, teste? }
 */

const SERIE = "VJ01";

/**
 * Link direto para a nota no portal da Prefeitura.
 * O web service não devolve o PDF — só número e código de verificação —
 * então o melhor que dá para fazer é montar o endereço da página de
 * impressão, que abre a nota em um clique.
 * O código vai SEM hífen: "LHDC-NUU9" na nota vira "LHDCNUU9" na URL.
 */
function linkNota(im: string, numero: string | number, verificacao: string) {
  const cod = String(verificacao || "").replace(/[^A-Za-z0-9]/g, "");
  return (
    `https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx` +
    `?inscricao=${im}&nf=${numero}&verificacao=${cod}`
  );
}

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const n = (v: any) => (v == null ? 0 : Number(v) || 0);

/** Data de hoje em São Paulo (o servidor roda em UTC). */
function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Discriminação no mesmo formato das notas emitidas manualmente:
 *   "Taxa de Administração de locação do imóvel:"
 *   "<endereço completo do imóvel>"
 * A quebra de linha vira pipe no módulo do Render (tpDiscriminacao).
 */
function montarDiscriminacao(imovel: string | null) {
  return `Taxa de Administração de locação do imóvel:\n${imovel || ""}`.trim();
}

export async function POST(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  const base = process.env.NFSE_RENDER_URL;
  if (!base) {
    return NextResponse.json(
      { error: "NFSE_RENDER_URL não configurada (URL do serviço no Render)." },
      { status: 500 }
    );
  }

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
  const teste = body?.teste === true;

  try {
    /* ---------------------------------------------------------- */
    /* 1. lê a linha e valida                                       */
    /* ---------------------------------------------------------- */
    const rLinha = await fetch(
      `${c.url}/rest/v1/adm_v_notas?repasse_id=eq.${repasse_id}&limit=1`,
      { headers: c.headers, cache: "no-store" }
    );
    if (!rLinha.ok) {
      return NextResponse.json(
        { error: "Falha ao ler o repasse", detail: await rLinha.text() },
        { status: 502 }
      );
    }
    const linha = ((await rLinha.json()) as any[])[0];
    if (!linha) {
      return NextResponse.json({ error: `Repasse #${repasse_id} não encontrado.` }, { status: 404 });
    }

    if (linha.status_nota === "emitida") {
      return NextResponse.json(
        { error: `Já existe nota emitida (nº ${linha.numero_nota}) para este repasse.` },
        { status: 409 }
      );
    }
    if (linha.status_nota === "enviando") {
      return NextResponse.json(
        { error: "Esta nota está em envio. Aguarde ou verifique o resultado antes de repetir." },
        { status: 409 }
      );
    }

    const valor = n(linha.taxa_adm_valor);
    if (!(valor > 0)) {
      return NextResponse.json(
        { error: "Taxa de administração zerada — não há serviço a faturar (erro 303)." },
        { status: 400 }
      );
    }

    const doc = String(linha.locador_doc || "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) {
      return NextResponse.json(
        { error: `Locador sem CPF/CNPJ válido: "${linha.locador}". Complete o cadastro antes de emitir.` },
        { status: 400 }
      );
    }
    // tomador PJ exige endereço (erros 317 e 318)
    const end = linha.tomador_endereco || null;
    if (doc.length === 14 && !(end && end.logradouro)) {
      return NextResponse.json(
        { error: `Tomador PJ ("${linha.locador}") exige endereço no cadastro do locador.` },
        { status: 400 }
      );
    }

    /* ---------------------------------------------------------- */
    /* 2. a nota tem que sair dentro do mês da competência          */
    /* ---------------------------------------------------------- */
    const dataEmissao = hojeSP();
    const mesCompetencia = String(linha.competencia).slice(0, 7);
    const mesHoje = dataEmissao.slice(0, 7);
    if (mesHoje !== mesCompetencia) {
      return NextResponse.json(
        {
          error:
            `A nota precisa ser emitida dentro do mês da competência. ` +
            `Competência ${mesCompetencia}, hoje ${mesHoje}. ` +
            `Emissão bloqueada para não gerar fato gerador em mês errado.`,
        },
        { status: 400 }
      );
    }

    /* ---------------------------------------------------------- */
    /* 3. reserva o número de RPS (atômico no banco)                */
    /* ---------------------------------------------------------- */
    const rNum = await fetch(`${c.url}/rest/v1/rpc/adm_proximo_rps`, {
      method: "POST",
      headers: { ...c.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_serie: SERIE }),
      cache: "no-store",
    });
    if (!rNum.ok) {
      return NextResponse.json(
        { error: "Falha ao reservar número de RPS", detail: await rNum.text() },
        { status: 502 }
      );
    }
    const numeroRps = Number(await rNum.json());
    if (!numeroRps) {
      return NextResponse.json({ error: "Número de RPS inválido." }, { status: 502 });
    }

    /* ---------------------------------------------------------- */
    /* 4. grava 'enviando' com o número já reservado                */
    /* ---------------------------------------------------------- */
    const gravar = (campos: any) =>
      fetch(`${c.url}/rest/v1/adm_notas_fiscais?on_conflict=repasse_id`, {
        method: "POST",
        headers: {
          ...c.headers,
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          repasse_id,
          contrato_id: linha.contrato_id,
          locador_id: linha.locador_id,
          competencia: linha.competencia,
          valor_servico: valor,
          base_recebida: n(linha.total_recebido),
          rps_serie: SERIE,
          rps_numero: numeroRps,
          rps_data_emissao: dataEmissao,
          ...campos,
        }),
        cache: "no-store",
      });

    if (!teste) await gravar({ status: "enviando", emissao_erro: null });

    /* ---------------------------------------------------------- */
    /* 5. chama o Render                                            */
    /* ---------------------------------------------------------- */
    const headersRender: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.NFSE_SP_TOKEN) headersRender["x-nfse-token"] = process.env.NFSE_SP_TOKEN;

    let resultado: any = null;
    let erroRede: string | null = null;
    try {
      const rEmitir = await fetch(`${base.replace(/\/$/, "")}/nfse-sp/emitir`, {
        method: "POST",
        headers: headersRender,
        body: JSON.stringify({
          serie: SERIE,
          numero: numeroRps,
          dataEmissao,
          valorServicos: valor,
          tomadorDoc: doc,
          tomadorNome: linha.locador,
          tomadorEmail: linha.locador_email || undefined,
          tomadorEndereco: end || undefined,
          discriminacao: montarDiscriminacao(linha.imovel),
          teste,
        }),
        cache: "no-store",
      });
      resultado = await rEmitir.json().catch(() => null);
      if (!rEmitir.ok && !resultado) erroRede = `HTTP ${rEmitir.status}`;
    } catch (e: any) {
      erroRede = String((e && e.message) || e);
    }

    /* ---------------------------------------------------------- */
    /* 6. grava o desfecho                                          */
    /* ---------------------------------------------------------- */
    if (teste) {
      // teste não grava nada — devolve o diagnóstico e libera o número
      return NextResponse.json({
        teste: true,
        rps: { serie: SERIE, numero: numeroRps },
        dataEmissao,
        resultado,
        aviso: "Número de RPS consumido pelo contador. Ajuste adm_rps_serie se for repetir.",
      });
    }

    if (erroRede || !resultado || resultado.sucesso !== true) {
      const motivo =
        erroRede ||
        (resultado?.erros || []).map((e: any) => `${e.codigo}: ${e.descricao}`).join(" · ") ||
        "falha desconhecida";
      await gravar({ status: "a_emitir", emissao_erro: motivo.slice(0, 1000) });
      return NextResponse.json(
        {
          ok: false,
          erro: motivo,
          rps: { serie: SERIE, numero: numeroRps },
          detalhe: resultado?.erros || null,
        },
        { status: 200 }
      );
    }

    const nota = (
      await (
        await gravar({
          status: "emitida",
          numero_nota: resultado.numeroNota,
          codigo_verificacao: resultado.codigoVerificacao,
          pdf_url: linkNota(
            process.env.NFSE_SP_IM || "69033951",
            resultado.numeroNota,
            resultado.codigoVerificacao
          ),
          data_emissao: dataEmissao,
          emissao_erro: null,
          enviado_em: new Date().toISOString(),
        })
      ).json()
    )[0];

    return NextResponse.json({
      ok: true,
      numeroNota: resultado.numeroNota,
      codigoVerificacao: resultado.codigoVerificacao,
      link: linkNota(
        process.env.NFSE_SP_IM || "69033951",
        resultado.numeroNota,
        resultado.codigoVerificacao
      ),
      rps: { serie: SERIE, numero: numeroRps },
      dataEmissao,
      alertas: resultado.alertas || [],
      nota,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro inesperado", detail: String(e) }, { status: 500 });
  }
}
