// Pasta de documentos do contrato de locação (uso interno).
//
// GET    ?contrato=ID                      -> documentos (com link temporário) + apólices do contrato
// POST   { acao: "upload-url", ... }       -> URL assinada p/ o NAVEGADOR subir o arquivo direto
//                                             no Storage (não passa pela Vercel -> sem limite de 4,5 MB)
// POST   { acao: "registrar", ... }        -> grava o documento (e cria/atualiza a apólice, se for o caso)
// POST   { acao: "seguro", ... }           -> atualiza dados/vigência de uma apólice do contrato
// PATCH  ?id=DOC  { descricao?, categoria? }
// DELETE ?id=DOC                           -> exclusão suave (some da tela; arquivo fica no Storage)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import { CATEGORIAS_VALIDAS, TIPOS_SEGURO_VALIDOS, diasAte } from "@/lib/contrato-documentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documentos";
const LINK_SEGUNDOS = 3600;

function erro(msg: string, status = 400, detail?: unknown) {
  return NextResponse.json({ error: msg, ...(detail ? { detail: String(detail) } : {}) }, { status });
}

function idValido(v: unknown): number | null {
  const s = String(v ?? "");
  return /^\d+$/.test(s) ? Number(s) : null;
}

function dataOuNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function textoOuNull(v: unknown, max = 300): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

// nome de arquivo seguro p/ o path do Storage (sem acento/espaço)
function slug(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return (base || "arquivo").slice(-120);
}

async function contratoExiste(sb: ReturnType<typeof supabaseAdmin>, id: number) {
  const { data } = await sb.from("adm_contratos").select("id").eq("id", id).maybeSingle();
  return !!data;
}

export async function GET(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);

  const contrato = idValido(new URL(req.url).searchParams.get("contrato"));
  if (!contrato) return erro("contrato inválido.");

  const sb = supabaseAdmin();
  const [docsR, segR] = await Promise.all([
    sb
      .from("adm_contrato_documentos")
      .select("id,categoria,seguro_id,descricao,nome,path,tamanho,mime,enviado_por,criado_em")
      .eq("contrato_id", contrato)
      .is("excluido_em", null)
      .order("criado_em", { ascending: false }),
    sb
      .from("adm_seguros")
      .select("id,tipo,seguradora,numero_apolice,vigencia_inicio,vigencia_fim,ativo")
      .eq("contrato_id", contrato)
      .order("ativo", { ascending: false })
      .order("vigencia_fim", { ascending: false, nullsFirst: false }),
  ]);
  if (docsR.error) return erro("Falha ao carregar documentos.", 502, docsR.error.message);
  if (segR.error) return erro("Falha ao carregar apólices.", 502, segR.error.message);

  const docs = docsR.data || [];
  const urls = new Map<string, string>();
  if (docs.length) {
    const { data: assinadas } = await sb.storage.from(BUCKET).createSignedUrls(
      docs.map((d) => d.path),
      LINK_SEGUNDOS
    );
    for (const a of assinadas || []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }

  return NextResponse.json({
    documentos: docs.map(({ path, ...d }) => ({ ...d, url: urls.get(path) || null })),
    seguros: (segR.data || []).map((s) => ({ ...s, dias: diasAte(s.vigencia_fim) })),
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

  const contrato = idValido(body?.contrato);
  if (!contrato) return erro("contrato inválido.");
  const sb = supabaseAdmin();
  if (!(await contratoExiste(sb, contrato))) return erro("Contrato não encontrado.", 404);

  // 1) URL assinada para upload direto do navegador
  if (body.acao === "upload-url") {
    const categoria = String(body.categoria || "");
    if (!CATEGORIAS_VALIDAS.has(categoria)) return erro("Categoria inválida.");
    const nome = String(body.nome || "arquivo");
    const path = `contratos/${contrato}/${categoria}/${Date.now()}-${slug(nome)}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return erro("Falha ao preparar o envio.", 502, error?.message);
    return NextResponse.json({ path: data.path, signedUrl: data.signedUrl });
  }

  // 2) registrar o documento já enviado
  if (body.acao === "registrar") {
    const categoria = String(body.categoria || "");
    if (!CATEGORIAS_VALIDAS.has(categoria)) return erro("Categoria inválida.");
    const path = String(body.path || "");
    if (!path.startsWith(`contratos/${contrato}/${categoria}/`)) return erro("Arquivo inválido.");

    let seguroId: number | null = null;
    if (categoria === "apolice") {
      const ap = body.apolice || {};
      const campos = {
        seguradora: textoOuNull(ap.seguradora, 120),
        numero_apolice: textoOuNull(ap.numero_apolice, 120),
        vigencia_inicio: dataOuNull(ap.vigencia_inicio),
        vigencia_fim: dataOuNull(ap.vigencia_fim),
      };
      const existente = idValido(ap.seguro_id);
      if (existente) {
        // vincula a uma apólice já cadastrada; completa só o que veio preenchido
        const { data: s } = await sb
          .from("adm_seguros")
          .select("id")
          .eq("id", existente)
          .eq("contrato_id", contrato)
          .maybeSingle();
        if (!s) return erro("Apólice não pertence a este contrato.");
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(campos)) if (v) patch[k] = v;
        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString();
          const { error } = await sb.from("adm_seguros").update(patch).eq("id", existente);
          if (error) return erro("Falha ao atualizar a apólice.", 502, error.message);
        }
        seguroId = existente;
      } else {
        const tipo = String(ap.tipo || "");
        if (!TIPOS_SEGURO_VALIDOS.has(tipo)) return erro("Informe o tipo da apólice.");
        const { data: novo, error } = await sb
          .from("adm_seguros")
          .insert({ contrato_id: contrato, tipo, ativo: true, ...campos })
          .select("id")
          .single();
        if (error || !novo) return erro("Falha ao cadastrar a apólice.", 502, error?.message);
        seguroId = novo.id as number;

        // apólice nova do mesmo tipo substitui a anterior (que vence antes) -> a antiga sai do alerta
        if (campos.vigencia_fim) {
          await sb
            .from("adm_seguros")
            .update({ ativo: false, updated_at: new Date().toISOString() })
            .eq("contrato_id", contrato)
            .eq("tipo", tipo)
            .eq("ativo", true)
            .neq("id", seguroId)
            .or(`vigencia_fim.is.null,vigencia_fim.lt.${campos.vigencia_fim}`);
        }
      }
    }

    const tamanho = Number(body.tamanho);
    const { data: doc, error } = await sb
      .from("adm_contrato_documentos")
      .insert({
        contrato_id: contrato,
        categoria,
        seguro_id: seguroId,
        descricao: textoOuNull(body.descricao),
        nome: textoOuNull(body.nome, 250) || "arquivo",
        bucket: BUCKET,
        path,
        tamanho: Number.isFinite(tamanho) ? tamanho : null,
        mime: textoOuNull(body.mime, 120),
        enviado_por: ac.email,
      })
      .select("id")
      .single();
    if (error || !doc) return erro("Falha ao registrar o documento.", 502, error?.message);
    return NextResponse.json({ ok: true, id: doc.id, seguro_id: seguroId });
  }

  // 3) atualizar dados/vigência de uma apólice do contrato
  if (body.acao === "seguro") {
    const seguroId = idValido(body.seguro_id);
    if (!seguroId) return erro("Apólice inválida.");
    const patch: Record<string, unknown> = {
      seguradora: textoOuNull(body.seguradora, 120),
      numero_apolice: textoOuNull(body.numero_apolice, 120),
      vigencia_inicio: dataOuNull(body.vigencia_inicio),
      vigencia_fim: dataOuNull(body.vigencia_fim),
      updated_at: new Date().toISOString(),
    };
    if (typeof body.ativo === "boolean") patch.ativo = body.ativo;
    const { data, error } = await sb
      .from("adm_seguros")
      .update(patch)
      .eq("id", seguroId)
      .eq("contrato_id", contrato)
      .select("id");
    if (error) return erro("Falha ao salvar a apólice.", 502, error.message);
    if (!data?.length) return erro("Apólice não pertence a este contrato.", 404);
    return NextResponse.json({ ok: true });
  }

  return erro("Ação desconhecida.");
}

export async function PATCH(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  const id = idValido(new URL(req.url).searchParams.get("id"));
  if (!id) return erro("id inválido.");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return erro("Corpo inválido.");
  }
  const patch: Record<string, unknown> = {};
  if ("descricao" in body) patch.descricao = textoOuNull(body.descricao);
  if ("nome" in body) {
    const n = textoOuNull(body.nome, 250);
    if (!n) return erro("Nome vazio.");
    patch.nome = n;
  }
  if (!Object.keys(patch).length) return erro("Nada para salvar.");

  const { data, error } = await supabaseAdmin()
    .from("adm_contrato_documentos")
    .update(patch)
    .eq("id", id)
    .is("excluido_em", null)
    .select("id");
  if (error) return erro("Falha ao salvar.", 502, error.message);
  if (!data?.length) return erro("Documento não encontrado.", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  const id = idValido(new URL(req.url).searchParams.get("id"));
  if (!id) return erro("id inválido.");

  const { data, error } = await supabaseAdmin()
    .from("adm_contrato_documentos")
    .update({ excluido_em: new Date().toISOString() })
    .eq("id", id)
    .is("excluido_em", null)
    .select("id");
  if (error) return erro("Falha ao excluir.", 502, error.message);
  if (!data?.length) return erro("Documento não encontrado.", 404);
  return NextResponse.json({ ok: true });
}
