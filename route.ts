import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registra uma NFS-e de comissão que JÁ foi emitida fora do painel.
 *
 * Nota emitida à mão no site da Prefeitura existe no fisco mas não existe aqui:
 * fica fora da aba Emitidas e, pior, fora da planilha da DIMOB. Isto grava a
 * nota como emitida, sem consumir RPS e sem chamar o serviço de emissão — não
 * há nada a emitir, ela já saiu.
 *
 * POST /api/adm/notas-comissao/registrar
 *   { numero_nota, codigo_verificacao?, data_emissao, valor_servico,
 *     tomador:{nome,doc,lado?}, operacao_id?, discriminacao?, observacao? }
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const txt = (v: any) => String(v ?? "").trim();
const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

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

  const numero = dig(body?.numero_nota);
  if (!numero) return NextResponse.json({ error: "Número da NFS-e é obrigatório." }, { status: 400 });

  const dataEmissao = txt(body?.data_emissao);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) {
    return NextResponse.json({ error: "Data de emissão deve ser AAAA-MM-DD." }, { status: 400 });
  }

  const valor = Math.round((Number(body?.valor_servico) || 0) * 100) / 100;
  if (!(valor > 0)) {
    return NextResponse.json({ error: "Valor da nota deve ser maior que zero." }, { status: 400 });
  }

  const tom = body?.tomador || {};
  const nome = txt(tom.nome);
  const doc = dig(tom.doc);
  if (!nome) return NextResponse.json({ error: "Nome do tomador é obrigatório." }, { status: 400 });
  if (doc.length !== 11 && doc.length !== 14) {
    return NextResponse.json({ error: "CPF/CNPJ do tomador inválido." }, { status: 400 });
  }

  const lado = txt(tom.lado);
  if (lado && !["comprador", "vendedor", "outro"].includes(lado)) {
    return NextResponse.json({ error: "Lado do tomador inválido." }, { status: 400 });
  }

  try {
    // A mesma nota registrada duas vezes duplicaria receita na DIMOB.
    const rDup = await fetch(
      `${c.url}/rest/v1/adm_notas_comissao?numero_nota=eq.${numero}&status=neq.cancelada&select=id`,
      { headers: c.headers, cache: "no-store" }
    );
    if (rDup.ok) {
      const dup = (await rDup.json()) as any[];
      if (dup.length) {
        return NextResponse.json(
          { error: `A NFS-e nº ${numero} já está registrada aqui.` },
          { status: 409 }
        );
      }
    }

    const verificacao = txt(body?.codigo_verificacao).replace(/[^A-Za-z0-9]/g, "");

    const r = await fetch(`${c.url}/rest/v1/adm_notas_comissao`, {
      method: "POST",
      headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        // 'avulsa' com asaas_payment_id nulo é o que a constraint aceita; o
        // fato de ter nascido fora do painel fica na observação
        origem: "avulsa",
        asaas_payment_id: null,
        operacao_id: body?.operacao_id ? Number(body.operacao_id) : null,
        tomador_nome: nome,
        tomador_doc: doc,
        tomador_lado: lado || null,
        valor_servico: valor,
        codigo_servico: txt(body?.codigo_servico) || "06297",
        discriminacao: txt(body?.discriminacao) || null,
        status: "emitida",
        numero_nota: numero,
        codigo_verificacao: verificacao || null,
        data_emissao: dataEmissao,
        pdf_url: verificacao
          ? linkNota(process.env.NFSE_SP_IM || "69033951", numero, verificacao)
          : null,
        observacao:
          txt(body?.observacao) || "Emitida fora do painel; registrada para a DIMOB.",
      }),
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ error: "Falha ao registrar", detail: await r.text() }, { status: 502 });
    }
    const nota = ((await r.json()) as any[])[0];
    return NextResponse.json({ ok: true, nota });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
