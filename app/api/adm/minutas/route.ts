// Minutas de locação: a locação antes da assinatura (o contrato só é cadastrado depois de assinado).
//
// GET  ?id=ID                                   -> a minuta (formulário do Novo contrato + condições do texto)
// GET                                           -> minutas em elaboração (para a lista de Contratos)
// POST { acao: "salvar", id?, dados, minuta? }  -> cria/atualiza; devolve o id
// POST { acao: "converter", id, contrato }      -> depois de cadastrar o contrato assinado: partes, documentos,
//                                                  condições e pasta do Drive passam para o contrato
// POST { acao: "descartar", id }                -> some da lista (nada é apagado)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import { normalizarMinuta } from "@/lib/contrato-locacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAVES = new Set([
  "locadorSel", "locadorNovo", "imovelSel", "imovelNovo", "locatarioSel", "locatarioNovo",
  "c", "seg", "contaModo", "contaForm", "contaAuto",
]);
const LIMITE_BYTES = 100_000;

function erro(msg: string, status = 400, detail?: unknown) {
  if (detail) console.error("minutas:", msg, detail);
  return NextResponse.json({ error: msg }, { status });
}
const idValido = (v: unknown) => (/^\d+$/.test(String(v ?? "")) ? Number(v) : null);
type SB = ReturnType<typeof supabaseAdmin>;

function limparDados(d: unknown): Record<string, unknown> | null {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) if (CHAVES.has(k)) out[k] = v;
  return JSON.stringify(out).length > LIMITE_BYTES ? null : out;
}

// "Rua X, 10 ap 5 · Fulano" para a lista
async function tituloDe(sb: SB, f: Record<string, any>): Promise<string> {
  let end = "";
  const imId = idValido(f.imovelSel);
  if (imId) {
    const { data } = await sb.from("adm_imoveis").select("rua,numero,complemento").eq("id", imId).maybeSingle();
    if (data) end = [data.rua, data.numero].filter(Boolean).join(", ") + (data.complemento ? ` ${data.complemento}` : "");
  } else if (f.imovelNovo?.rua) {
    const n = f.imovelNovo;
    end = [n.rua, n.numero].filter(Boolean).join(", ") + (n.complemento ? ` ${n.complemento}` : "");
  }
  let loc = "";
  const ltId = idValido(f.locatarioSel);
  if (ltId) {
    const { data } = await sb.from("adm_locatarios").select("nome").eq("id", ltId).maybeSingle();
    loc = data?.nome || "";
  } else if (f.locatarioNovo?.nome) loc = String(f.locatarioNovo.nome);
  return [end.trim(), loc.trim()].filter(Boolean).join(" · ").slice(0, 200) || "Minuta sem imóvel";
}

export async function GET(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return erro(ac.error, ac.status);
  const sb = supabaseAdmin();
  const id = idValido(new URL(req.url).searchParams.get("id"));
  if (id) {
    const { data, error } = await sb
      .from("adm_minutas")
      .select("id,status,titulo,dados,minuta,contrato_id,criado_por,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return erro("Falha ao carregar a minuta.", 502, error.message);
    if (!data) return erro("Minuta não encontrada.", 404);
    return NextResponse.json({ minuta: data });
  }
  const { data, error } = await sb
    .from("adm_minutas")
    .select("id,titulo,criado_por,created_at,updated_at")
    .eq("status", "rascunho")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return erro("Falha ao carregar as minutas.", 502, error.message);
  return NextResponse.json({ minutas: data || [] });
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
  const sb = supabaseAdmin();
  const agora = new Date().toISOString();

  if (body?.acao === "salvar") {
    const dados = limparDados(body.dados);
    if (!dados) return erro("Dados da minuta inválidos.");
    const patch: Record<string, unknown> = { dados, titulo: await tituloDe(sb, dados as any), updated_at: agora };
    if (body.minuta !== undefined) patch.minuta = normalizarMinuta(body.minuta);
    const id = idValido(body.id);
    if (id) {
      const { data, error } = await sb.from("adm_minutas").update(patch).eq("id", id).eq("status", "rascunho").select("id");
      if (error) return erro("Falha ao salvar a minuta.", 502, error.message);
      if (!data?.length) return erro("Minuta não encontrada (ou já virou contrato).", 404);
      return NextResponse.json({ ok: true, id });
    }
    const { data, error } = await sb
      .from("adm_minutas")
      .insert({ ...patch, minuta: patch.minuta ?? {}, criado_por: ac.email })
      .select("id")
      .single();
    if (error || !data) return erro("Falha ao criar a minuta.", 502, error?.message);
    return NextResponse.json({ ok: true, id: data.id });
  }

  const id = idValido(body?.id);
  if (!id) return erro("Minuta inválida.");
  const { data: m } = await sb.from("adm_minutas").select("id,status,minuta,drive_pasta_id").eq("id", id).maybeSingle();
  if (!m) return erro("Minuta não encontrada.", 404);
  if (m.status !== "rascunho") return erro("Esta minuta já virou contrato ou foi descartada.");

  if (body.acao === "descartar") {
    await sb.from("adm_minutas").update({ status: "descartada", updated_at: agora }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (body.acao === "converter") {
    const contrato = idValido(body.contrato);
    if (!contrato) return erro("Contrato inválido.");
    const { data: c } = await sb.from("adm_contratos").select("id,imovel_id,minuta").eq("id", contrato).maybeSingle();
    if (!c) return erro("Contrato não encontrado.", 404);
    // só um contrato recém-criado (sem partes próprias) recebe a minuta
    const { count } = await sb.from("adm_contrato_partes").select("id", { count: "exact", head: true }).eq("contrato_id", contrato);
    if (count) return erro("Este contrato já tem partes cadastradas.");

    const e1 = await sb.from("adm_contrato_partes").update({ contrato_id: contrato, updated_at: agora }).eq("minuta_id", id);
    if (e1.error) return erro("Falha ao passar as partes para o contrato.", 502, e1.error.message);
    const e2 = await sb.from("adm_contrato_documentos").update({ contrato_id: contrato }).eq("minuta_id", id);
    if (e2.error) return erro("Falha ao passar os documentos para o contrato.", 502, e2.error.message);
    if (!c.minuta || !Object.keys(c.minuta).length) {
      await sb.from("adm_contratos").update({ minuta: m.minuta || {} }).eq("id", contrato);
    }
    if (m.drive_pasta_id && c.imovel_id) {
      await sb.from("adm_imoveis").update({ drive_pasta_id: m.drive_pasta_id }).eq("id", c.imovel_id).is("drive_pasta_id", null);
    }
    await sb.from("adm_minutas").update({ status: "convertida", contrato_id: contrato, updated_at: agora }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return erro("Ação desconhecida.");
}
