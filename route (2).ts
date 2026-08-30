import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cria as operações e vincula as notas, em lote.
 *
 * Uma nota importada por vez seria dezenas de formulários iguais. Aqui a tela
 * manda tudo revisado de uma vez; cada item é independente — se um falhar, os
 * outros seguem, e a resposta diz item a item o que aconteceu.
 *
 * POST { itens: [{ nota_id, operacao: {...}, alienantes: [], adquirentes: [] }] }
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const txt = (v: any) => String(v ?? "").trim();
const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

export async function POST(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const itens = Array.isArray(body?.itens) ? body.itens : [];
  if (!itens.length) return NextResponse.json({ error: "Nada a vincular." }, { status: 400 });

  const resultados: { nota_id: number; ok: boolean; erro?: string; operacao_id?: number }[] = [];

  for (const it of itens) {
    const notaId = Number(it?.nota_id);
    const op = it?.operacao || {};
    const logradouro = txt(op.imovel_logradouro);
    const valor = Number(op.valor_alienacao) || 0;
    const dataContrato = txt(op.data_contrato);

    const norm = (arr: any, papel: string) =>
      (Array.isArray(arr) ? arr : [])
        .map((p: any, i: number) => ({
          papel,
          nome: txt(p?.nome).toUpperCase(),
          doc: dig(p?.doc),
          ordem: i + 1,
        }))
        .filter((p) => p.nome && (p.doc.length === 11 || p.doc.length === 14));

    const alienantes = norm(it?.alienantes, "alienante");
    const adquirentes = norm(it?.adquirentes, "adquirente");

    const faltas: string[] = [];
    if (!notaId) faltas.push("nota");
    if (!logradouro) faltas.push("endereço");
    if (!(valor > 0)) faltas.push("valor da venda");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataContrato)) faltas.push("data do contrato");
    if (!alienantes.length) faltas.push("vendedor");
    if (!adquirentes.length) faltas.push("comprador");
    if (faltas.length) {
      resultados.push({ nota_id: notaId, ok: false, erro: `falta ${faltas.join(", ")}` });
      continue;
    }

    try {
      const rOp = await fetch(`${c.url}/rest/v1/adm_operacoes_imobiliarias`, {
        method: "POST",
        headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          valor_alienacao: valor,
          data_contrato: dataContrato,
          imovel_logradouro: logradouro,
          imovel_cidade_ibge: dig(op.imovel_cidade_ibge) || "3550308",
          imovel_uf: txt(op.imovel_uf).toUpperCase() || "SP",
          observacao: "Operação montada a partir da discriminação da NFS-e.",
        }),
        cache: "no-store",
      });
      if (!rOp.ok) {
        resultados.push({ nota_id: notaId, ok: false, erro: (await rOp.text()).slice(0, 200) });
        continue;
      }
      const operacao = ((await rOp.json()) as any[])[0];

      const rP = await fetch(`${c.url}/rest/v1/adm_operacao_partes`, {
        method: "POST",
        headers: { ...c.headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          [...alienantes, ...adquirentes].map((p) => ({ ...p, operacao_id: operacao.id }))
        ),
        cache: "no-store",
      });
      if (!rP.ok) {
        // operação sem partes não serve para nada: não deixa lixo
        await fetch(`${c.url}/rest/v1/adm_operacoes_imobiliarias?id=eq.${operacao.id}`, {
          method: "DELETE",
          headers: c.headers,
          cache: "no-store",
        });
        resultados.push({ nota_id: notaId, ok: false, erro: "falha ao gravar as partes" });
        continue;
      }

      const rN = await fetch(`${c.url}/rest/v1/adm_notas_comissao?id=eq.${notaId}`, {
        method: "PATCH",
        headers: { ...c.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ operacao_id: operacao.id, updated_at: new Date().toISOString() }),
        cache: "no-store",
      });
      if (!rN.ok) {
        resultados.push({
          nota_id: notaId,
          ok: false,
          erro: "operação criada, mas a nota não foi vinculada",
          operacao_id: operacao.id,
        });
        continue;
      }

      resultados.push({ nota_id: notaId, ok: true, operacao_id: operacao.id });
    } catch (e: any) {
      resultados.push({ nota_id: notaId, ok: false, erro: String((e && e.message) || e).slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    vinculadas: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok),
  });
}
