import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Planilha da DIMOB — o que o contador precisa das comissões do ano.
 *
 * Uma linha por nota emitida que esteja amarrada a uma operação imobiliária.
 * Nota sem operação não entra: a DIMOB declara a VENDA (alienante, adquirente,
 * valor e data do contrato), e sem a operação esses dados não existem.
 *
 * GET /api/adm/dimob?ano=2026        -> CSV para abrir no Excel
 * GET /api/adm/dimob?ano=2026&json=1 -> mesmos dados em JSON, para conferir
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

function fmtDoc(v: any) {
  const d = dig(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(v ?? "");
}

/** vírgula decimal: é assim que o Excel em pt-BR entende número */
const num = (v: any) => (Number(v) || 0).toFixed(2).replace(".", ",");

const data = (v: any) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

function pessoas(lista: any): string {
  if (!Array.isArray(lista)) return "";
  return lista.map((p) => `${p?.nome ?? ""} (${fmtDoc(p?.doc)})`).join(" | ");
}

function endereco(r: any): string {
  const via = [r.imovel_tipo_logradouro, r.imovel_logradouro].filter(Boolean).join(" ").trim();
  return [
    [via, r.imovel_numero].filter(Boolean).join(", "),
    r.imovel_complemento,
    r.imovel_bairro,
  ]
    .filter(Boolean)
    .join(" — ");
}

const COLUNAS: [string, (r: any) => string][] = [
  ["Ano", (r) => String(r.ano ?? "")],
  ["Nº da NFS-e", (r) => String(r.numero_nota ?? "")],
  ["Emissão", (r) => data(r.data_emissao)],
  ["Valor da comissão", (r) => num(r.valor_comissao)],
  ["Tomador", (r) => String(r.tomador_nome ?? "")],
  ["CPF/CNPJ do tomador", (r) => fmtDoc(r.tomador_doc)],
  ["Lado do tomador", (r) => String(r.tomador_lado ?? "")],
  ["Data do contrato", (r) => data(r.data_contrato)],
  ["Valor da alienação", (r) => num(r.valor_alienacao)],
  ["Alienantes (vendedores)", (r) => pessoas(r.alienantes)],
  ["Adquirentes (compradores)", (r) => pessoas(r.adquirentes)],
  ["Endereço do imóvel", (r) => endereco(r)],
  ["CEP", (r) => dig(r.imovel_cep).replace(/(\d{5})(\d{3})/, "$1-$2")],
  ["Município (IBGE)", (r) => String(r.imovel_cidade_ibge ?? "")],
  ["UF", (r) => String(r.imovel_uf ?? "")],
  ["Inscrição municipal do imóvel", (r) => String(r.imovel_inscricao ?? "")],
  ["Matrícula", (r) => String(r.imovel_matricula ?? "")],
];

/** aspas duplicadas e campo entre aspas: o CSV não pode quebrar num nome com ; */
const celula = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const anoTxt = searchParams.get("ano") || "";
  const ano = /^\d{4}$/.test(anoTxt) ? Number(anoTxt) : new Date().getFullYear();

  try {
    const r = await fetch(
      `${c.url}/rest/v1/adm_v_dimob_comissoes?ano=eq.${ano}&order=data_emissao.asc&limit=5000`,
      { headers: c.headers, cache: "no-store" }
    );
    if (!r.ok) {
      return NextResponse.json(
        { error: "Falha ao ler a base da DIMOB", detail: await r.text() },
        { status: 502 }
      );
    }
    const linhas = (await r.json()) as any[];

    if (searchParams.get("json") === "1") {
      return NextResponse.json({ ano, total: linhas.length, linhas });
    }

    const corpo = [
      COLUNAS.map(([t]) => celula(t)).join(";"),
      ...linhas.map((l) => COLUNAS.map(([, f]) => celula(f(l))).join(";")),
    ].join("\r\n");

    // BOM: sem ele o Excel abre os acentos errados
    return new NextResponse("﻿" + corpo, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dimob-comissoes-${ano}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
