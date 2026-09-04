/**
 * Monta a discriminação da NFS-e de comissão.
 *
 * A Prefeitura de SP limita a discriminação a 2000 caracteres; o texto abaixo
 * fica bem abaixo disso, mas o corte final existe por garantia.
 *
 * A "outra parte" é a ponta oposta à do tomador: se a nota é para o comprador,
 * cita-se o vendedor, e vice-versa. Quando o lado do tomador não é conhecido,
 * ele é deduzido comparando o documento do tomador com os das partes.
 */

export type Parte = { nome: string; doc: string; percentual?: number | null };

export type Operacao = {
  /** cada lado pode ter várias pessoas: casal, irmãos, espólio */
  alienantes: Parte[];
  adquirentes: Parte[];
  valor_alienacao: number | string;
  imovel_tipo_logradouro?: string | null;
  imovel_logradouro: string;
  imovel_numero?: string | null;
  imovel_complemento?: string | null;
  imovel_bairro?: string | null;
  imovel_cep?: string | null;
  imovel_uf?: string | null;
};

const dig = (v: any) => String(v ?? "").replace(/\D/g, "");

/** 12345678901 -> 123.456.789-01 ; 12345678000199 -> 12.345.678/0001-99 */
export function formatarDoc(v: any): string {
  const d = dig(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(v ?? "");
}

/**
 * A Prefeitura de SP valida a discriminação contra o tipo `tpDiscriminacao`,
 * cujo pattern só aceita caracteres da tabela Latin-1. Travessão (— U+2014),
 * aspas curvas, reticências e espaço não separável entram no texto sem
 * ninguém perceber — vindos de `toLocaleString`, de um nome colado de outro
 * sistema, ou do próprio código — e a nota inteira é recusada com
 * "1001: XML não compatível com Schema … Pattern constraint failed",
 * sem dizer qual caractere ofendeu.
 *
 * Trocamos o que tem equivalente ASCII e removemos o resto. Melhor uma
 * discriminação com hífen no lugar do travessão do que uma nota que não sai.
 */
export function sanitizarDiscriminacao(texto: string): string {
  return String(texto ?? "")
    .normalize("NFC")
    // travessões, meia-risca e sinal de menos → hífen
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    // aspas simples e duplas tipográficas → aspas retas
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    // espaços especiais (o R$ do toLocaleString vem com U+00A0) → espaço comum
    .replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, " ")
    // marcas invisíveis que sobrevivem a copiar e colar
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // o que sobrou fora do Latin-1 imprimível não tem como ir no XML
    .replace(/[^\x20-\x7E\u00A1-\u00FF\n]/g, "");
}

export function brl(v: number | string): string {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function enderecoImovel(o: Operacao): string {
  const via = [o.imovel_tipo_logradouro, o.imovel_logradouro].filter(Boolean).join(" ").trim();
  const partes = [
    [via, o.imovel_numero].filter(Boolean).join(", "),
    o.imovel_complemento || null,
    o.imovel_bairro || null,
    o.imovel_cep ? `CEP ${dig(o.imovel_cep).replace(/(\d{5})(\d{3})/, "$1-$2")}` : null,
    o.imovel_uf || null,
  ].filter(Boolean);
  return partes.join(" - ");
}

/**
 * De que lado da operação está o tomador. Preferimos o que foi informado;
 * na ausência, comparamos documentos — é mais confiável que comparar nomes.
 */
export function ladoDoTomador(
  o: Operacao,
  tomadorDoc: string,
  informado?: string | null
): "comprador" | "vendedor" | "outro" {
  if (informado === "comprador" || informado === "vendedor") return informado;
  const t = dig(tomadorDoc);
  if (!t) return "outro";
  if ((o.adquirentes || []).some((p) => dig(p.doc) === t)) return "comprador";
  if ((o.alienantes || []).some((p) => dig(p.doc) === t)) return "vendedor";
  return "outro";
}

/** "Fulano - CPF 000.000.000-00 e Beltrano - CPF 111..." */
function listarPartes(partes: Parte[]): string {
  const itens = (partes || []).map((p) => `${p.nome} - CPF/CNPJ ${formatarDoc(p.doc)}`);
  if (itens.length <= 1) return itens[0] || "";
  return itens.slice(0, -1).join("; ") + " e " + itens[itens.length - 1];
}

export type Parcelamento = { parcela: number; total: number } | null;

export function montarDiscriminacao(
  o: Operacao,
  tomadorDoc: string,
  ladoInformado?: string | null,
  parcelamento?: Parcelamento
): string {
  const lado = ladoDoTomador(o, tomadorDoc, ladoInformado);

  // a outra parte é sempre a ponta oposta à do tomador
  const outra =
    lado === "comprador"
      ? { papel: (o.alienantes || []).length > 1 ? "Vendedores" : "Vendedor", partes: o.alienantes }
      : lado === "vendedor"
      ? { papel: (o.adquirentes || []).length > 1 ? "Compradores" : "Comprador", partes: o.adquirentes }
      : null;

  // parcelado: a nota sai por recebimento, entao precisa dizer qual parcela e,
  // senao o tomador recebe N notas identicas e nao sabe distinguir
  const cabecalho =
    parcelamento && parcelamento.total > 1
      ? `Comissão pela intermediação na venda de imóvel - parcela ${parcelamento.parcela} de ${parcelamento.total}.`
      : "Comissão pela intermediação na venda de imóvel.";

  const linhas = [
    cabecalho,
    `Imóvel: ${enderecoImovel(o)}`,
    `Valor da venda: ${brl(o.valor_alienacao)}`,
  ];

  if (outra && (outra.partes || []).length) {
    linhas.push(`${outra.papel}: ${listarPartes(outra.partes)}`);
  } else {
    // sem lado identificado, citamos os dois — melhor do que omitir
    if ((o.alienantes || []).length) linhas.push(`Vendedor(es): ${listarPartes(o.alienantes)}`);
    if ((o.adquirentes || []).length) linhas.push(`Comprador(es): ${listarPartes(o.adquirentes)}`);
  }

  return sanitizarDiscriminacao(linhas.join("\n")).slice(0, 2000);
}
