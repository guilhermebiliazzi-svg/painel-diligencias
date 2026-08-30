/**
 * Extrai da diligência tudo o que a nota de comissão precisa.
 *
 * A ficha do negócio (diligencias.dados_completos) já guarda quem compra, quem
 * vende, quem paga a comissão e como ela é rateada — os mesmos dados que o
 * WF-A2 usa para montar a cobrança. Não faz sentido digitar de novo na tela.
 */

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const txt = (v: unknown) => String(v ?? "").trim();

export type ParteSugerida = { nome: string; doc: string };

export type Sugestao = {
  diligencia_id: string;
  /** quem paga a comissão — vira o tomador da nota */
  tomador: { nome: string; doc: string; email: string; lado: string } | null;
  operacao: {
    valor_alienacao: number | null;
    endereco_texto: string;
    alienantes: ParteSugerida[];
    adquirentes: ParteSugerida[];
  };
  comissao_total: number | null;
  /** o rateio como está na ficha, para conferência a olho */
  composicao: { credor: string; valor: number; destino: string }[];
  /** operação já cadastrada para esta diligência, se houver */
  operacao_id: number | null;
};

function obj(v: unknown): Record<string, any> {
  if (!v) return {};
  if (typeof v === "string") {
    try {
      return JSON.parse(v) || {};
    } catch {
      return {};
    }
  }
  return typeof v === "object" ? (v as Record<string, any>) : {};
}

/** vendedoresPF e compradoresPF usam as MESMAS chaves (pf_nome/pf_cpf) */
function pessoas(dc: Record<string, any>, base: "vendedores" | "compradores"): ParteSugerida[] {
  const pf = Array.isArray(dc[base + "PF"]) ? dc[base + "PF"] : [];
  const pj = Array.isArray(dc[base + "PJ"]) ? dc[base + "PJ"] : [];
  const out: ParteSugerida[] = [];
  for (const p of pf) {
    const nome = txt(p?.pf_nome).toUpperCase();
    const doc = dig(p?.pf_cpf);
    if (nome && doc) out.push({ nome, doc });
  }
  for (const p of pj) {
    const nome = txt(p?.pj_nome).toUpperCase();
    const doc = dig(p?.pj_cnpj);
    if (nome && doc) out.push({ nome, doc });
  }
  return out;
}

function emailDe(dc: Record<string, any>, base: "vendedores" | "compradores"): string {
  const pf = Array.isArray(dc[base + "PF"]) ? dc[base + "PF"] : [];
  const pj = Array.isArray(dc[base + "PJ"]) ? dc[base + "PJ"] : [];
  const cand = [pf[0]?.pf_email, pf[0]?.email, pj[0]?.pj_email, pj[0]?.email];
  return txt(cand.find((e) => txt(e).includes("@"))).toLowerCase();
}

export function montarSugestao(
  linha: { id: string; endereco?: string | null; preco?: unknown; dados_completos?: unknown },
  operacaoId: number | null
): Sugestao {
  const dc = obj(linha.dados_completos);
  const negocio = obj(dc.negocio);
  const comissao = obj(negocio.comissao);

  const alienantes = pessoas(dc, "vendedores");
  const adquirentes = pessoas(dc, "compradores");

  // "Quem paga a comissão" na ficha; na ausência, o comprador é o padrão da casa
  const pagador = txt(comissao.pagador).toLowerCase() === "vendedor" ? "vendedor" : "comprador";
  const base = pagador === "vendedor" ? "vendedores" : "compradores";
  const lista = pagador === "vendedor" ? alienantes : adquirentes;
  const primeiro = lista[0] || null;

  const precoRaw = linha.preco ?? negocio.preco;
  const preco = precoRaw == null || precoRaw === "" ? null : Number(precoRaw) || null;

  const splitBruto = Array.isArray(comissao.split) ? comissao.split : [];

  return {
    diligencia_id: linha.id,
    tomador: primeiro
      ? {
          nome: primeiro.nome,
          doc: primeiro.doc,
          email: emailDe(dc, base),
          lado: pagador,
        }
      : null,
    operacao: {
      valor_alienacao: preco,
      endereco_texto: txt(linha.endereco),
      alienantes,
      adquirentes,
    },
    comissao_total: comissao.total == null ? null : Number(comissao.total) || null,
    composicao: splitBruto.map((s: any) => ({
      credor: txt(s?.credor),
      valor: Number(s?.valor) || 0,
      destino: txt(s?.destino),
    })),
    operacao_id: operacaoId,
  };
}
