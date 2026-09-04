import { NextResponse } from "next/server";
import { montarDiscriminacao, ladoDoTomador, type Operacao } from "@/lib/discriminacao-comissao";
import { somaSplits } from "@/lib/asaas-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel -> Render (cold start) -> mTLS -> Prefeitura. Com o padrão de 10s a
// função morre DEPOIS de a nota sair e o desfecho não é gravado.
export const maxDuration = 60;

/**
 * Emissão de NFS-e de comissão (corretagem).
 *
 * Uma cobrança pode virar VÁRIAS notas — a comissão pode ser dividida entre
 * dois tomadores em qualquer proporção, ou recair sobre um só. A única regra
 * é a soma das notas vivas não ultrapassar a parte da Ville (total da cobrança
 * menos os splits, porque quem tem subconta recebe direto e emite a própria).
 *
 * POST /api/adm/notas-comissao/emitir
 *   { origem, asaas_payment_id?, operacao_id?, tomador:{...},
 *     valor_servico, codigo_servico?, discriminacao?, teste? }
 */

const SERIE = "VJ01";
const CODIGO_CORRETAGEM = "06297";

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const n = (v: any) => (v == null ? 0 : Number(v) || 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const origem = String(body?.origem || "asaas");
  if (!["asaas", "avulsa"].includes(origem)) {
    return NextResponse.json({ error: "origem deve ser 'asaas' ou 'avulsa'." }, { status: 400 });
  }
  const asaas_payment_id = String(body?.asaas_payment_id || "").trim() || null;
  if (origem === "asaas" && !asaas_payment_id) {
    return NextResponse.json(
      { error: "asaas_payment_id é obrigatório quando a nota nasce de um recebimento." },
      { status: 400 }
    );
  }

  const tom = body?.tomador || {};
  const tomadorNome = String(tom.nome || "").trim();
  const tomadorDoc = dig(tom.doc);
  if (!tomadorNome) return NextResponse.json({ error: "Nome do tomador é obrigatório." }, { status: 400 });
  if (tomadorDoc.length !== 11 && tomadorDoc.length !== 14) {
    return NextResponse.json({ error: "CPF/CNPJ do tomador inválido." }, { status: 400 });
  }
  const tomadorEndereco = tom.endereco || null;
  // tomador PJ exige endereço no RPS (erros 317 e 318 da Prefeitura)
  if (tomadorDoc.length === 14 && !(tomadorEndereco && tomadorEndereco.logradouro)) {
    return NextResponse.json(
      { error: `Tomador PJ ("${tomadorNome}") exige endereço.` },
      { status: 400 }
    );
  }

  const valor = r2(n(body?.valor_servico));
  if (!(valor > 0)) {
    return NextResponse.json({ error: "valor_servico deve ser maior que zero." }, { status: 400 });
  }
  const teste = body?.teste === true;
  const operacao_id = body?.operacao_id ? Number(body.operacao_id) : null;

  try {
    /* ---------------------------------------------------------- */
    /* 1. teto: a soma das notas vivas não passa da parte da Ville */
    /* ---------------------------------------------------------- */
    let valorCobranca: number | null = null;
    let valorSplits: number | null = null;
    // quando a comissão é parcelada, cada parcela vira uma nota e o texto
    // precisa dizer qual delas é
    let parcelamento: { parcela: number; total: number } | null = null;
    // Uma tentativa que a Prefeitura recusou fica gravada com status 'a_emitir'
    // e sem numero_nota. Ela NAO e nota viva: nao ocupa o teto da cobranca e
    // nao pode bloquear uma nova tentativa. Reaproveitamos a propria linha em
    // vez de criar outra, senao cada recusa deixaria um fantasma na lista.
    let idReaproveitar: number | null = null;

    if (origem === "asaas") {
      const rCob = await fetch(
        `${c.url}/rest/v1/asaas_cobrancas?asaas_payment_id=eq.${asaas_payment_id}&select=valor,split,parcela,total_parcelas&limit=1`,
        { headers: c.headers, cache: "no-store" }
      );
      if (!rCob.ok) {
        return NextResponse.json(
          { error: "Falha ao ler a cobrança", detail: await rCob.text() },
          { status: 502 }
        );
      }
      const cob = ((await rCob.json()) as any[])[0];
      if (!cob) {
        return NextResponse.json({ error: `Cobrança ${asaas_payment_id} não encontrada.` }, { status: 404 });
      }
      valorCobranca = r2(n(cob.valor));
      valorSplits = r2(somaSplits(cob.split));
      if (n(cob.total_parcelas) > 1) {
        parcelamento = { parcela: n(cob.parcela) || 1, total: n(cob.total_parcelas) };
      }
      const parteVille = r2(valorCobranca - valorSplits);

      const rJa = await fetch(
        `${c.url}/rest/v1/adm_notas_comissao?asaas_payment_id=eq.${asaas_payment_id}` +
          `&status=neq.cancelada&select=id,status,valor_servico,tomador_doc,numero_nota,created_at,updated_at`,
        { headers: c.headers, cache: "no-store" }
      );
      const doPagamento = rJa.ok ? ((await rJa.json()) as any[]) : [];
      // mesma regra da listagem: recusada pela Prefeitura, ou envio que morreu
      // no meio (status 'enviando' parado ha mais de 10 min)
      const recusada = (x: any) => {
        if (x.numero_nota) return false;
        if (x.status === "a_emitir") return true;
        if (x.status === "enviando") {
          const t = Date.parse(x.updated_at || x.created_at || "");
          return Number.isFinite(t) && Date.now() - t > 10 * 60 * 1000;
        }
        return false;
      };
      const jaEmitidas = doPagamento.filter((x) => !recusada(x));

      const anterior = doPagamento.find(
        (x) => recusada(x) && dig(x.tomador_doc) === tomadorDoc
      );
      if (anterior) idReaproveitar = Number(anterior.id) || null;

      if (jaEmitidas.some((x) => dig(x.tomador_doc) === tomadorDoc)) {
        return NextResponse.json(
          { error: `Já existe nota viva desta cobrança para ${tomadorNome}. Cancele antes de reemitir.` },
          { status: 409 }
        );
      }

      const jaSomado = r2(jaEmitidas.reduce((a, x) => a + n(x.valor_servico), 0));
      const restante = r2(parteVille - jaSomado);
      // tolerância de 1 centavo: divisões em três partes não fecham exato
      if (valor > restante + 0.01) {
        return NextResponse.json(
          {
            error:
              `Valor excede o que resta desta cobrança. Parte da Ville: R$ ${parteVille.toFixed(2)}; ` +
              `já emitido: R$ ${jaSomado.toFixed(2)}; disponível: R$ ${restante.toFixed(2)}.`,
            parte_ville: parteVille,
            ja_emitido: jaSomado,
            restante,
          },
          { status: 400 }
        );
      }
    }

    /* ---------------------------------------------------------- */
    /* 2. discriminação, a partir da operação                      */
    /* ---------------------------------------------------------- */
    let discriminacao = String(body?.discriminacao || "").trim();
    let tomadorLado: string | null = String(tom.lado || "") || null;

    if (!discriminacao && operacao_id) {
      const [rOp, rPartes] = await Promise.all([
        fetch(`${c.url}/rest/v1/adm_operacoes_imobiliarias?id=eq.${operacao_id}&limit=1`, {
          headers: c.headers,
          cache: "no-store",
        }),
        fetch(
          `${c.url}/rest/v1/adm_operacao_partes?operacao_id=eq.${operacao_id}&order=ordem.asc`,
          { headers: c.headers, cache: "no-store" }
        ),
      ]);
      const op = rOp.ok ? ((await rOp.json()) as any[])[0] : null;
      const partes = rPartes.ok ? ((await rPartes.json()) as any[]) : [];
      if (op) {
        const operacao: Operacao = {
          ...op,
          alienantes: partes.filter((p) => p.papel === "alienante"),
          adquirentes: partes.filter((p) => p.papel === "adquirente"),
        };
        discriminacao = montarDiscriminacao(operacao, tomadorDoc, tomadorLado, parcelamento);
        if (!tomadorLado) tomadorLado = ladoDoTomador(operacao, tomadorDoc, null);
      }
    }
    if (!discriminacao) {
      return NextResponse.json(
        { error: "Sem discriminação: informe a operação imobiliária ou escreva o texto." },
        { status: 400 }
      );
    }

    /* ---------------------------------------------------------- */
    /* 3. reserva o RPS (atômico no banco)                          */
    /* ---------------------------------------------------------- */
    const dataEmissao = hojeSP();
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
    if (!numeroRps) return NextResponse.json({ error: "Número de RPS inválido." }, { status: 502 });

    const codigoServico = String(body?.codigo_servico || CODIGO_CORRETAGEM);

    const linha = {
      operacao_id,
      asaas_payment_id,
      origem,
      tomador_nome: tomadorNome,
      tomador_doc: tomadorDoc,
      tomador_email: String(tom.email || "").trim() || null,
      tomador_endereco: tomadorEndereco,
      tomador_lado: tomadorLado,
      valor_servico: valor,
      valor_cobranca: valorCobranca,
      valor_splits: valorSplits,
      codigo_servico: codigoServico,
      discriminacao,
      rps_serie: SERIE,
      rps_numero: numeroRps,
      rps_data_emissao: dataEmissao,
    };

    const gravar = async (campos: any) => {
      const r = await fetch(`${c.url}/rest/v1/adm_notas_comissao`, {
        method: "POST",
        headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ ...linha, ...campos }),
        cache: "no-store",
      });
      const rows = r.ok ? ((await r.json()) as any[]) : [];
      return rows[0] || null;
    };
    const atualizar = (id: number, campos: any) =>
      fetch(`${c.url}/rest/v1/adm_notas_comissao?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ ...campos, updated_at: new Date().toISOString() }),
        cache: "no-store",
      });

    // PATCH na linha da tentativa recusada: mesmo id, dados novos, erro limpo.
    const reaproveitar = async (id: number, campos: any) => {
      const r = await atualizar(id, { ...linha, ...campos, emissao_erro: null });
      const rows = r.ok ? ((await r.json()) as any[]) : [];
      return rows[0] || null;
    };

    const nota = teste
      ? null
      : idReaproveitar
      ? await reaproveitar(idReaproveitar, { status: "enviando" })
      : await gravar({ status: "enviando" });
    if (!teste && !nota) {
      return NextResponse.json({ error: "Falha ao gravar a nota antes do envio." }, { status: 502 });
    }

    /* ---------------------------------------------------------- */
    /* 4. chama o Render                                            */
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
          tomadorDoc,
          tomadorNome,
          tomadorEmail: linha.tomador_email || undefined,
          tomadorEndereco: tomadorEndereco || undefined,
          discriminacao,
          // corretagem tem código próprio; o serviço no Render precisa
          // respeitar este campo, senão a nota sai como administração
          codigoServico,
          teste,
        }),
        cache: "no-store",
      });
      resultado = await rEmitir.json().catch(() => null);
      if (!rEmitir.ok && !resultado) erroRede = `serviço de emissão respondeu HTTP ${rEmitir.status}`;
    } catch (e: any) {
      erroRede = String((e && e.message) || e);
    }

    /* ---------------------------------------------------------- */
    /* 5. desfecho                                                  */
    /* ---------------------------------------------------------- */
    if (teste) {
      return NextResponse.json({
        teste: true,
        rps: { serie: SERIE, numero: numeroRps },
        dataEmissao,
        discriminacao,
        codigoServico,
        resultado,
        aviso: "Número de RPS consumido pelo contador. Ajuste adm_rps_serie se for repetir.",
      });
    }

    if (erroRede || !resultado || resultado.sucesso !== true) {
      // "falha desconhecida" nao ajuda ninguem: quando o serviço responde sem
      // a lista de erros, levamos o corpo bruto (cortado) para o card.
      const motivo =
        erroRede ||
        (resultado?.erros || []).map((e: any) => `${e.codigo}: ${e.descricao}`).join(" · ") ||
        resultado?.mensagem ||
        resultado?.message ||
        resultado?.erro ||
        (resultado ? `resposta inesperada do serviço: ${JSON.stringify(resultado).slice(0, 400)}` : null) ||
        "falha desconhecida";
      await atualizar(nota!.id, { status: "a_emitir", emissao_erro: motivo.slice(0, 1000) });
      return NextResponse.json(
        { ok: false, erro: motivo, nota_id: nota!.id, rps: { serie: SERIE, numero: numeroRps }, detalhe: resultado?.erros || null },
        { status: 200 }
      );
    }

    const link = linkNota(process.env.NFSE_SP_IM || "69033951", resultado.numeroNota, resultado.codigoVerificacao);
    await atualizar(nota!.id, {
      status: "emitida",
      numero_nota: resultado.numeroNota,
      codigo_verificacao: resultado.codigoVerificacao,
      pdf_url: link,
      data_emissao: dataEmissao,
      emissao_erro: null,
      enviado_em: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      nota_id: nota!.id,
      numeroNota: resultado.numeroNota,
      codigoVerificacao: resultado.codigoVerificacao,
      link,
      rps: { serie: SERIE, numero: numeroRps },
      dataEmissao,
      discriminacao,
      alertas: resultado.alertas || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro inesperado", detail: String(e) }, { status: 500 });
  }
}
