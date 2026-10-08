import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { acessoContratos } from "@/lib/adm-acesso";
import { normalizarConta } from "@/lib/bancos";
import { normalizarCobrancaSeguro } from "@/lib/contrato-documentos";

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
// GET /api/adm/contrato?listas=1 → locadores, imóveis e locatários (para a tela "Novo contrato")
export async function GET(req: Request) {
  if (!SUPA || !KEY) return NextResponse.json({ error: "Supabase não configurado." }, { status: 500 });
  if (new URL(req.url).searchParams.get("listas")) return listas();
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

// ------------------------------------------------------------------------------------
// Novo contrato
// ------------------------------------------------------------------------------------

const so = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const txt = (v: unknown, max = 200) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const inteiro = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
};

async function listas() {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });
  const sb = supabaseAdmin();
  const [lo, im, la, ct] = await Promise.all([
    sb.from("adm_locadores").select("id,nome,cpf_cnpj").order("nome"),
    sb.from("adm_imoveis").select("id,locador_id,rua,numero,complemento,bairro").order("rua"),
    sb.from("adm_locatarios").select("id,nome,cpf_cnpj").order("nome"),
    sb.from("adm_contratos").select("id,imovel_id").eq("status", "ativo"),
  ]);
  const err = lo.error || im.error || la.error || ct.error;
  if (err) return NextResponse.json({ error: "Falha ao carregar listas.", detail: err.message }, { status: 502 });
  const ativoPorImovel = new Map<number, number>();
  for (const c of ct.data || []) ativoPorImovel.set(c.imovel_id as number, c.id as number);
  return NextResponse.json({
    locadores: lo.data || [],
    locatarios: la.data || [],
    imoveis: (im.data || []).map((i) => ({ ...i, contrato_ativo: ativoPorImovel.get(i.id as number) ?? null })),
  });
}

// POST /api/adm/contrato
// body: {
//   locador:   { id } | { novo: { nome, cpf_cnpj, email, telefone } }          (ignorado se imóvel existente)
//   imovel:    { id } | { novo: { rua, numero, complemento, bairro, cep, cidade, estado, tipo_imovel, ... } }
//   locatario: { id } | { novo: { nome, cpf_cnpj, email, telefone } }
//   contrato:  { campos editáveis... }
//   conta?:    { titular, cpf_cnpj, banco_ispb, agencia, conta, tipo_conta }  (conta de repasse do locador)
//   seguro?:   { seguradora, numero_apolice, vigencia_inicio, vigencia_fim, premio,
//                cobrar_no_boleto, valor_mensal, parcelas_total, cobranca_inicio:"YYYY-MM" }  (seguro residencial)
// }
// Cria na ordem locador → imóvel → locatário → contrato; se algo falhar no meio,
// apaga o que acabou de criar (não deixa cadastro órfão).
export async function POST(req: Request) {
  const ac = await acessoContratos();
  if (!ac.ok) return NextResponse.json({ error: ac.error }, { status: ac.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  // conta de repasse: valida antes de criar qualquer coisa
  let contaRepasse: Record<string, any> | null = null;
  if (body?.conta) {
    const n = normalizarConta(body.conta);
    if (!n.ok) return NextResponse.json({ error: n.error }, { status: 400 });
    contaRepasse = n.dados;
  }
  // seguro residencial: valida antes também
  let seguroRes: Record<string, any> | null = null;
  if (body?.seguro) {
    const sc = normalizarCobrancaSeguro(body.seguro);
    if (!sc.ok) return NextResponse.json({ error: sc.error }, { status: 400 });
    const d = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
    seguroRes = {
      tipo: "residencial",
      ativo: true,
      seguradora: txt(body.seguro.seguradora, 120),
      numero_apolice: txt(body.seguro.numero_apolice, 120),
      vigencia_inicio: d(body.seguro.vigencia_inicio),
      vigencia_fim: d(body.seguro.vigencia_fim),
      ...sc.dados,
    };
  }

  const sb = supabaseAdmin();
  const criados: { tabela: string; id: number }[] = [];
  const desfazer = async () => {
    for (const c of criados.reverse()) await sb.from(c.tabela).delete().eq("id", c.id);
  };
  const falha = async (msg: string, status = 400, detail?: string) => {
    await desfazer();
    return NextResponse.json({ error: msg, ...(detail ? { detail } : {}) }, { status });
  };

  // pessoa (locador/locatário): existente ou nova (barra CPF/CNPJ repetido)
  async function pessoa(tabela: "adm_locadores" | "adm_locatarios", entrada: any, rotulo: string) {
    const idExist = inteiro(entrada?.id);
    if (idExist) {
      const { data } = await sb.from(tabela).select("id").eq("id", idExist).maybeSingle();
      if (!data) return { erro: `${rotulo} #${idExist} não encontrado.` };
      return { id: idExist };
    }
    const n = entrada?.novo || {};
    const nome = txt(n.nome);
    if (!nome) return { erro: `Informe o nome do ${rotulo.toLowerCase()}.` };
    const doc = so(n.cpf_cnpj);
    if (doc) {
      const { data: todos } = await sb.from(tabela).select("id,nome,cpf_cnpj");
      const igual = (todos || []).find((p: any) => so(p.cpf_cnpj) === doc);
      if (igual) return { erro: `${rotulo} com esse CPF/CNPJ já existe: ${igual.nome} (#${igual.id}). Selecione na lista.` };
    }
    const { data, error } = await sb
      .from(tabela)
      .insert({ nome, cpf_cnpj: txt(n.cpf_cnpj, 30), email: txt(n.email, 150), telefone: txt(n.telefone, 40) })
      .select("id")
      .single();
    if (error || !data) return { erro: `Falha ao cadastrar ${rotulo.toLowerCase()}.`, detail: error?.message };
    criados.push({ tabela, id: data.id as number });
    return { id: data.id as number };
  }

  // 1) imóvel (e locador, se o imóvel for novo)
  let imovelId = inteiro(body?.imovel?.id);
  if (imovelId) {
    const { data } = await sb.from("adm_imoveis").select("id").eq("id", imovelId).maybeSingle();
    if (!data) return falha(`Imóvel #${imovelId} não encontrado.`);
  } else {
    const loc = await pessoa("adm_locadores", body?.locador, "Locador");
    if ("erro" in loc) return falha(loc.erro as string, 400, (loc as any).detail);
    const n = body?.imovel?.novo || {};
    const rua = txt(n.rua);
    const numero = txt(n.numero, 20);
    if (!rua || !numero) return falha("Informe rua e número do imóvel.");
    const cidade = txt(n.cidade, 80) || "São Paulo";
    const estado = (txt(n.estado, 2) || "SP").toUpperCase();
    const complemento = txt(n.complemento, 80);
    const bairro = txt(n.bairro, 80);
    const { data, error } = await sb
      .from("adm_imoveis")
      .insert({
        locador_id: loc.id,
        rua,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        cep: txt(n.cep, 10),
        tipo_imovel: txt(n.tipo_imovel, 40),
        nro_contribuinte: txt(n.nro_contribuinte, 30),
        administradora: txt(n.administradora, 120),
        dia_venc_condominio: inteiro(n.dia_venc_condominio),
        dia_venc_iptu: inteiro(n.dia_venc_iptu),
        endereco_completo: [`${rua}, ${numero}`, complemento, bairro, `${cidade}/${estado}`].filter(Boolean).join(" - "),
      })
      .select("id")
      .single();
    if (error || !data) return falha("Falha ao cadastrar o imóvel.", 502, error?.message);
    criados.push({ tabela: "adm_imoveis", id: data.id as number });
    imovelId = data.id as number;
  }

  // 2) locatário
  const lt = await pessoa("adm_locatarios", body?.locatario, "Locatário");
  if ("erro" in lt) return falha(lt.erro as string, 400, (lt as any).detail);

  // 3) contrato
  const c = body?.contrato || {};
  const ins: Record<string, any> = { imovel_id: imovelId, locatario_id: lt.id };
  for (const [k, v] of Object.entries(c)) {
    if (!CAMPOS_EDITAVEIS.has(k)) continue;
    ins[k] = v === "" ? null : v;
  }
  if (!ins.valor_primeiro_aluguel && !ins.valor_atual_aluguel) return falha("Informe o valor do aluguel.");
  if (!ins.valor_atual_aluguel) ins.valor_atual_aluguel = ins.valor_primeiro_aluguel;
  if (!ins.valor_primeiro_aluguel) ins.valor_primeiro_aluguel = ins.valor_atual_aluguel;
  if (!ins.data_inicio) return falha("Informe a data de início.");
  if (!ins.data_vigencia_atual) ins.data_vigencia_atual = ins.data_inicio;
  if (!ins.dia_vencimento) return falha("Informe o dia de vencimento.");
  if (!ins.status) ins.status = "ativo";

  const { data: novo, error } = await sb.from("adm_contratos").insert(ins).select("id").single();
  if (error || !novo) return falha("Falha ao criar o contrato.", 502, error?.message);
  criados.push({ tabela: "adm_contratos", id: novo.id as number });

  // 4) conta de repasse do locador, ligada a este contrato
  if (contaRepasse) {
    const { data: im } = await sb.from("adm_imoveis").select("locador_id").eq("id", imovelId).maybeSingle();
    const { data: ct, error: eConta } = await sb
      .from("adm_contas_bancarias")
      .insert({
        contrato_id: novo.id,
        imovel_id: imovelId,
        locador_id: (im as any)?.locador_id ?? null,
        ...contaRepasse,
      })
      .select("id")
      .single();
    if (eConta || !ct) return falha("Falha ao salvar a conta bancária.", 502, eConta?.message);
    criados.push({ tabela: "adm_contas_bancarias", id: ct.id as number });
  }

  // 5) seguro residencial do inquilino
  let seguroId: number | null = null;
  if (seguroRes) {
    const { data: sg, error: eSeg } = await sb
      .from("adm_seguros")
      .insert({ contrato_id: novo.id, ...seguroRes })
      .select("id")
      .single();
    if (eSeg || !sg) return falha("Falha ao salvar o seguro residencial.", 502, eSeg?.message);
    seguroId = sg.id as number;
  }

  return NextResponse.json({ ok: true, id: novo.id, seguro_id: seguroId });
}
