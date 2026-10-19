// Partes do contrato de locação (locadores, locatários e fiadores) — uso interno.
//
// (todas as rotas aceitam `minuta` no lugar de `contrato`: locação ainda não assinada)
// GET    ?contrato=ID                    -> partes salvas + documentos de cada uma; sem partes
//                                           salvas, devolve sugestões tiradas do cadastro
//                                           (locador do imóvel e locatário do contrato)
// POST   { acao: "salvar", contrato, parte, documentos? }
//                                        -> cria/atualiza a parte; `documentos` (ids) são os
//                                           arquivos enviados antes de a parte existir
// POST   { acao: "ler", contrato, documento_id }
//                                        -> leitura automática do documento (n8n "Painel — Ler
//                                           documento da parte", Gemini); grava dados_extraidos
// DELETE ?id=PARTE&contrato=ID           -> remove a parte (os documentos ficam na pasta)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import {
  TIPOS_DOC_PARTE_VALIDOS,
  fmtCpfCnpj,
  normalizarParte,
  rotuloDoc,
  soDigitos,
  tipoLeitura,
  tipoPorDocumento,
  type Parte,
} from "@/lib/contrato-partes";
import { donoDe, donoExiste, type Dono } from "@/lib/contrato-dono";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BUCKET = "documentos";
const N8N = (process.env.N8N_WEBHOOK_BASE || "https://villejds.app.n8n.cloud/webhook").replace(/\/+$/, "");
const COLS =
  "id,contrato_id,minuta_id,papel,ordem,tipo_pessoa,nome,cpf_cnpj,rg,genero,nacionalidade,estado_civil,regime_bens,profissao,email,telefone,endereco,representacao,conjuge,imoveis";
const LIMITE_LEITURA = 20 * 1024 * 1024;

function erro(msg: string, status = 400, detail?: unknown) {
  if (detail) console.error("contrato-partes:", msg, detail);
  return NextResponse.json({ error: msg }, { status });
}

function idValido(v: unknown): number | null {
  const s = String(v ?? "");
  return /^\d+$/.test(s) ? Number(s) : null;
}

type SB = ReturnType<typeof supabaseAdmin>;

async function docsDasPartes(sb: SB, dono: Dono) {
  const { data, error } = await sb
    .from("adm_contrato_documentos")
    .select("id,parte_id,tipo_documento,nome,path,criado_em,dados_extraidos")
    .eq(dono.col, dono.id)
    .eq("categoria", "documentos_partes")
    .is("excluido_em", null)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(error.message);
  const docs = data || [];
  const urls = new Map<string, string>();
  if (docs.length) {
    const { data: assinadas } = await sb.storage.from(BUCKET).createSignedUrls(docs.map((d) => d.path), 3600);
    for (const a of assinadas || []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }
  return docs.map(({ path, dados_extraidos, ...d }) => ({ ...d, lido: !!dados_extraidos, url: urls.get(path) || null }));
}

// pessoa digitada no Novo contrato (minuta) -> sugestão de parte
function pessoaNova(papel: "locador" | "locatario", n: any): Parte | null {
  const nome = String(n?.nome || "").trim();
  if (!nome) return null;
  const doc = String(n?.cpf_cnpj || "").trim();
  return {
    papel, tipo_pessoa: tipoPorDocumento(doc), nome, cpf_cnpj: doc ? fmtCpfCnpj(doc) : null,
    email: String(n?.email || "").trim() || null, telefone: String(n?.telefone || "").trim() || null,
  };
}

async function sugestoes(sb: SB, dono: Dono): Promise<Parte[]> {
  let imovelId: number | null = null;
  let locadorId: number | null = null;
  let locatarioId: number | null = null;
  const out: Parte[] = [];
  if (dono.tipo === "contrato") {
    const { data: c } = await sb
      .from("adm_contratos")
      .select("imovel_id,locatario_id")
      .eq("id", dono.id)
      .maybeSingle();
    if (!c) return [];
    imovelId = c.imovel_id;
    locatarioId = c.locatario_id;
  } else {
    // minuta: o que foi escolhido ou digitado no formulário do Novo contrato
    const { data: m } = await sb.from("adm_minutas").select("dados").eq("id", dono.id).maybeSingle();
    const f = (m?.dados || {}) as Record<string, any>;
    const num = (v: unknown) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : null);
    imovelId = num(f.imovelSel);
    locadorId = num(f.locadorSel);
    locatarioId = num(f.locatarioSel);
    if (!imovelId && !locadorId && f.locadorSel === "__novo__") {
      const p = pessoaNova("locador", f.locadorNovo);
      if (p) out.push(p);
    }
    if (!locatarioId && f.locatarioSel === "__novo__") {
      const p = pessoaNova("locatario", f.locatarioNovo);
      if (p) out.push(p);
    }
  }
  if (imovelId && !locadorId) {
    const { data: im } = await sb.from("adm_imoveis").select("locador_id").eq("id", imovelId).maybeSingle();
    locadorId = im?.locador_id || null;
  }
  if (locadorId) {
    const { data: lo } = await sb
      .from("adm_locadores")
      .select("nome,cpf_cnpj,email,telefone,end_tipo_logradouro,end_logradouro,end_numero,end_complemento,end_bairro,end_uf,end_cep")
      .eq("id", locadorId)
      .maybeSingle();
    if (lo?.nome) {
      const log = [lo.end_tipo_logradouro, lo.end_logradouro].filter(Boolean).join(" ");
      const cep = soDigitos(lo.end_cep);
      const end = log
        ? [log, lo.end_numero ? `nº ${lo.end_numero}` : null, lo.end_complemento, lo.end_bairro, lo.end_uf,
           cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : null].filter(Boolean).join(", ")
        : null;
      out.push({
        papel: "locador", tipo_pessoa: tipoPorDocumento(lo.cpf_cnpj), nome: lo.nome,
        cpf_cnpj: lo.cpf_cnpj ? fmtCpfCnpj(lo.cpf_cnpj) : null, email: lo.email, telefone: lo.telefone, endereco: end,
      });
    }
  }
  if (locatarioId) {
    const { data: la } = await sb
      .from("adm_locatarios")
      .select("nome,cpf_cnpj,email,telefone")
      .eq("id", locatarioId)
      .maybeSingle();
    if (la?.nome) {
      out.push({
        papel: "locatario", tipo_pessoa: tipoPorDocumento(la.cpf_cnpj), nome: la.nome,
        cpf_cnpj: la.cpf_cnpj ? fmtCpfCnpj(la.cpf_cnpj) : null, email: la.email, telefone: la.telefone,
      });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  const dono = donoDe(new URL(req.url).searchParams);
  if (!dono) return erro("contrato inválido.");
  const sb = supabaseAdmin();
  const { data: partes, error } = await sb
    .from("adm_contrato_partes")
    .select(COLS)
    .eq(dono.col, dono.id)
    .order("papel")
    .order("ordem");
  if (error) return erro("Falha ao carregar as partes.", 502, error.message);
  try {
    const documentos = await docsDasPartes(sb, dono);
    // sugestões (do cadastro / do formulário da minuta) só para os papéis ainda sem parte salva
    const comParte = new Set((partes || []).map((p: any) => p.papel));
    const sug = (await sugestoes(sb, dono)).filter((p) => !comParte.has(p.papel));
    return NextResponse.json({ partes: partes || [], documentos, sugestoes: sug });
  } catch (e) {
    return erro("Falha ao carregar os documentos das partes.", 502, e);
  }
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
  if (!dono) return erro("contrato inválido.");
  const sb = supabaseAdmin();
  if (!(await donoExiste(sb, dono))) return erro(dono.tipo === "contrato" ? "Contrato não encontrado." : "Minuta não encontrada.", 404);

  if (body.acao === "salvar") {
    const n = normalizarParte(body.parte);
    if (!n.ok) return erro(n.error);
    const p = n.parte;
    const id = idValido(body.parte?.id);
    let salvo: any;
    if (id) {
      const { data, error } = await sb
        .from("adm_contrato_partes")
        .update({ ...p, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq(dono.col, dono.id)
        .select(COLS);
      if (error) return erro("Falha ao salvar a parte.", 502, error.message);
      if (!data?.length) return erro("Parte não encontrada neste contrato.", 404);
      salvo = data[0];
    } else {
      const { data: ult } = await sb
        .from("adm_contrato_partes")
        .select("ordem")
        .eq(dono.col, dono.id)
        .eq("papel", p.papel)
        .order("ordem", { ascending: false })
        .limit(1);
      const ordem = ((ult?.[0]?.ordem as number) || 0) + 1;
      const { data, error } = await sb
        .from("adm_contrato_partes")
        .insert({ ...p, [dono.col]: dono.id, ordem })
        .select(COLS)
        .single();
      if (error || !data) return erro("Falha ao cadastrar a parte.", 502, error?.message);
      salvo = data;
    }

    // documentos enviados antes de a parte existir passam a ser dela
    const novos = (Array.isArray(body.documentos) ? body.documentos : []).map(idValido).filter(Boolean) as number[];
    if (novos.length) {
      await sb
        .from("adm_contrato_documentos")
        .update({ parte_id: salvo.id })
        .eq(dono.col, dono.id)
        .eq("categoria", "documentos_partes")
        .is("parte_id", null)
        .in("id", novos.slice(0, 50));
    }
    // descrição dos documentos acompanha o nome da parte (aparece na pasta do contrato)
    const { data: docs } = await sb
      .from("adm_contrato_documentos")
      .select("id,tipo_documento")
      .eq("parte_id", salvo.id)
      .is("excluido_em", null);
    for (const d of docs || []) {
      await sb
        .from("adm_contrato_documentos")
        .update({ descricao: `${rotuloDoc(d.tipo_documento)} — ${salvo.nome}` })
        .eq("id", d.id);
    }
    return NextResponse.json({ ok: true, parte: salvo });
  }

  if (body.acao === "ler") {
    const docId = idValido(body.documento_id);
    if (!docId) return erro("Documento inválido.");
    const { data: doc } = await sb
      .from("adm_contrato_documentos")
      .select("id,path,mime,tamanho,tipo_documento,categoria")
      .eq("id", docId)
      .eq(dono.col, dono.id)
      .is("excluido_em", null)
      .maybeSingle();
    if (!doc || doc.categoria !== "documentos_partes") return erro("Documento não encontrado.", 404);
    if (!doc.tipo_documento || !TIPOS_DOC_PARTE_VALIDOS.has(doc.tipo_documento)) return erro("Tipo de documento sem leitura automática.");
    if (doc.tamanho && doc.tamanho > LIMITE_LEITURA) return erro("Arquivo grande demais para leitura automática (acima de 20 MB).", 413);
    const mime = String(doc.mime || "");
    if (mime && !/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i.test(mime)) {
      return erro("A leitura automática aceita PDF ou foto (JPG, PNG, WEBP, HEIC).", 415);
    }

    const { data: sec } = await sb.from("credenciais_sistema").select("valor").eq("chave", "painel_upload_secret").maybeSingle();
    const segredo = (sec as { valor?: string } | null)?.valor;
    if (!segredo) return erro("Leitura automática não configurada (segredo ausente).", 503);

    const { data: link, error: e1 } = await sb.storage.from(BUCKET).createSignedUrl(doc.path, 300);
    if (e1 || !link?.signedUrl) return erro("Falha ao preparar o arquivo para leitura.", 502, e1?.message);

    let resp: Response;
    try {
      resp = await fetch(`${N8N}/painel-ler-documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-painel-secret": segredo },
        body: JSON.stringify({ tipo: tipoLeitura(doc.tipo_documento), url: link.signedUrl, mime: mime || null }),
        signal: AbortSignal.timeout(80_000),
      });
    } catch {
      return erro("A leitura demorou demais. Preencha os campos à mão ou tente de novo.", 504);
    }
    const out = await resp.json().catch(() => ({}) as any);
    if (!resp.ok || !out?.ok || !out?.dados) {
      return erro(out?.erro ? `Não consegui ler o documento (${out.erro}).` : "Não consegui ler o documento.", 502);
    }
    await sb.from("adm_contrato_documentos").update({ dados_extraidos: out.dados }).eq("id", doc.id);
    return NextResponse.json({ ok: true, tipo: doc.tipo_documento, dados: out.dados });
  }

  return erro("Ação desconhecida.");
}

export async function DELETE(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  const u = new URL(req.url).searchParams;
  const id = idValido(u.get("id"));
  const dono = donoDe(u);
  if (!id || !dono) return erro("Parâmetros inválidos.");
  const { data, error } = await supabaseAdmin()
    .from("adm_contrato_partes")
    .delete()
    .eq("id", id)
    .eq(dono.col, dono.id)
    .select("id");
  if (error) return erro("Falha ao remover a parte.", 502, error.message);
  if (!data?.length) return erro("Parte não encontrada.", 404);
  return NextResponse.json({ ok: true });
}
