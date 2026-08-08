import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { interFetch } from "@/lib/inter";
import { salvarComprovanteBoleto } from "@/lib/salvar-comprovante";
import { vencimentoDaLinhaDigitavel } from "@/lib/linha-digitavel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagamento de boleto (IPTU/condomínio de responsabilidade da imobiliária) via
// ponte do Inter. Fica pendente de aprovação no app do banco.
//   POST /api/adm/pagar-boleto { contrato_id, competencia, subtipo, linha_digitavel, valor, vencimento, cpfCnpjBeneficiario?, dataPagamento? }
//   GET  /api/adm/pagar-boleto?pagamento=123   (consulta status no Inter)

const compRe = /^\d{4}-\d{2}$/;
const soDigitos = (s: any) => String(s ?? "").replace(/\D/g, "");

export async function POST(req: Request) {
  const adm = supabaseAdmin();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const contrato_id = Number(body?.contrato_id);
  const comp = String(body?.competencia || "");
  const subtipo = String(body?.subtipo || "");
  const linha = soDigitos(body?.linha_digitavel);
  const valor = Number(body?.valor);
  const vencimento = String(body?.vencimento || ""); // YYYY-MM-DD
  const cpfCnpj = soDigitos(body?.cpfCnpjBeneficiario);
  const dataPagamento = body?.dataPagamento ? String(body.dataPagamento) : undefined;

  if (!contrato_id) return NextResponse.json({ error: "contrato_id é obrigatório." }, { status: 400 });
  if (!compRe.test(comp)) return NextResponse.json({ error: "competencia (YYYY-MM) inválida." }, { status: 400 });
  if (!["iptu", "condominio"].includes(subtipo)) return NextResponse.json({ error: "subtipo inválido." }, { status: 400 });
  if (linha.length < 44 || linha.length > 48) return NextResponse.json({ error: "Linha digitável/código de barras inválido (esperado 44 a 48 dígitos)." }, { status: 400 });
  if (!(valor > 0)) return NextResponse.json({ error: "Valor a pagar inválido." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return NextResponse.json({ error: "Vencimento (YYYY-MM-DD) é obrigatório." }, { status: 400 });

  const compData = `${comp}-01`;

  // anti-duplicidade: mesma linha ou mesma obrigação já com pagamento vivo
  const { data: dups } = await adm
    .from("adm_pagamentos")
    .select("id,status,inter_codigo,linha_digitavel,subtipo")
    .eq("tipo", "boleto")
    .eq("contrato_id", contrato_id)
    .eq("competencia", compData)
    .in("status", ["submetido", "aguardando_aprovacao", "efetivado"]);
  // permite vários boletos do mesmo tipo (apto + vaga); só bloqueia a MESMA linha
  const jaVivo = (dups || []).find((d: any) => soDigitos(d.linha_digitavel) === linha);
  if (jaVivo) {
    return NextResponse.json({
      ok: true,
      jaExiste: true,
      pagamento_id: jaVivo.id,
      status: jaVivo.status,
      codigoTransacao: jaVivo.inter_codigo,
      mensagem: "Este boleto já foi enviado para pagamento.",
    });
  }

  // grava a intenção antes de chamar o Inter
  const { data: ins, error: insErr } = await adm
    .from("adm_pagamentos")
    .insert({
      tipo: "boleto",
      subtipo,
      contrato_id,
      competencia: compData,
      valor,
      linha_digitavel: linha,
      vencimento,
      descricao: `Boleto ${subtipo === "iptu" ? "IPTU" : "condomínio"} ${comp} contrato ${contrato_id}`,
      status: "submetido",
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  const pagamentoId = ins.id;

  // O Inter valida a dataVencimento contra a data real do título (embutida no
  // código de barras). A data lida do PDF/digitada às vezes diverge e o Inter
  // recusa ("Campo inválido: Data de vencimento"). Quando dá pra calcular o
  // vencimento pelo fator da linha (boleto bancário), usamos ele; senão, o
  // valor informado.
  const vencInter = vencimentoDaLinhaDigitavel(linha) || vencimento;

  // submete ao Inter
  const payload: any = {
    codBarraLinhaDigitavel: linha,
    valorPagar: valor.toFixed(2),
    dataVencimento: vencInter,
  };
  if (dataPagamento) payload.dataPagamento = dataPagamento;
  if (cpfCnpj) payload.cpfCnpjBeneficiario = cpfCnpj;

  const r = await interFetch<any>("/banking/v2/pagamento", { method: "POST", body: payload });

  if (!r.ok) {
    await adm
      .from("adm_pagamentos")
      .update({ status: "erro", erro: r.error, inter_retorno: r.data ?? { raw: r.raw }, atualizado_em: new Date().toISOString() })
      .eq("id", pagamentoId);
    return NextResponse.json({ error: `Inter recusou o pagamento: ${r.error}`, pagamento_id: pagamentoId }, { status: 502 });
  }

  const d = r.data || {};
  const codigo = d.codigoTransacao || null;
  const statusInter = String(d.statusPagamento || "").toUpperCase();
  await adm
    .from("adm_pagamentos")
    .update({
      status: "aguardando_aprovacao",
      inter_codigo: codigo,
      inter_status: statusInter || null,
      inter_retorno: d,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pagamentoId);

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    status: "aguardando_aprovacao",
    codigoTransacao: codigo,
    quantidadeAprovadores: d.quantidadeAprovadores,
    statusPagamento: statusInter,
  });
}

export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const pagamentoId = searchParams.get("pagamento");
  if (!pagamentoId) return NextResponse.json({ error: "Informe pagamento." }, { status: 400 });

  const { data: pg } = await adm
    .from("adm_pagamentos")
    .select("id,contrato_id,inter_codigo,status,inter_status,valor,comprovante_path")
    .eq("id", Number(pagamentoId))
    .eq("tipo", "boleto")
    .limit(1);
  const pagamento = pg?.[0];
  if (!pagamento) return NextResponse.json({ pagamento: null });

  // busca o Inter se ainda não efetivou OU se efetivou mas falta o comprovante
  if (pagamento.inter_codigo && (pagamento.status !== "efetivado" || !pagamento.comprovante_path)) {
    const r = await interFetch<any>(
      `/banking/v2/pagamento?codigoTransacao=${encodeURIComponent(pagamento.inter_codigo)}`,
      { method: "GET" }
    );
    if (r.ok && r.data) {
      // a Busca devolve uma coleção; pega o item correspondente
      const arr = Array.isArray(r.data) ? r.data : r.data?.pagamentos || r.data?.content || [r.data];
      const item = arr.find((x: any) => x?.codigoTransacao === pagamento.inter_codigo) || arr[0] || {};
      const statusInter = String(item.statusPagamento || item.status || "").toUpperCase();
      const efetivado = /PAGO|EFETIVAD|LIQUIDAD|REALIZAD|CONCLU/.test(statusInter);
      const cancelado = /CANCELAD|FALHA|ERRO|REJEITAD|EXPIRAD/.test(statusInter);
      const novo = efetivado ? "efetivado" : cancelado ? "cancelado" : pagamento.status;
      await adm
        .from("adm_pagamentos")
        .update({ status: novo, inter_status: statusInter || null, inter_retorno: item, atualizado_em: new Date().toISOString() })
        .eq("id", pagamento.id);
      let comprovante_url: string | null = null;
      if (efetivado) {
        try {
          const comp = await salvarComprovanteBoleto(pagamento.id, {
            beneficiario: item.nomeBeneficiario ?? null,
            autenticacao: item.autenticacao != null ? String(item.autenticacao) : null,
            nsu: item.nsu != null ? String(item.nsu) : null,
            dataPagamento: item.dataPagamento ?? null,
            valorPago: item.valorPago != null ? Number(item.valorPago) : null,
          });
          comprovante_url = comp?.url ?? null;
        } catch (e) {}
      }
      return NextResponse.json({ pagamento: { ...pagamento, status: novo, inter_status: statusInter }, comprovante_url });
    }
  }

  // já efetivado e com comprovante: devolve o link existente
  let comprovante_url: string | null = null;
  if (pagamento.status === "efetivado") {
    try {
      const comp = await salvarComprovanteBoleto(pagamento.id);
      comprovante_url = comp?.url ?? null;
    } catch (e) {}
  }
  return NextResponse.json({ pagamento, comprovante_url });
}

// Cancela o AGENDAMENTO de um boleto (só antes de pago).
//   DELETE /api/adm/pagar-boleto?pagamento=123
export async function DELETE(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const pagamentoId = searchParams.get("pagamento");
  if (!pagamentoId) return NextResponse.json({ error: "Informe pagamento." }, { status: 400 });

  const { data: pg } = await adm
    .from("adm_pagamentos")
    .select("id,inter_codigo,status")
    .eq("id", Number(pagamentoId))
    .eq("tipo", "boleto")
    .limit(1);
  const pagamento = pg?.[0];
  if (!pagamento) return NextResponse.json({ error: "Pagamento não encontrado." }, { status: 404 });
  if (pagamento.status === "efetivado") {
    return NextResponse.json({ error: "Boleto já pago — não é possível cancelar." }, { status: 409 });
  }
  if (!pagamento.inter_codigo) {
    // ainda não foi ao Inter (ou falhou): apenas marca cancelado localmente
    await adm.from("adm_pagamentos").update({ status: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", pagamento.id);
    return NextResponse.json({ ok: true, status: "cancelado" });
  }

  const r = await interFetch<any>(`/banking/v2/pagamento/${encodeURIComponent(pagamento.inter_codigo)}`, { method: "DELETE" });
  if (!r.ok) {
    return NextResponse.json({ error: `Inter não cancelou: ${r.error}` }, { status: 502 });
  }
  await adm.from("adm_pagamentos").update({ status: "cancelado", atualizado_em: new Date().toISOString() }).eq("id", pagamento.id);
  return NextResponse.json({ ok: true, status: "cancelado" });
}
