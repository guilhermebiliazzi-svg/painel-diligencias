import { NextResponse } from "next/server";
import { headersRender } from "@/lib/nfse-nacional";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnóstico do Emissor Nacional (só admin, só leitura).
 *
 *   ?tipo=dfe&nsu=0            documentos do CNPJ no ADN a partir do NSU
 *                              (mostra notas feitas no Emissor web)
 *   ?tipo=nfse&chave=<50>      resumo de uma NFS-e
 *   ?tipo=parametros&caminho=3550308/convenio
 *   &teste=1                   produção restrita
 *   &xml=1                     inclui o XML completo
 */
export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const email = (auth.user.email || "").toLowerCase();
  const { data: perfil } = await sb.from("perfis").select("is_admin").eq("email", email).maybeSingle();
  if (!perfil?.is_admin) return NextResponse.json({ error: "Só administradores." }, { status: 403 });

  const base = process.env.NFSE_RENDER_URL;
  if (!base) return NextResponse.json({ error: "NFSE_RENDER_URL não configurada." }, { status: 500 });

  const u = new URL(req.url);
  const tipo = u.searchParams.get("tipo") || "dfe";
  const qs = new URLSearchParams();
  for (const k of ["nsu", "caminho", "teste", "xml"]) {
    const v = u.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  let rota: string;
  if (tipo === "dfe") rota = "/nfse-nacional/dfe";
  else if (tipo === "parametros") rota = "/nfse-nacional/parametros";
  else if (tipo === "nfse") rota = `/nfse-nacional/nfse/${String(u.searchParams.get("chave") || "").replace(/\D/g, "")}`;
  else return NextResponse.json({ error: "tipo deve ser dfe, nfse ou parametros." }, { status: 400 });

  const r = await fetch(`${base.replace(/\/$/, "")}${rota}?${qs}`, { headers: headersRender(), cache: "no-store" });
  const txt = await r.text();
  let d: any;
  try {
    d = JSON.parse(txt);
  } catch {
    d = { corpo: txt.slice(0, 2000) };
  }
  return NextResponse.json(d, { status: r.status });
}
