import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers() {
  return { apikey: KEY as string, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
}

// campos que a tela pode alterar (whitelist — protege contra gravar lixo)
const CAMPOS_EDITAVEIS = new Set([
  "data_inicio", "data_primeiro_aluguel", "data_vigencia_atual",
  "dia_vencimento", "dia_vencimento_condominio",
  "valor_primeiro_aluguel", "valor_atual_aluguel",
  "tipo_uso", "indice_reajuste", "taxa_administracao",
  "prazo_meses", "periodo_reajuste_meses", "prazo_indeterminado",
  "iptu_responsavel", "condominio_responsavel",
  "garantia_categoria", "garantia_seguradora", "garantia_prazo_meses",
  "validade_garantia", "valor_seguro_fianca",
  "multa_percentual", "mora_percentual", "status",
]);

// GET /api/adm/contrato?id=15  → contrato + nome do imóvel/locatário
export async function GET(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: "id inválido." }, { status: 400 });

  try {
    // contrato com join de imóvel e locatário (embed do PostgREST)
    const sel =
      "*,adm_imoveis(id,rua,numero,bairro,cidade),adm_locatarios(id,nome)";
    const res = await fetch(
      `${SUPA}/rest/v1/adm_contratos?id=eq.${id}&select=${encodeURIComponent(sel)}`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Falha ao carregar", detail: await res.text() }, { status: 502 });
    }
    const arr = (await res.json()) as any[];
    if (!arr.length) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
    return NextResponse.json(arr[0]);
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}

// PATCH /api/adm/contrato?id=15  body: { campos... }
export async function PATCH(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: "id inválido." }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  // filtra só os campos editáveis; normaliza vazios em null
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!CAMPOS_EDITAVEIS.has(k)) continue;
    patch[k] = v === "" ? null : v;
  }
  patch["updated_at"] = new Date().toISOString();

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "Nenhum campo válido para salvar." }, { status: 400 });
  }

  try {
    const res = await fetch(`${SUPA}/rest/v1/adm_contratos?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...headers(), Prefer: "return=representation" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Falha ao salvar", detail: await res.text() }, { status: 502 });
    }
    const arr = (await res.json()) as any[];
    return NextResponse.json({ ok: true, contrato: arr[0] || null });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
