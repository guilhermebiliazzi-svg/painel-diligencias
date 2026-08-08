import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { enviarEmail, mailerConfigurado, type Anexo } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Envia por e-mail ao locador os recibos + comprovantes das competências
// selecionadas (visão admin do portal). Anexa os PDFs e escreve um resumo.
//   POST /api/adm/locador-email { locador_id, itens: [{contrato_id, competencia}] }

const compRe = /^\d{4}-\d{2}$/;
const brl = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mesAno = (d: string) => {
  const [y, m] = String(d).slice(0, 7).split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] || m}/${y}`;
};

async function baixar(
  adm: ReturnType<typeof supabaseAdmin>,
  bucket: string,
  path: string
): Promise<Buffer | null> {
  try {
    const { data, error } = await adm.storage.from(bucket).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

// pdf_url do recibo pode ser URL do Storage (bucket privado) → extrai bucket/path
function bucketPathDeUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^/?]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

export async function POST(req: Request) {
  // exige admin
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const adm = supabaseAdmin();
  const { data: perfil } = await adm
    .from("perfis").select("is_admin,ativo").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!perfil?.is_admin || !perfil?.ativo) {
    return NextResponse.json({ error: "apenas admin" }, { status: 403 });
  }

  if (!mailerConfigurado()) {
    return NextResponse.json(
      { error: "E-mail não configurado. Defina SMTP_USER e SMTP_PASS (senha de app) na Vercel." },
      { status: 500 }
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const locadorId = Number(body?.locador_id);
  const itens: { contrato_id: number; competencia: string }[] = Array.isArray(body?.itens) ? body.itens : [];
  if (!locadorId) return NextResponse.json({ error: "locador_id é obrigatório." }, { status: 400 });
  const sel = itens
    .map((i) => ({ contrato_id: Number(i.contrato_id), competencia: String(i.competencia || "").slice(0, 7) }))
    .filter((i) => i.contrato_id && compRe.test(i.competencia));
  if (!sel.length) return NextResponse.json({ error: "Selecione ao menos uma competência." }, { status: 400 });

  // locador + e-mail
  const { data: loc } = await adm
    .from("adm_locadores").select("id,nome,email").eq("id", locadorId).limit(1);
  const locador = loc?.[0];
  if (!locador?.email) {
    return NextResponse.json({ error: "Locador sem e-mail cadastrado." }, { status: 400 });
  }

  const contratoIds = [...new Set(sel.map((s) => s.contrato_id))];
  const comps = [...new Set(sel.map((s) => `${s.competencia}-01`))];

  // repasses selecionados
  const { data: reps } = await adm
    .from("adm_repasses")
    .select("id,contrato_id,competencia,total_liquido,deducao_iptu,deducao_condominio,pdf_url")
    .eq("locador_id", locadorId)
    .in("contrato_id", contratoIds)
    .in("competencia", comps);
  const repasses = (reps || []).filter((r: any) =>
    sel.some((s) => s.contrato_id === r.contrato_id && `${s.competencia}-01` === String(r.competencia).slice(0, 10))
  );
  if (!repasses.length) return NextResponse.json({ error: "Nenhum recibo encontrado para a seleção." }, { status: 404 });

  // endereços
  const endPorContrato: Record<number, string> = {};
  const { data: cs } = await adm
    .from("adm_contratos").select("id,imovel:adm_imoveis(rua,numero,complemento,bairro)").in("id", contratoIds);
  for (const c of (cs || []) as any[]) {
    const im = c.imovel || {};
    const compl = im.complemento ? ` — ${String(im.complemento).trim()}` : "";
    endPorContrato[c.id] = ([im.rua, im.numero].filter(Boolean).join(", ") + compl + (im.bairro ? `, ${im.bairro}` : "")) || `Contrato #${c.id}`;
  }

  const anexos: Anexo[] = [];
  const linhasResumo: string[] = [];

  for (const r of repasses as any[]) {
    const compTxt = mesAno(r.competencia);
    const endereco = endPorContrato[r.contrato_id] || `Contrato #${r.contrato_id}`;
    const tag = `${compTxt} · ${endereco}`;

    // recibo
    if (r.pdf_url) {
      const bp = bucketPathDeUrl(r.pdf_url);
      if (bp) {
        const buf = await baixar(adm, bp.bucket, bp.path);
        if (buf) anexos.push({ filename: `Recibo ${compTxt} - ${endereco}.pdf`.replace(/\//g, "-"), content: buf });
      }
    }

    // comprovante do repasse (Pix)
    const { data: pg } = await adm
      .from("adm_pagamentos")
      .select("comprovante_bucket,comprovante_path")
      .eq("tipo", "pix_repasse").eq("repasse_id", r.id)
      .not("comprovante_path", "is", null).limit(1);
    if (pg?.[0]?.comprovante_path) {
      const buf = await baixar(adm, pg[0].comprovante_bucket || "documentos", pg[0].comprovante_path);
      if (buf) anexos.push({ filename: `Comprovante repasse ${compTxt} - ${endereco}.pdf`.replace(/\//g, "-"), content: buf });
    }

    // comprovantes de boletos pagos pela imobiliária
    const { data: bpg } = await adm
      .from("adm_pagamentos")
      .select("subtipo,comprovante_bucket,comprovante_path")
      .eq("tipo", "boleto").eq("contrato_id", r.contrato_id).eq("competencia", r.competencia)
      .not("comprovante_path", "is", null);
    for (const b of (bpg || []) as any[]) {
      const buf = await baixar(adm, b.comprovante_bucket || "documentos", b.comprovante_path);
      if (buf) anexos.push({ filename: `Comprovante ${b.subtipo === "iptu" ? "IPTU" : "condominio"} ${compTxt} - ${endereco}.pdf`.replace(/\//g, "-"), content: buf });
    }

    // documentos anexados (boletos + comprovantes enviados na mão).
    // Pula comprovantes com origem=pagamento: esses já vieram de adm_pagamentos
    // acima — evita anexar o mesmo comprovante duas vezes.
    const { data: docs } = await adm
      .from("adm_documentos")
      .select("tipo,bucket,path,origem")
      .eq("contrato_id", r.contrato_id).eq("competencia", r.competencia);
    const LAB: Record<string, string> = {
      boleto_iptu: "Boleto IPTU", boleto_condominio: "Boleto condominio",
      comprovante_iptu: "Comprovante IPTU", comprovante_condominio: "Comprovante condominio",
    };
    for (const d of (docs || []) as any[]) {
      // não enviar os boletos por e-mail — só os comprovantes de pagamento
      if (d.tipo === "boleto_iptu" || d.tipo === "boleto_condominio") continue;
      if ((d.tipo === "comprovante_iptu" || d.tipo === "comprovante_condominio") && d.origem === "pagamento") continue;
      const buf = await baixar(adm, d.bucket || "documentos", d.path);
      if (buf) anexos.push({ filename: `${LAB[d.tipo] || d.tipo} ${compTxt} - ${endereco}.pdf`.replace(/\//g, "-"), content: buf });
    }

    linhasResumo.push(
      `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${compTxt}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${endereco}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${brl(r.total_liquido)}</td>
      </tr>`
    );
  }

  if (!anexos.length) {
    return NextResponse.json({ error: "Não há PDFs disponíveis para anexar na seleção." }, { status: 404 });
  }

  // Edição opcional (vinda da prévia): assunto, mensagem do corpo e quais anexos incluir.
  const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const primeiroNome = (locador.nome || "").split(" ")[0] || "locador";

  const assuntoPadrao =
    repasses.length === 1
      ? `Ville Jardins — Recibo e comprovantes ${mesAno((repasses as any[])[0].competencia)}`
      : `Ville Jardins — Recibos e comprovantes (${repasses.length} competências)`;
  const assunto = typeof body?.assunto === "string" && body.assunto.trim() ? body.assunto.trim() : assuntoPadrao;

  const mensagemPadrao =
    `Olá, ${primeiroNome},\nSeguem em anexo os documentos referentes ao(s) seu(s) imóvel(is). O(s) comprovante(s) de pagamento e o(s) recibo(s) estão anexados neste e-mail em PDF.`;
  const mensagem = typeof body?.mensagem === "string" ? body.mensagem : mensagemPadrao;

  // filtro de anexos (por nome de arquivo) quando a prévia manda a lista incluída
  const incluir = Array.isArray(body?.incluirAnexos) ? new Set(body.incluirAnexos.map(String)) : null;
  const anexosFinais = incluir ? anexos.filter((a) => incluir.has(a.filename)) : anexos;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:14px;line-height:1.5">
    <p style="white-space:pre-wrap">${escapar(mensagem)}</p>
    <table style="border-collapse:collapse;margin:12px 0;min-width:360px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:6px 10px;text-align:left">Competência</th>
          <th style="padding:6px 10px;text-align:left">Imóvel</th>
          <th style="padding:6px 10px;text-align:right">Líquido repassado</th>
        </tr>
      </thead>
      <tbody>${linhasResumo.join("")}</tbody>
    </table>
    <p style="margin-top:16px">Atenciosamente,<br/>Ville Jardins Negócios Imobiliários</p>
  </div>`;

  // Pré-visualização: devolve o e-mail montado sem enviar.
  if (body?.preview) {
    return NextResponse.json({
      ok: true,
      preview: true,
      to: locador.email,
      subject: assunto,
      mensagem,
      html,
      attachments: anexosFinais.map((a) => ({
        filename: a.filename,
        kb: Math.max(1, Math.round(a.content.length / 1024)),
      })),
    });
  }

  if (!anexosFinais.length) {
    return NextResponse.json({ error: "Nenhum anexo selecionado para envio." }, { status: 400 });
  }

  try {
    await enviarEmail({ to: locador.email, subject: assunto, html, attachments: anexosFinais });
  } catch (e: any) {
    return NextResponse.json({ error: `Falha ao enviar: ${e?.message || e}` }, { status: 502 });
  }

  // registra o envio (para sinalizar "enviado em" na tabela) — best-effort
  const enviadoEm = new Date().toISOString();
  try {
    const linhas = (repasses as any[]).map((r) => ({
      contrato_id: r.contrato_id,
      competencia: String(r.competencia).slice(0, 10),
      locador_id: locadorId,
      enviado_em: enviadoEm,
      to_email: locador.email,
    }));
    await adm.from("adm_locador_envios").upsert(linhas, { onConflict: "contrato_id,competencia" });
  } catch (e) {
    console.error("[locador-email] falha ao registrar envio (ignorado):", e);
  }

  return NextResponse.json({ ok: true, to: locador.email, anexos: anexosFinais.length, competencias: repasses.length, enviado_em: enviadoEm });
}
