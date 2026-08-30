import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operações imobiliárias — a venda que a comissão intermediou.
 *
 * É o que a DIMOB declara e o que alimenta a discriminação da nota. Fica
 * separada da nota porque uma venda gera várias notas: a da Ville, a de cada
 * corretor com subconta, e uma por tomador quando a comissão é dividida.
 *
 * GET  /api/adm/operacoes            lista as recentes, com as partes
 * POST /api/adm/operacoes            cria uma, com alienantes e adquirentes
 */

function creds() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const txt = (v: any) => String(v ?? "").trim();
const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

export async function GET(req: Request) {
  const c = creds();
  if (!c) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const busca = txt(searchParams.get("q"));

  try {
    const filtro = busca
      ? `&or=(imovel_logradouro.ilike.*${encodeURIComponent(busca)}*,imovel_bairro.ilike.*${encodeURIComponent(busca)}*)`
      : "";
    const rOp = await fetch(
      `${c.url}/rest/v1/adm_operacoes_imobiliarias?order=data_contrato.desc&limit=60${filtro}`,
      { headers: c.headers, cache: "no-store" }
    );
    if (!rOp.ok) {
      return NextResponse.json({ error: "Falha ao listar", detail: await rOp.text() }, { status: 502 });
    }
    const ops = (await rOp.json()) as any[];
    if (!ops.length) return NextResponse.json({ operacoes: [] });

    const ids = ops.map((o) => o.id).join(",");
    const rP = await fetch(
      `${c.url}/rest/v1/adm_operacao_partes?operacao_id=in.(${ids})&order=ordem.asc`,
      { headers: c.headers, cache: "no-store" }
    );
    const partes = rP.ok ? ((await rP.json()) as any[]) : [];

    const operacoes = ops.map((o) => ({
      ...o,
      alienantes: partes.filter((p) => p.operacao_id === o.id && p.papel === "alienante"),
      adquirentes: partes.filter((p) => p.operacao_id === o.id && p.papel === "adquirente"),
    }));

    return NextResponse.json({ operacoes });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
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

  const logradouro = txt(body?.imovel_logradouro);
  if (!logradouro) return NextResponse.json({ error: "Logradouro do imóvel é obrigatório." }, { status: 400 });

  const valor = Number(body?.valor_alienacao) || 0;
  if (!(valor > 0)) return NextResponse.json({ error: "Valor da venda é obrigatório." }, { status: 400 });

  const dataContrato = txt(body?.data_contrato);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataContrato)) {
    return NextResponse.json({ error: "Data do contrato deve ser AAAA-MM-DD." }, { status: 400 });
  }

  // As partes precisam existir dos dois lados: a DIMOB declara alienante e
  // adquirente, e a discriminação cita a ponta oposta à do tomador.
  const norm = (arr: any, papel: string) =>
    (Array.isArray(arr) ? arr : [])
      .map((p: any, i: number) => ({
        papel,
        nome: txt(p?.nome).toUpperCase(),
        doc: dig(p?.doc),
        percentual: p?.percentual == null || p.percentual === "" ? null : Number(p.percentual),
        ordem: i + 1,
      }))
      .filter((p) => p.nome && p.doc);

  const alienantes = norm(body?.alienantes, "alienante");
  const adquirentes = norm(body?.adquirentes, "adquirente");

  if (!alienantes.length) return NextResponse.json({ error: "Informe ao menos um vendedor." }, { status: 400 });
  if (!adquirentes.length) return NextResponse.json({ error: "Informe ao menos um comprador." }, { status: 400 });

  const docInvalido = [...alienantes, ...adquirentes].find(
    (p) => p.doc.length !== 11 && p.doc.length !== 14
  );
  if (docInvalido) {
    return NextResponse.json(
      { error: `CPF/CNPJ inválido em "${docInvalido.nome}".` },
      { status: 400 }
    );
  }

  try {
    const rOp = await fetch(`${c.url}/rest/v1/adm_operacoes_imobiliarias`, {
      method: "POST",
      headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        diligencia_id: txt(body?.diligencia_id) || null,
        valor_alienacao: valor,
        data_contrato: dataContrato,
        imovel_tipo_logradouro: txt(body?.imovel_tipo_logradouro) || null,
        imovel_logradouro: logradouro,
        imovel_numero: txt(body?.imovel_numero) || null,
        imovel_complemento: txt(body?.imovel_complemento) || null,
        imovel_bairro: txt(body?.imovel_bairro) || null,
        imovel_cep: dig(body?.imovel_cep) || null,
        imovel_cidade_ibge: dig(body?.imovel_cidade_ibge) || null,
        imovel_uf: txt(body?.imovel_uf).toUpperCase() || null,
        imovel_inscricao: txt(body?.imovel_inscricao) || null,
        imovel_matricula: txt(body?.imovel_matricula) || null,
        observacao: txt(body?.observacao) || null,
      }),
      cache: "no-store",
    });
    if (!rOp.ok) {
      return NextResponse.json({ error: "Falha ao gravar a operação", detail: await rOp.text() }, { status: 502 });
    }
    const op = ((await rOp.json()) as any[])[0];

    const rP = await fetch(`${c.url}/rest/v1/adm_operacao_partes`, {
      method: "POST",
      headers: { ...c.headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(
        [...alienantes, ...adquirentes].map((p) => ({ ...p, operacao_id: op.id }))
      ),
      cache: "no-store",
    });
    if (!rP.ok) {
      // sem as partes a operação é inútil: some com ela para não deixar lixo
      await fetch(`${c.url}/rest/v1/adm_operacoes_imobiliarias?id=eq.${op.id}`, {
        method: "DELETE",
        headers: c.headers,
        cache: "no-store",
      });
      return NextResponse.json({ error: "Falha ao gravar as partes", detail: await rP.text() }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      operacao: { ...op, alienantes, adquirentes },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Erro de rede", detail: String(e) }, { status: 502 });
  }
}
