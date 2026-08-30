import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { somaSplits } from "@/lib/asaas-split";
import { montarSugestao, type Sugestao } from "@/lib/sugestao-comissao";

/**
 * Notas fiscais de comissão.
 *
 * GET  /api/adm/notas-comissao
 *   Lista as cobranças do Asaas já recebidas, com a nota se já houver, e as
 *   notas avulsas. O valor sugerido é a parte da Ville: total menos a soma
 *   dos splits — porque quem tem subconta recebe direto e emite a própria
 *   nota pela parte dele.
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const n = (v: any) => (v == null ? 0 : Number(v) || 0);

/** Status do Asaas que significam dinheiro efetivamente recebido. */
const RECEBIDO = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];

function mesValido(v: string | null): string {
  return v && /^\d{4}-\d{2}$/.test(v) ? v : new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/** primeiro dia do mês seguinte, para o intervalo [inicio, fim) */
function proximoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export async function GET(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  // A DIMOB é anual, o fechamento com o contador é mensal. A tela precisa dos
  // dois recortes, então a rota aceita ?mes=AAAA-MM ou ?ano=AAAA.
  const params = new URL(req.url).searchParams;
  const anoTxt = params.get("ano") || "";
  const porAno = /^\d{4}$/.test(anoTxt);
  const mes = mesValido(params.get("mes"));
  const inicio = porAno ? `${anoTxt}-01-01` : `${mes}-01`;
  const fim = porAno ? `${Number(anoTxt) + 1}-01-01` : proximoMes(mes);

  try {
    const [rCob, rNotas] = await Promise.all([
      fetch(
        `${c.url}/rest/v1/asaas_cobrancas?select=id,asaas_payment_id,status,valor,vencimento,link,split,criado_em,diligencia_id` +
          `&status=in.(${RECEBIDO.join(",")})&order=criado_em.desc&limit=200`,
        { headers: c.headers, cache: "no-store" }
      ),
      // as notas do mês pedido alimentam a aba "Emitidas"; as cobranças ainda
      // sem nota ficam na aba de trabalho. Sem isso a tela vira um depósito
      // que só cresce.
      fetch(
        `${c.url}/rest/v1/adm_notas_comissao?order=created_at.desc&limit=500` +
          `&created_at=gte.${inicio}&created_at=lt.${fim}`,
        { headers: c.headers, cache: "no-store" }
      ),
    ]);

    if (!rCob.ok) {
      return NextResponse.json(
        { error: "Falha ao carregar as cobranças", detail: await rCob.text() },
        { status: 502 }
      );
    }
    if (!rNotas.ok) {
      return NextResponse.json(
        { error: "Falha ao carregar as notas", detail: await rNotas.text() },
        { status: 502 }
      );
    }

    const notasDoMes = (await rNotas.json()) as any[];

    // Uma cobrança de março com nota emitida não pode reaparecer como
    // pendente só porque estamos olhando agosto: a marcação de "já tem nota"
    // é global, o filtro por mês vale só para a listagem das emitidas.
    const rVivas = await fetch(
      `${c.url}/rest/v1/adm_notas_comissao?status=neq.cancelada&asaas_payment_id=not.is.null` +
        `&select=asaas_payment_id,status,numero_nota,pdf_url,valor_servico,tomador_nome,tomador_doc,emissao_erro,origem,created_at,id`,
      { headers: c.headers, cache: "no-store" }
    );
    const vivas = rVivas.ok ? ((await rVivas.json()) as any[]) : [];
    const notaPor: Record<string, any> = {};
    for (const nt of vivas) notaPor[nt.asaas_payment_id] = nt;

    const brutas = (await rCob.json()) as any[];

    // A ficha do negócio já tem pagador, partes e preço. Buscamos uma vez só,
    // para todas as diligências da lista, e devolvemos junto de cada cobrança:
    // digitar de novo o que o sistema já sabe é como o erro entra.
    const dilIds = Array.from(
      new Set(brutas.map((cb) => cb.diligencia_id).filter(Boolean))
    ) as string[];
    const sugestaoPor: Record<string, Sugestao> = {};
    let sugestaoErro: string | null = null;
    if (dilIds.length) {
      const lista = dilIds.join(",");
      try {
        // PostgREST com a service role: mesma porta que o resto desta rota usa.
        const [rDil, rOps] = await Promise.all([
          fetch(
            `${c.url}/rest/v1/diligencias?id=in.(${lista})&select=id,endereco,preco,dados_completos`,
            { headers: c.headers, cache: "no-store" }
          ),
          fetch(
            `${c.url}/rest/v1/adm_operacoes_imobiliarias?diligencia_id=in.(${lista})` +
              `&select=id,diligencia_id,imovel_logradouro,imovel_numero,imovel_bairro,valor_alienacao,data_contrato`,
            { headers: c.headers, cache: "no-store" }
          ),
        ]);
        if (!rDil.ok) throw new Error(`diligencias: ${await rDil.text()}`);
        const dils = (await rDil.json()) as any[];
        const ops = rOps.ok ? ((await rOps.json()) as any[]) : [];
        const opPor: Record<string, { id: number; label: string }> = {};
        for (const o of ops) {
          const onde = [o.imovel_logradouro, o.imovel_numero].filter(Boolean).join(", ");
          const label = [onde, o.imovel_bairro].filter(Boolean).join(" — ");
          opPor[String(o.diligencia_id)] = { id: Number(o.id), label: label || `Operação #${o.id}` };
        }
        for (const d of dils) {
          sugestaoPor[String(d.id)] = montarSugestao(d, opPor[String(d.id)] ?? null);
        }
        if (!dils.length) sugestaoErro = "nenhuma diligência encontrada para estas cobranças";
      } catch (e: any) {
        // Antes isso morria em silêncio e a tela só aparecia vazia, sem dizer
        // por quê. O motivo vai junto na resposta.
        sugestaoErro = String((e && e.message) || e).slice(0, 300);
      }
    }

    const cobrancas = brutas.map((cb) => {
      const total = n(cb.valor);
      const splits = somaSplits(cb.split);
      return {
        asaas_payment_id: cb.asaas_payment_id,
        status: cb.status,
        vencimento: cb.vencimento,
        link: cb.link,
        valor_cobranca: total,
        valor_splits: splits,
        // a parte da Ville; nunca negativa, mesmo com dado inconsistente
        valor_sugerido: Math.max(0, Math.round((total - splits) * 100) / 100),
        diligencia_id: cb.diligencia_id ?? null,
        sugestao: cb.diligencia_id ? sugestaoPor[cb.diligencia_id] ?? null : null,
        nota: notaPor[cb.asaas_payment_id] ?? null,
      };
    });

    return NextResponse.json({
      // a aba de trabalho mostra só o que falta emitir
      cobrancas: cobrancas.filter((cb) => !cb.nota),
      emitidas: notasDoMes,
      mes,
      periodo: porAno ? { tipo: "ano", valor: anoTxt } : { tipo: "mes", valor: mes },
      pendentes_total: cobrancas.filter((cb) => !cb.nota).length,
      sugestao_erro: sugestaoErro,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}

/**
 * PATCH /api/adm/notas-comissao   { nota_id, operacao_id }
 *
 * Amarra uma nota já emitida a uma operação. Serve para as avulsas, que nascem
 * antes de a venda estar cadastrada: sem esse vínculo a nota fica fora da
 * DIMOB para sempre, e reemitir só por isso seria absurdo.
 */
export async function PATCH(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const notaId = Number(body?.nota_id);
  const operacaoId = Number(body?.operacao_id);
  if (!notaId || !operacaoId) {
    return NextResponse.json({ error: "nota_id e operacao_id são obrigatórios." }, { status: 400 });
  }

  try {
    const r = await fetch(`${c.url}/rest/v1/adm_notas_comissao?id=eq.${notaId}`, {
      method: "PATCH",
      headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ operacao_id: operacaoId, updated_at: new Date().toISOString() }),
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ error: "Falha ao vincular", detail: await r.text() }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
