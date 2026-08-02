import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Documentos do locador (boletos e comprovantes de IPTU/condomínio).
// Chave: contrato + competência (YYYY-MM) + tipo.
//   GET    /api/adm/documentos?contrato=30&competencia=2026-07  -> lista + links assinados
//   POST   /api/adm/documentos   { contrato_id, competencia, tipo, mimeType, data(base64), nome, origem }
//   DELETE /api/adm/documentos?contrato=30&competencia=2026-07&tipo=boleto_iptu

const BUCKET = "documentos";
const TIPOS = [
  "boleto_iptu",
  "boleto_condominio",
  "comprovante_iptu",
  "comprovante_condominio",
] as const;
type Tipo = (typeof TIPOS)[number];

const compRe = /^\d{4}-\d{2}$/;
const compData = (c: string) => `${c}-01`;

// Cria o bucket privado se ainda não existir (idempotente).
async function garantirBucket(adm: ReturnType<typeof supabaseAdmin>) {
  const { error } = await adm.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists|exists/i.test(error.message || "")) {
    // não interrompe: pode ser permissão/ordem de corrida; o upload dirá se faltar
    console.warn("[documentos] createBucket:", error.message);
  }
}

export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const contrato = searchParams.get("contrato");
  const comp = searchParams.get("competencia");
  if (!contrato || !/^\d+$/.test(contrato))
    return NextResponse.json({ error: "contrato é obrigatório." }, { status: 400 });
  if (!comp || !compRe.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) é obrigatória." }, { status: 400 });

  const { data: rows, error } = await adm
    .from("adm_documentos")
    .select("tipo,nome,bucket,path,criado_em")
    .eq("contrato_id", Number(contrato))
    .eq("competencia", compData(comp));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const docs: Record<string, { nome: string | null; url: string | null; criado_em: string }> = {};
  for (const r of rows || []) {
    let url: string | null = null;
    const { data: sg } = await adm.storage.from(r.bucket || BUCKET).createSignedUrl(r.path, 3600);
    url = sg?.signedUrl ?? null;
    docs[r.tipo] = { nome: r.nome ?? null, url, criado_em: r.criado_em };
  }
  return NextResponse.json({ docs });
}

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
  const tipo = String(body?.tipo || "") as Tipo;
  const mimeType = String(body?.mimeType || "application/pdf");
  const nome = body?.nome ? String(body.nome) : null;
  const origem = body?.origem ? String(body.origem) : null;
  const rawData = String(body?.data || "");

  if (!contrato_id || !Number.isFinite(contrato_id))
    return NextResponse.json({ error: "contrato_id inválido." }, { status: 400 });
  if (!compRe.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) inválida." }, { status: 400 });
  if (!TIPOS.includes(tipo))
    return NextResponse.json({ error: "tipo inválido." }, { status: 400 });
  if (!rawData)
    return NextResponse.json({ error: "arquivo (data) é obrigatório." }, { status: 400 });

  // aceita tanto base64 puro quanto data URL (data:...;base64,XXXX)
  const base64 = rawData.includes(",") ? rawData.slice(rawData.indexOf(",") + 1) : rawData;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return NextResponse.json({ error: "base64 inválido." }, { status: 400 });
  }
  if (!buffer.length)
    return NextResponse.json({ error: "arquivo vazio." }, { status: 400 });

  await garantirBucket(adm);

  const path = `contrato-${contrato_id}/${comp}/${tipo}.pdf`;
  const up = await adm.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (up.error)
    return NextResponse.json({ error: `Falha no upload: ${up.error.message}` }, { status: 502 });

  const { error: dbErr } = await adm.from("adm_documentos").upsert(
    {
      contrato_id,
      competencia: compData(comp),
      tipo,
      bucket: BUCKET,
      path,
      nome,
      origem,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "contrato_id,competencia,tipo" }
  );
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const contrato = searchParams.get("contrato");
  const comp = searchParams.get("competencia");
  const tipo = String(searchParams.get("tipo") || "") as Tipo;
  if (!contrato || !/^\d+$/.test(contrato))
    return NextResponse.json({ error: "contrato é obrigatório." }, { status: 400 });
  if (!comp || !compRe.test(comp))
    return NextResponse.json({ error: "competencia (YYYY-MM) é obrigatória." }, { status: 400 });
  if (!TIPOS.includes(tipo))
    return NextResponse.json({ error: "tipo inválido." }, { status: 400 });

  const { data: rows } = await adm
    .from("adm_documentos")
    .select("bucket,path")
    .eq("contrato_id", Number(contrato))
    .eq("competencia", compData(comp))
    .eq("tipo", tipo)
    .limit(1);
  const row = rows?.[0];
  if (row?.path) {
    await adm.storage.from(row.bucket || BUCKET).remove([row.path]);
  }
  const { error } = await adm
    .from("adm_documentos")
    .delete()
    .eq("contrato_id", Number(contrato))
    .eq("competencia", compData(comp))
    .eq("tipo", tipo);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
