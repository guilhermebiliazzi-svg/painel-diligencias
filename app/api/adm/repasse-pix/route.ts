import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { interFetch, novoUuid } from "@/lib/inter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Repasse ao locador via Pix (dados bancários), pela ponte do Inter.
// O pagamento é SUBMETIDO ao Inter e fica pendente de aprovação no app do banco
// (Gestão de Aprovações), conforme a configuração da conta.
//
//   POST /api/adm/repasse-pix   { contrato_id, competencia:"YYYY-MM", conta_bancaria_id, dataPagamento? }
//   GET  /api/adm/repasse-pix?repasse=123   (consulta status no Inter e atualiza)

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
  const conta_bancaria_id = Number(body?.conta_bancaria_id);
  const dataPagamento = body?.dataPagamento ? String(body.dataPagamento) : undefined; // YYYY-MM-DD

  if (!contrato_id) return NextResponse.json({ error: "contrato_id é obrigatório." }, { status: 400 });
  if (!compRe.test(comp)) return NextResponse.json({ error: "competencia (YYYY-MM) inválida." }, { status: 400 });
  if (!conta_bancaria_id) return NextResponse.json({ error: "Escolha a conta bancária de destino." }, { status: 400 });

  const compData = `${comp}-01`;

  // 1) repasse gravado da competência
  const { data: reps } = await adm
    .from("adm_repasses")
    .select("id,locador_id,contrato_id,competencia,total_liquido")
    .eq("contrato_id", contrato_id)
    .eq("competencia", compData)
    .order("id")
    .limit(1);
  const repasse = reps?.[0];
  if (!repasse) {
    return NextResponse.json({ error: "Repasse não encontrado para essa competência. Gere o recibo primeiro." }, { status: 404 });
  }
  const valor = Number(repasse.total_liquido);
  if (!(valor > 0)) {
    return NextResponse.json({ error: "Valor líquido do repasse é zero ou inválido." }, { status: 400 });
  }

  // 2) anti-duplicidade: já existe um Pix vivo para este repasse?
  const { data: existentes } = await adm
    .from("adm_pagamentos")
    .select("id,status,inter_codigo,inter_status")
    .eq("repasse_id", repasse.id)
    .eq("tipo", "pix_repasse")
    .in("status", ["submetido", "aguardando_aprovacao", "efetivado"])
    .limit(1);
  if (existentes?.[0]) {
    const e = existentes[0];
    return NextResponse.json({
      ok: true,
      jaExiste: true,
      pagamento_id: e.id,
      status: e.status,
      codigoSolicitacao: e.inter_codigo,
      mensagem: "Já existe um repasse Pix enviado para esta competência.",
    });
  }

  // 3) conta bancária de destino
  const { data: contas } = await adm
    .from("adm_contas_bancarias")
    .select("id,titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta,locador_id")
    .eq("id", conta_bancaria_id)
    .limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ error: "Conta bancária não encontrada." }, { status: 404 });

  const faltando: string[] = [];
  if (!conta.banco_ispb) faltando.push("ISPB do banco");
  if (!conta.agencia) faltando.push("agência");
  if (!conta.conta) faltando.push("conta");
  if (!soDigitos(conta.cpf_cnpj)) faltando.push("CPF/CNPJ");
  if (faltando.length) {
    return NextResponse.json({ error: `Dados bancários incompletos: ${faltando.join(", ")}.` }, { status: 400 });
  }

  const destinatario = {
    tipo: "DADOS_BANCARIOS",
    nome: conta.titular || undefined,
    contaCorrente: String(conta.conta),
    tipoConta: conta.tipo_conta || "CONTA_CORRENTE",
    cpfCnpj: soDigitos(conta.cpf_cnpj),
    agencia: String(conta.agencia),
    instituicaoFinanceira: { ispb: String(conta.banco_ispb) },
  };

  const descricao = `Repasse ${comp} contrato ${contrato_id}`.slice(0, 140);
  const idem = novoUuid();

  // 4) grava a intenção ANTES de chamar o Inter (auditoria mesmo se falhar)
  const { data: ins, error: insErr } = await adm
    .from("adm_pagamentos")
    .insert({
      tipo: "pix_repasse",
      repasse_id: repasse.id,
      contrato_id,
      competencia: compData,
      conta_bancaria_id,
      valor,
      descricao,
      destinatario,
      idempotencia_id: idem,
      status: "submetido",
    })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  const pagamentoId = ins.id;

  // 5) submete ao Inter (fica pendente de aprovação no app)
  const payload: any = { valor, descricao, destinatario };
  if (dataPagamento) payload.dataPagamento = dataPagamento;

  const r = await interFetch<any>("/banking/v2/pix", { method: "POST", body: payload, idem });

  if (!r.ok) {
    await adm
      .from("adm_pagamentos")
      .update({ status: "erro", erro: r.error, inter_retorno: r.data ?? { raw: r.raw }, atualizado_em: new Date().toISOString() })
      .eq("id", pagamentoId);
    return NextResponse.json({ error: `Inter recusou o Pix: ${r.error}`, pagamento_id: pagamentoId }, { status: 502 });
  }

  const d = r.data || {};
  const codigo = d.codigoSolicitacao || d.codigo || null;
  const tipoRetorno = String(d.tipoRetorno || "").toUpperCase();
  const efetivado = tipoRetorno === "EFETIVADO";
  const status = efetivado ? "efetivado" : "aguardando_aprovacao";

  await adm
    .from("adm_pagamentos")
    .update({
      status,
      inter_codigo: codigo,
      inter_status: tipoRetorno || null,
      inter_retorno: d,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pagamentoId);

  // referência no repasse; data_pagamento só quando efetivado
  const repUpd: any = { pix_e2e_id: codigo, updated_at: new Date().toISOString() };
  if (efetivado) repUpd.data_pagamento = d.dataPagamento || d.dataOperacao || new Date().toISOString().slice(0, 10);
  await adm.from("adm_repasses").update(repUpd).eq("id", repasse.id);

  return NextResponse.json({
    ok: true,
    pagamento_id: pagamentoId,
    status,
    codigoSolicitacao: codigo,
    tipoRetorno,
    valor,
  });
}

export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const pagamentoId = searchParams.get("pagamento");
  let repasseId: string | number | null = searchParams.get("repasse");
  const contrato = searchParams.get("contrato");
  const comp = searchParams.get("competencia");

  // permite consultar por contrato+competência (a tela não tem o repasse_id)
  if (!repasseId && !pagamentoId && contrato && comp && compRe.test(comp)) {
    const { data: reps } = await adm
      .from("adm_repasses")
      .select("id")
      .eq("contrato_id", Number(contrato))
      .eq("competencia", `${comp}-01`)
      .order("id")
      .limit(1);
    repasseId = reps?.[0]?.id ?? null;
    if (!repasseId) return NextResponse.json({ pagamento: null });
  }

  let sel = adm
    .from("adm_pagamentos")
    .select("id,repasse_id,inter_codigo,status,inter_status,valor,criado_em")
    .eq("tipo", "pix_repasse")
    .order("id", { ascending: false })
    .limit(1);
  if (pagamentoId) sel = sel.eq("id", Number(pagamentoId));
  else if (repasseId) sel = sel.eq("repasse_id", Number(repasseId));
  else return NextResponse.json({ error: "Informe repasse, pagamento ou contrato+competencia." }, { status: 400 });

  const { data: pg } = await sel;
  const pagamento = pg?.[0];
  if (!pagamento) return NextResponse.json({ pagamento: null });

  // consulta o Inter se ainda não efetivado e temos o código
  if (pagamento.inter_codigo && pagamento.status !== "efetivado") {
    const r = await interFetch<any>(`/banking/v2/pix/${encodeURIComponent(pagamento.inter_codigo)}`, { method: "GET" });
    if (r.ok && r.data) {
      const d = r.data;
      const statusInter = String(
        d.status || d.tipoRetorno || d?.transacaoPix?.status || d?.transacao?.status || ""
      ).toUpperCase();
      const e2e = d.endToEndId || d?.transacaoPix?.endToEndId || null;
      const efetivado = /EFETIVAD|REALIZAD|PAGO|CONCLU/.test(statusInter);
      const cancelado = /CANCELAD|DEVOLVID|FALHA|ERRO|REJEITAD/.test(statusInter);
      const novo = efetivado ? "efetivado" : cancelado ? "cancelado" : pagamento.status;

      await adm
        .from("adm_pagamentos")
        .update({ status: novo, inter_status: statusInter || null, inter_retorno: d, atualizado_em: new Date().toISOString() })
        .eq("id", pagamento.id);

      if (efetivado && pagamento.repasse_id) {
        const upd: any = { updated_at: new Date().toISOString() };
        if (e2e) upd.pix_e2e_id = e2e;
        upd.data_pagamento = d.dataOperacao || d.dataPagamento || new Date().toISOString().slice(0, 10);
        await adm.from("adm_repasses").update(upd).eq("id", pagamento.repasse_id);
      }
      return NextResponse.json({ pagamento: { ...pagamento, status: novo, inter_status: statusInter } });
    }
  }

  return NextResponse.json({ pagamento });
}
