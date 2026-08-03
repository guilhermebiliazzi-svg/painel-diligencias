import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { salvarComprovanteBoleto } from "@/lib/salvar-comprovante";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista as obrigações de IPTU/condomínio de responsabilidade da IMOBILIÁRIA
// em uma competência — para pagamento pela tela "Contas a pagar".
//   GET /api/adm/contas-a-pagar?competencia=2026-07
const compRe = /^\d{4}-\d{2}$/;

export async function GET(req: Request) {
  const adm = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const comp = searchParams.get("competencia") || "";
  if (!compRe.test(comp)) {
    return NextResponse.json({ error: "competencia (YYYY-MM) é obrigatória." }, { status: 400 });
  }
  const compData = `${comp}-01`;

  // contratos em que a imobiliária paga IPTU e/ou condomínio
  const { data: contratos, error } = await adm
    .from("adm_contratos")
    .select("id,iptu_responsavel,condominio_responsavel,imovel:adm_imoveis(rua,numero,complemento,bairro),locatario:adm_locatarios(nome)")
    .or("iptu_responsavel.eq.imobiliaria,condominio_responsavel.eq.imobiliaria");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (contratos || []).map((c: any) => c.id);
  if (!ids.length) return NextResponse.json({ competencia: comp, itens: [] });

  // valores da competência
  const { data: desps } = await adm
    .from("adm_despesas")
    .select("contrato_id,iptu,condominio")
    .eq("competencia", compData)
    .in("contrato_id", ids);
  const despPor: Record<number, { iptu: number; condominio: number }> = {};
  for (const d of (desps || []) as any[]) {
    despPor[d.contrato_id] = { iptu: Number(d.iptu) || 0, condominio: Number(d.condominio) || 0 };
  }

  // boletos (PDF) já anexados — link para ler a linha digitável
  const { data: docs } = await adm
    .from("adm_documentos")
    .select("contrato_id,tipo,bucket,path,nome")
    .eq("competencia", compData)
    .in("contrato_id", ids)
    .in("tipo", ["boleto_iptu", "boleto_condominio"]);
  const docPor: Record<string, { bucket: string; path: string; nome: string | null }> = {};
  for (const d of (docs || []) as any[]) {
    docPor[`${d.contrato_id}|${d.tipo}`] = { bucket: d.bucket, path: d.path, nome: d.nome };
  }

  // pagamentos já lançados
  const { data: pgs } = await adm
    .from("adm_pagamentos")
    .select("id,contrato_id,subtipo,status,inter_codigo,inter_status,valor,vencimento,linha_digitavel,comprovante_path")
    .eq("tipo", "boleto")
    .eq("competencia", compData)
    .in("contrato_id", ids);
  const pgPor: Record<string, any[]> = {};
  for (const p of (pgs || []) as any[]) {
    (pgPor[`${p.contrato_id}|${p.subtipo}`] ||= []).push(p);
  }

  async function link(k: string): Promise<{ url: string | null; nome: string | null } | null> {
    const d = docPor[k];
    if (!d) return null;
    const { data: sg } = await adm.storage.from(d.bucket || "documentos").createSignedUrl(d.path, 3600);
    return { url: sg?.signedUrl ?? null, nome: d.nome };
  }

  const itens: any[] = [];
  const backfills: Promise<any>[] = [];
  for (const c of contratos as any[]) {
    const im = c.imovel || {};
    const complemento = im.complemento ? String(im.complemento).trim() : "";
    const endereco =
      [im.rua, im.numero].filter(Boolean).join(", ") +
      (complemento ? ` — ${complemento}` : "") +
      (im.bairro ? `, ${im.bairro}` : "") || `Contrato #${c.id}`;
    const locatario = c.locatario?.nome || null;
    const dv = despPor[c.id] || { iptu: 0, condominio: 0 };

    for (const sub of ["iptu", "condominio"] as const) {
      const responsavel = sub === "iptu" ? c.iptu_responsavel : c.condominio_responsavel;
      if (responsavel !== "imobiliaria") continue;
      const valor = dv[sub];
      const boleto = await link(`${c.id}|boleto_${sub}`);
      // só entra na lista se há valor a pagar ou um boleto anexado
      if (!(valor > 0) && !boleto) continue;
      const lista = pgPor[`${c.id}|${sub}`] || [];
      // boletos pagos sem comprovante ainda → gera (retroativo), best-effort
      for (const pg of lista) {
        if (pg.status === "efetivado" && !pg.comprovante_path) {
          backfills.push(salvarComprovanteBoleto(pg.id, { subtipo: sub }).catch(() => null));
        }
      }
      itens.push({
        contrato_id: c.id,
        endereco,
        complemento: complemento || null,
        locatario,
        subtipo: sub,
        rotulo: sub === "iptu" ? "IPTU" : "Condomínio",
        valor,
        boleto,
        pagamentos: lista.map((pg: any) => ({
          id: pg.id,
          status: pg.status,
          inter_status: pg.inter_status,
          inter_codigo: pg.inter_codigo,
          valor: Number(pg.valor),
          linha_digitavel: pg.linha_digitavel,
        })),
      });
    }
  }

  if (backfills.length) await Promise.all(backfills);
  return NextResponse.json({ competencia: comp, itens });
}
