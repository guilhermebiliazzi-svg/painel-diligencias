import { NextResponse } from "next/server";
import { lerCsvPrefeitura } from "@/lib/nfse-prefeitura-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Importa as NFS-e de corretagem do CSV de notas emitidas da Prefeitura de SP.
 *
 * Só entram as do código 6297 (corretagem) e não canceladas: o 3212 é a taxa
 * de administração de locação, que vive na outra tela, e nota cancelada não é
 * receita. Notas já cadastradas aqui são ignoradas — reimportar o mesmo mês
 * não pode duplicar nada.
 *
 * POST { csv: string, confirmar?: boolean }
 *   sem confirmar -> devolve a prévia do que seria importado
 *   com confirmar -> grava
 */

const CODIGO_CORRETAGEM = "6297";

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

function linkNota(im: string, numero: string, verificacao: string) {
  const cod = verificacao.replace(/[^A-Za-z0-9]/g, "");
  return (
    `https://nfe.prefeitura.sp.gov.br/contribuinte/notaprint.aspx` +
    `?inscricao=${im}&nf=${numero}&verificacao=${cod}`
  );
}

export async function POST(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const csv = String(body?.csv || "");
  if (!csv.trim()) return NextResponse.json({ error: "Envie o conteúdo do CSV." }, { status: 400 });

  const { notas, linhasIgnoradas } = lerCsvPrefeitura(csv);
  if (!notas.length) {
    return NextResponse.json(
      {
        error:
          "Não reconheci nenhuma nota neste arquivo. Ele precisa ser o CSV de " +
          "'NFS-e emitidas' do portal da Prefeitura, sem edição.",
      },
      { status: 400 }
    );
  }

  // dedup dentro do próprio envio: meses sobrepostos são comuns
  const porNumero = new Map<string, (typeof notas)[number]>();
  for (const n of notas) if (!porNumero.has(n.numero_nota)) porNumero.set(n.numero_nota, n);
  const unicas = [...porNumero.values()];

  const canceladas = unicas.filter((n) => n.cancelada).length;
  const outroServico = unicas.filter(
    (n) => !n.cancelada && n.codigo_servico !== CODIGO_CORRETAGEM
  ).length;

  const candidatas = unicas.filter(
    (n) => !n.cancelada && n.codigo_servico === CODIGO_CORRETAGEM
  );

  const invalidas = candidatas.filter(
    (n) =>
      !(n.valor_servico > 0) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(n.data_emissao) ||
      (n.tomador_doc.length !== 11 && n.tomador_doc.length !== 14) ||
      !n.tomador_nome
  );
  const validas = candidatas.filter((n) => !invalidas.includes(n));

  try {
    // o que já existe aqui não é reimportado
    const nums = validas.map((n) => n.numero_nota);
    const jaTem = new Set<string>();
    for (let i = 0; i < nums.length; i += 100) {
      const lote = nums.slice(i, i + 100);
      const r = await fetch(
        `${c.url}/rest/v1/adm_notas_comissao?numero_nota=in.(${lote.join(",")})` +
          `&status=neq.cancelada&select=numero_nota`,
        { headers: c.headers, cache: "no-store" }
      );
      if (r.ok) for (const x of (await r.json()) as any[]) jaTem.add(String(x.numero_nota));
    }

    const novas = validas.filter((n) => !jaTem.has(n.numero_nota));
    const resumo = {
      lidas: unicas.length,
      corretagem: candidatas.length,
      canceladas,
      outro_servico: outroServico,
      ja_cadastradas: validas.length - novas.length,
      invalidas: invalidas.map((n) => ({ numero: n.numero_nota, nome: n.tomador_nome })),
      linhas_ignoradas: linhasIgnoradas,
      novas: novas.length,
      soma: Math.round(novas.reduce((s, n) => s + n.valor_servico, 0) * 100) / 100,
    };

    if (body?.confirmar !== true) {
      return NextResponse.json({
        previa: true,
        resumo,
        amostra: novas.slice(0, 200).map((n) => ({
          numero_nota: n.numero_nota,
          data_emissao: n.data_emissao,
          valor_servico: n.valor_servico,
          tomador_nome: n.tomador_nome,
          tomador_doc: n.tomador_doc,
        })),
      });
    }

    if (!novas.length) return NextResponse.json({ ok: true, gravadas: 0, resumo });

    const im = process.env.NFSE_SP_IM || "69033951";
    const linhas = novas.map((n) => ({
      origem: "avulsa",
      asaas_payment_id: null,
      tomador_nome: n.tomador_nome,
      tomador_doc: n.tomador_doc,
      tomador_email: n.tomador_email || null,
      valor_servico: n.valor_servico,
      codigo_servico: "06297",
      discriminacao: n.discriminacao || null,
      status: "emitida",
      numero_nota: n.numero_nota,
      codigo_verificacao: n.codigo_verificacao || null,
      data_emissao: n.data_emissao,
      pdf_url: n.codigo_verificacao ? linkNota(im, n.numero_nota, n.codigo_verificacao) : null,
      observacao: "Importada do CSV de NFS-e emitidas da Prefeitura.",
    }));

    let gravadas = 0;
    for (let i = 0; i < linhas.length; i += 50) {
      const r = await fetch(`${c.url}/rest/v1/adm_notas_comissao`, {
        method: "POST",
        headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(linhas.slice(i, i + 50)),
        cache: "no-store",
      });
      if (!r.ok) {
        return NextResponse.json(
          { error: "Falha ao gravar", detail: await r.text(), gravadas },
          { status: 502 }
        );
      }
      gravadas += ((await r.json()) as any[]).length;
    }

    return NextResponse.json({ ok: true, gravadas, resumo });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
