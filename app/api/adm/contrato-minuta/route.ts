// Contrato de locação e contrato de administração gerados pelo painel.
//
// GET  ?contrato=ID                         -> pendências dos dois contratos + minutas já geradas
// POST { contrato, tipo, acao: "docx" }     -> devolve o .docx para baixar
// POST { contrato, tipo, acao: "gdocs" }    -> guarda o .docx na pasta do contrato, manda para o
//                                              n8n "Painel — Contrato no Google Docs" (pasta do imóvel
//                                              em Drive/Administrações) e devolve o link
// POST { contrato, acao: "pasta", pasta } -> grava a pasta do imóvel no Drive (link ou vazio)
// tipo: "locacao" | "administracao"
// Todas aceitam `minuta` no lugar de `contrato` (locação ainda não assinada, adm_minutas).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import { montarAdministracao, montarLocacao, nomeArquivo, type DadosContrato } from "@/lib/contrato-locacao";
import { gerarContratoDocx } from "@/lib/contrato-docx";
import type { Parte } from "@/lib/contrato-partes";
import { donoDe, type Dono } from "@/lib/contrato-dono";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BUCKET = "documentos";
const N8N = (process.env.N8N_WEBHOOK_BASE || "https://villejds.app.n8n.cloud/webhook").replace(/\/+$/, "");
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function erro(msg: string, status = 400, detail?: unknown) {
  if (detail) console.error("contrato-minuta:", msg, detail);
  return NextResponse.json({ error: msg }, { status });
}

type SB = ReturnType<typeof supabaseAdmin>;

type Dados = DadosContrato & { pastaDrive: string | null; titulo: string };

// minuta: monta contrato/imóvel/conta a partir do formulário do Novo contrato guardado em adm_minutas.dados
async function carregarMinuta(sb: SB, id: number): Promise<Dados | null> {
  const { data: m } = await sb.from("adm_minutas").select("*").eq("id", id).maybeSingle();
  if (!m || !["rascunho", "assinada"].includes(m.status)) return null;
  const f = (m.dados || {}) as Record<string, any>;
  const num = (v: unknown) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : null);
  const c = { ...(f.c || {}) } as Record<string, any>;
  if (!c.valor_atual_aluguel) c.valor_atual_aluguel = c.valor_primeiro_aluguel;
  const contrato = { ...c, id: null, minuta: m.minuta || {} };
  const imovelId = num(f.imovelSel);
  let imovel: Record<string, any> | null = null;
  if (imovelId) {
    const { data } = await sb.from("adm_imoveis").select("*").eq("id", imovelId).maybeSingle();
    imovel = data || null;
  } else if (f.imovelNovo && typeof f.imovelNovo === "object") {
    imovel = { ...f.imovelNovo, id: null };
  }
  let conta: Record<string, any> | null = null;
  const contaId = num(f.contaModo);
  if (contaId) {
    const { data } = await sb
      .from("adm_contas_bancarias")
      .select("titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta")
      .eq("id", contaId)
      .maybeSingle();
    conta = data || null;
  } else if (f.contaModo === "nova" && f.contaForm?.banco_ispb) {
    conta = f.contaForm;
  }
  const { data: pt } = await sb.from("adm_contrato_partes").select("*").eq("minuta_id", id).order("papel").order("ordem");
  return {
    contrato, imovel, conta, partes: (pt || []) as Parte[],
    pastaDrive: m.drive_pasta_id || imovel?.drive_pasta_id || null,
    titulo: m.titulo || `Minuta ${id}`,
  };
}

async function carregar(sb: SB, dono: Dono): Promise<Dados | null> {
  if (dono.tipo === "minuta") return carregarMinuta(sb, dono.id);
  const id = dono.id;
  const { data: contrato } = await sb.from("adm_contratos").select("*").eq("id", id).maybeSingle();
  if (!contrato) return null;
  const [im, pt, ct] = await Promise.all([
    contrato.imovel_id
      ? sb.from("adm_imoveis").select("*").eq("id", contrato.imovel_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from("adm_contrato_partes").select("*").eq("contrato_id", id).order("papel").order("ordem"),
    sb.from("adm_contas_bancarias").select("titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta").eq("contrato_id", id).order("id").limit(1),
  ]);
  const imovel = (im as any).data || null;
  let conta = (ct.data || [])[0] || null;
  if (!conta && imovel?.locador_id) {
    const { data } = await sb
      .from("adm_contas_bancarias")
      .select("titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta")
      .eq("locador_id", imovel.locador_id)
      .order("id")
      .limit(1);
    conta = (data || [])[0] || null;
  }
  return { contrato, imovel, partes: (pt.data || []) as Parte[], conta, pastaDrive: imovel?.drive_pasta_id || null, titulo: `Contrato ${id}` };
}

function montar(tipo: string, d: DadosContrato) {
  return tipo === "administracao" ? montarAdministracao(d) : montarLocacao(d);
}

export async function GET(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  const dono = donoDe(new URL(req.url).searchParams);
  if (!dono) return erro("contrato inválido.");
  const sb = supabaseAdmin();
  const d = await carregar(sb, dono);
  if (!d) return erro(dono.tipo === "contrato" ? "Contrato não encontrado." : "Minuta não encontrada.", 404);
  const { data: geradas } = await sb
    .from("adm_contrato_documentos")
    .select("id,categoria,nome,descricao,link_externo,criado_em,enviado_por")
    .eq(dono.col, dono.id)
    .in("categoria", ["contrato_locacao", "contrato_administracao"])
    .not("link_externo", "is", null)
    .is("excluido_em", null)
    .order("criado_em", { ascending: false })
    .limit(10);
  return NextResponse.json({
    locacao: { pendencias: montarLocacao(d).pendencias },
    administracao: { pendencias: montarAdministracao(d).pendencias },
    geradas: geradas || [],
    pasta_drive: d.pastaDrive,
    administrada: d.contrato?.minuta?.condicoes?.administrada !== false,
  });
}

export async function POST(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return erro("Corpo inválido.");
  }
  const dono = donoDe(body || {});
  const sb = supabaseAdmin();

  // pasta do imóvel no Drive (link colado na tela; vazio = o painel cria em Administrações)
  if (body?.acao === "pasta" && dono) {
    const txt = String(body.pasta || "").trim();
    const m = /folders\/([A-Za-z0-9_-]{10,})/.exec(txt) || /^([A-Za-z0-9_-]{20,})$/.exec(txt);
    if (txt && !m) return erro("Cole o link da pasta do Google Drive (…/folders/…).");
    if (dono.tipo === "minuta") {
      const { data, error } = await sb
        .from("adm_minutas")
        .update({ drive_pasta_id: m ? m[1] : null, updated_at: new Date().toISOString() })
        .eq("id", dono.id)
        .in("status", ["rascunho", "assinada"])
        .select("id");
      if (error) return erro("Falha ao salvar a pasta.", 502, error.message);
      if (!data?.length) return erro("Minuta não encontrada.", 404);
      return NextResponse.json({ ok: true, pasta_drive: m ? m[1] : null });
    }
    const { data: c } = await sb.from("adm_contratos").select("imovel_id").eq("id", dono.id).maybeSingle();
    if (!c?.imovel_id) return erro("Contrato sem imóvel.", 404);
    const { error } = await sb.from("adm_imoveis").update({ drive_pasta_id: m ? m[1] : null }).eq("id", c.imovel_id);
    if (error) return erro("Falha ao salvar a pasta.", 502, error.message);
    return NextResponse.json({ ok: true, pasta_drive: m ? m[1] : null });
  }

  const tipo = body?.tipo === "administracao" ? "administracao" : body?.tipo === "locacao" ? "locacao" : null;
  if (!dono || !tipo) return erro("Parâmetros inválidos.");
  const d = await carregar(sb, dono);
  if (!d) return erro(dono.tipo === "contrato" ? "Contrato não encontrado." : "Minuta não encontrada.", 404);

  if (tipo === "administracao" && d.contrato?.minuta?.condicoes?.administrada === false) {
    return erro("Locação não administrada: não há contrato de administração.");
  }
  const { blocos } = montar(tipo, d);
  let docx: Buffer;
  try {
    docx = await gerarContratoDocx(blocos, { rascunho: true });
  } catch (e) {
    return erro("Falha ao montar o documento.", 500, e);
  }
  const nome = nomeArquivo(tipo, d.imovel);

  if (body.acao === "docx") {
    return new NextResponse(new Uint8Array(docx), {
      headers: {
        "Content-Type": DOCX_MIME,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}.docx`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (body.acao !== "gdocs") return erro("Ação desconhecida.");

  // 1) guarda o .docx na pasta do contrato (vale como histórico mesmo se o Drive falhar)
  const categoria = tipo === "locacao" ? "contrato_locacao" : "contrato_administracao";
  const path = `${dono.pasta}/${categoria}/${Date.now()}-minuta-${tipo}.docx`;
  const up = await sb.storage.from(BUCKET).upload(path, docx, { contentType: DOCX_MIME, upsert: false });
  if (up.error) return erro("Falha ao guardar a minuta.", 502, up.error.message);
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const { data: doc, error: e2 } = await sb
    .from("adm_contrato_documentos")
    .insert({
      [dono.col]: dono.id, categoria, nome: `${nome}.docx`, bucket: BUCKET, path, tamanho: docx.length, mime: DOCX_MIME,
      descricao: `Minuta gerada pelo painel em ${quando}`, enviado_por: ac.email,
    })
    .select("id")
    .single();
  if (e2 || !doc) return erro("Falha ao registrar a minuta.", 502, e2?.message);

  // 2) Google Docs na pasta do imóvel (Drive / Administrações)
  const { data: sec } = await sb.from("credenciais_sistema").select("valor").eq("chave", "painel_upload_secret").maybeSingle();
  const segredo = (sec as { valor?: string } | null)?.valor;
  if (!segredo) return erro("Integração com o Drive não configurada. O .docx ficou em Documentos do contrato.", 503);
  const im = d.imovel || {};
  const nomePasta = [im.rua, im.numero].filter(Boolean).join(", ") + (im.complemento ? ` ${im.complemento}` : "");
  let resp: Response;
  try {
    resp = await fetch(`${N8N}/painel-contrato-gdocs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-painel-secret": segredo },
      body: JSON.stringify({
        nome,
        docx_base64: docx.toString("base64"),
        pasta_id: d.pastaDrive,
        pasta_nome: nomePasta || d.titulo,
      }),
      signal: AbortSignal.timeout(100_000),
    });
  } catch {
    return erro("O Google Docs não respondeu. O .docx ficou em Documentos do contrato.", 504);
  }
  const out = await resp.json().catch(() => ({}) as any);
  if (!resp.ok || !out?.ok || !out?.url) {
    return erro(`${out?.erro ? `Falha no Google Docs (${out.erro})` : "Falha no Google Docs"}. O .docx ficou em Documentos do contrato.`, 502);
  }
  await sb.from("adm_contrato_documentos").update({ link_externo: out.url }).eq("id", doc.id);
  if (out.pasta_id && out.pasta_id !== d.pastaDrive) {
    // pasta criada agora: fica no imóvel (ou na minuta, se o imóvel ainda não está cadastrado)
    if (d.imovel?.id) await sb.from("adm_imoveis").update({ drive_pasta_id: out.pasta_id }).eq("id", d.imovel.id);
    else if (dono.tipo === "minuta") await sb.from("adm_minutas").update({ drive_pasta_id: out.pasta_id }).eq("id", dono.id);
  }
  return NextResponse.json({ ok: true, url: out.url });
}
