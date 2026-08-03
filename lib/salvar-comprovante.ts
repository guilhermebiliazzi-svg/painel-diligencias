import { supabaseAdmin } from "@/lib/supabase/admin";
import { gerarComprovantePixPDF, gerarComprovanteBoletoPDF } from "@/lib/comprovante";

// Gera (se ainda não existir) o comprovante Pix de um pagamento efetivado,
// sobe no Storage e grava o caminho em adm_pagamentos. Idempotente: se já há
// comprovante, apenas devolve o link assinado.
export async function salvarComprovantePix(
  pagamentoId: number,
  extra?: { endToEnd?: string | null; dataHora?: string | null }
): Promise<{ path: string; url: string | null } | null> {
  const adm = supabaseAdmin();

  const { data: pg } = await adm
    .from("adm_pagamentos")
    .select("id,tipo,contrato_id,competencia,valor,destinatario,inter_codigo,repasse_id,comprovante_bucket,comprovante_path")
    .eq("id", pagamentoId)
    .single();
  if (!pg) return null;

  const bucket = "documentos";

  // já existe → devolve link
  if (pg.comprovante_path) {
    const { data: sg } = await adm.storage.from(pg.comprovante_bucket || bucket).createSignedUrl(pg.comprovante_path, 3600);
    return { path: pg.comprovante_path, url: sg?.signedUrl ?? null };
  }

  // endToEnd: do parâmetro, ou o pix_e2e_id gravado no repasse
  let endToEnd = extra?.endToEnd ?? null;
  if (!endToEnd && pg.repasse_id) {
    const { data: rep } = await adm.from("adm_repasses").select("pix_e2e_id").eq("id", pg.repasse_id).limit(1);
    endToEnd = rep?.[0]?.pix_e2e_id ?? null;
  }

  const dest: any = pg.destinatario || {};
  const pdf = await gerarComprovantePixPDF({
    valor: Number(pg.valor),
    recebedorNome: dest.nome ?? null,
    recebedorDoc: dest.cpfCnpj ?? null,
    bancoIspb: dest.instituicaoFinanceira?.ispb ?? null,
    agencia: dest.agencia ?? null,
    conta: dest.contaCorrente ?? null,
    endToEnd,
    codigoSolicitacao: pg.inter_codigo ?? null,
    dataHora: extra?.dataHora ?? null,
    referencia: `Repasse contrato ${pg.contrato_id} · competência ${String(pg.competencia).slice(0, 7)}`,
  });

  const path = `comprovantes/pix-${pagamentoId}.pdf`;
  const up = await adm.storage.from(bucket).upload(path, Buffer.from(pdf), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) return null;

  await adm
    .from("adm_pagamentos")
    .update({ comprovante_bucket: bucket, comprovante_path: path, atualizado_em: new Date().toISOString() })
    .eq("id", pagamentoId);

  const { data: sg } = await adm.storage.from(bucket).createSignedUrl(path, 3600);
  return { path, url: sg?.signedUrl ?? null };
}

// Comprovante de pagamento de boleto (IPTU/condomínio). Gera, sobe ao Storage,
// grava em adm_pagamentos E registra em adm_documentos como comprovante_iptu/
// comprovante_condominio — assim aparece no portal do locador, no slot certo.
export async function salvarComprovanteBoleto(
  pagamentoId: number,
  extra?: { beneficiario?: string | null; autenticacao?: string | null; nsu?: string | null; dataPagamento?: string | null; valorPago?: number | null }
): Promise<{ path: string; url: string | null } | null> {
  const adm = supabaseAdmin();
  const bucket = "documentos";

  const { data: pg } = await adm
    .from("adm_pagamentos")
    .select("id,subtipo,contrato_id,competencia,valor,linha_digitavel,vencimento,inter_codigo,comprovante_bucket,comprovante_path")
    .eq("id", pagamentoId)
    .single();
  if (!pg || (pg.subtipo !== "iptu" && pg.subtipo !== "condominio")) return null;

  if (pg.comprovante_path) {
    const { data: sg } = await adm.storage.from(pg.comprovante_bucket || bucket).createSignedUrl(pg.comprovante_path, 3600);
    return { path: pg.comprovante_path, url: sg?.signedUrl ?? null };
  }

  const comp = String(pg.competencia).slice(0, 7);
  const pdf = await gerarComprovanteBoletoPDF({
    subtipo: pg.subtipo as "iptu" | "condominio",
    valorPago: Number(extra?.valorPago ?? pg.valor),
    beneficiario: extra?.beneficiario ?? null,
    linhaDigitavel: pg.linha_digitavel ?? null,
    vencimento: pg.vencimento ? String(pg.vencimento) : null,
    dataPagamento: extra?.dataPagamento ?? null,
    codigoTransacao: pg.inter_codigo ?? null,
    autenticacao: extra?.autenticacao ?? null,
    nsu: extra?.nsu ?? null,
    referencia: `Contrato ${pg.contrato_id} · competência ${comp}`,
  });

  const path = `comprovantes/boleto-${pagamentoId}.pdf`;
  const up = await adm.storage.from(bucket).upload(path, Buffer.from(pdf), { contentType: "application/pdf", upsert: true });
  if (up.error) return null;

  await adm
    .from("adm_pagamentos")
    .update({ comprovante_bucket: bucket, comprovante_path: path, atualizado_em: new Date().toISOString() })
    .eq("id", pagamentoId);

  // registra no portal (slot comprovante_iptu / comprovante_condominio)
  await adm.from("adm_documentos").upsert(
    {
      contrato_id: pg.contrato_id,
      competencia: pg.competencia,
      tipo: `comprovante_${pg.subtipo}`,
      bucket,
      path,
      nome: `Comprovante ${pg.subtipo === "iptu" ? "IPTU" : "condomínio"} ${comp}.pdf`,
      origem: "pagamento",
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "contrato_id,competencia,tipo" }
  );

  const { data: sg } = await adm.storage.from(bucket).createSignedUrl(path, 3600);
  return { path, url: sg?.signedUrl ?? null };
}
