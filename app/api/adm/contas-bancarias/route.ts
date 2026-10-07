import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import { normalizarConta } from "@/lib/bancos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPOS = "id,contrato_id,imovel_id,locador_id,titular,cpf_cnpj,banco_ispb,agencia,conta,tipo_conta";

// Lista as contas bancárias de um locador/contrato para escolher o destino do
// repasse via Pix.
//   GET /api/adm/contas-bancarias?contrato=30   (ou ?locador=12)
// Com ?contrato também devolve { locador: {id,nome,cpf_cnpj} } (tela do contrato).
export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const contrato = searchParams.get("contrato");
  const locador = searchParams.get("locador");

  if (!contrato && !locador) {
    return NextResponse.json({ error: "Informe contrato ou locador." }, { status: 400 });
  }

  let q = adm
    .from("adm_contas_bancarias")
    .select(CAMPOS)
    .order("id");

  // Preferimos a conta específica do contrato; se não houver, cai para as do locador.
  if (contrato) {
    q = q.eq("contrato_id", Number(contrato));
  } else if (locador) {
    q = q.eq("locador_id", Number(locador));
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let contas = data || [];
  // Fallback: contrato sem conta própria → usa as do locador
  if (!contas.length && contrato) {
    const { data: rep } = await adm
      .from("adm_repasses")
      .select("locador_id")
      .eq("contrato_id", Number(contrato))
      .order("competencia", { ascending: false })
      .limit(1);
    const locId = rep?.[0]?.locador_id;
    if (locId) {
      const { data: dl } = await adm
        .from("adm_contas_bancarias")
        .select(CAMPOS)
        .eq("locador_id", locId)
        .order("id");
      contas = dl || [];
    }
  }

  let dono: { id: number; nome: string; cpf_cnpj: string | null } | null = null;
  if (contrato) {
    const { data: c } = await adm
      .from("adm_contratos")
      .select("adm_imoveis(adm_locadores(id,nome,cpf_cnpj))")
      .eq("id", Number(contrato))
      .maybeSingle();
    dono = ((c as any)?.adm_imoveis?.adm_locadores as typeof dono) || null;
  }

  return NextResponse.json({ contas, locador: dono });
}

// ------------------------------------------------------------------------------------
// Cadastro/edição (telas Novo/Editar contrato) — só admin ou pode_cobrancas
// ------------------------------------------------------------------------------------

// POST { contrato_id, titular, cpf_cnpj, banco_ispb, agencia, conta, tipo_conta }
export async function POST(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const contratoId = Number(body?.contrato_id);
  if (!Number.isInteger(contratoId) || contratoId <= 0) {
    return NextResponse.json({ error: "contrato inválido." }, { status: 400 });
  }
  const n = normalizarConta(body);
  if (!n.ok) return NextResponse.json({ error: n.error }, { status: 400 });

  const adm = supabaseAdmin();
  const { data: c } = await adm
    .from("adm_contratos")
    .select("id,imovel_id,adm_imoveis(locador_id)")
    .eq("id", contratoId)
    .maybeSingle();
  if (!c) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });

  const { data, error } = await adm
    .from("adm_contas_bancarias")
    .insert({
      contrato_id: contratoId,
      imovel_id: (c as any).imovel_id,
      locador_id: (c as any).adm_imoveis?.locador_id ?? null,
      ...n.dados,
    })
    .select(CAMPOS)
    .single();
  if (error) return NextResponse.json({ error: "Falha ao salvar a conta.", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, conta: data });
}

// PATCH ?id=N { titular, cpf_cnpj, banco_ispb, agencia, conta, tipo_conta }
export async function PATCH(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido." }, { status: 400 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const n = normalizarConta(body);
  if (!n.ok) return NextResponse.json({ error: n.error }, { status: 400 });

  const { data, error } = await supabaseAdmin()
    .from("adm_contas_bancarias")
    .update({ ...n.dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(CAMPOS);
  if (error) return NextResponse.json({ error: "Falha ao salvar a conta.", detail: error.message }, { status: 502 });
  if (!data?.length) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, conta: data[0] });
}

// DELETE ?id=N — só se a conta nunca foi usada num pagamento
export async function DELETE(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido." }, { status: 400 });
  const adm = supabaseAdmin();
  const { count } = await adm
    .from("adm_pagamentos")
    .select("id", { count: "exact", head: true })
    .eq("conta_bancaria_id", id);
  if (count) {
    return NextResponse.json(
      { error: "Esta conta já recebeu repasse — não dá para excluir. Edite os dados se mudou." },
      { status: 409 }
    );
  }
  const { error } = await adm.from("adm_contas_bancarias").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Falha ao excluir.", detail: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
