/**
 * Tenta extrair, do texto livre da discriminação, o que a operação precisa:
 * endereço do imóvel, valor da venda e a parte compradora.
 *
 * É heurística, não é verdade. As discriminações de 2026 foram escritas à mão,
 * cada uma de um jeito: umas dizem "Endereço:", outras começam pelo endereço;
 * umas escrevem "Venda: 850000", outras "R$ 1.270.000,00". O resultado serve
 * para PREENCHER um formulário que alguém confere — nunca para gravar direto.
 */

export type Extraido = {
  endereco: string;
  valor_alienacao: number | null;
  compradores: { nome: string; doc: string }[];
  /** o que não deu para deduzir, para avisar quem confere */
  faltando: string[];
};

const dig = (v: string) => String(v ?? "").replace(/\D/g, "");

/** CPF (11) ou CNPJ (14), formatados ou não */
const RE_DOC = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/g;

function valores(texto: string): number[] {
  const out: number[] = [];
  // R$ 1.270.000,00 / R$1.270.000,00 / 1.270.000,00
  for (const m of texto.matchAll(/R\$\s*([\d.]+,\d{2}|\d[\d.]*)/gi)) {
    const s = m[1].replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    if (!isNaN(n) && n > 0) out.push(n);
  }
  // "Venda: 850000" / "Valor de venda: 980000"
  for (const m of texto.matchAll(/(?:venda|valor)\s*[:\-]?\s*(\d{5,})/gi)) {
    const n = Number(m[1]);
    if (!isNaN(n) && n > 0) out.push(n);
  }
  return out;
}

const PAPEIS =
  /\b(comprador(?:a|es|as)?|parte\s+compradora|adquirente(?:s)?|fiduciante(?:s)?|devedor(?:a|es)?|doravante\s+denominad[oa]s?|sr\.?|sra\.?|brasileir[oa]\(?a?\)?|solteir[oa]\(?a?\)?|casad[oa]\(?a?\)?|divorciad[oa]\(?a?\)?)\b/gi;

/**
 * O nome vem antes do documento, na mesma frase. O trecho anterior costuma
 * trazer rótulos ("Comprador:", "brasileiro, engenheiro") e, quando há dois
 * compradores, o nome do outro. Cortamos nos separadores e ficamos com o
 * último pedaço que ainda parece nome.
 */
function nomeAntesDoDoc(trecho: string): string {
  let limpo = trecho
    .replace(PAPEIS, "|")
    .replace(/\b(cpf|cnpj|cpf\/cnpj|rg|n[º°o]\.?|sob\s+o|inscrit[oa]\(?a?\)?\s+n[oa]?|e-?mail\S*|[\w.]+@[\w.]+)\b/gi, "|")
    .replace(/[,:;()\d]/g, "|");

  // o último trecho separado é o nome mais próximo do documento
  const pedacos = limpo
    .split("|")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 2 && /[A-Za-zÀ-ÿ]/.test(x));

  let nome = pedacos.length ? pedacos[pedacos.length - 1] : "";
  // "Fulano e Beltrano" -> fica com o último
  const porE = nome.split(/\s+e\s+/i);
  if (porE.length > 1) nome = porE[porE.length - 1];

  const palavras = nome.split(" ").filter(Boolean);
  return palavras.slice(-6).join(" ").trim();
}

export function extrairDaDiscriminacao(texto: string): Extraido {
  const t = String(texto ?? "").replace(/\r/g, "");
  const linhas = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const faltando: string[] = [];

  /* ---------------- endereço ---------------- */
  let endereco = "";
  const rotulado = t.match(/(?:endere[çc]o|im[óo]vel)\s*[:\-]\s*([^\n]+)/i);
  if (rotulado) {
    endereco = rotulado[1];
    // "... CEP 04602006 Comprador: Fulano" — corta no rótulo seguinte
    endereco = endereco.split(/\b(?:comprador|compradora|compradores|parte compradora|venda|valor)\b/i)[0];
  } else {
    // sem rótulo, a primeira linha que parece logradouro
    const cand = linhas.find((l) => /\b(rua|r\.|avenida|av\.?|alameda|al\.|travessa|pra[çc]a|rodovia)\b/i.test(l));
    if (cand) endereco = cand;
  }
  endereco = endereco.replace(/\s+/g, " ").trim().replace(/[.,;|]+$/, "");
  if (!endereco) faltando.push("endereço");

  /* ---------------- valor da venda ---------------- */
  const vs = valores(t);
  // o maior valor citado é o da venda: a comissão e os aluguéis são menores
  const valor = vs.length ? Math.max(...vs) : null;
  if (!valor) faltando.push("valor da venda");

  /* ---------------- comprador ---------------- */
  const compradores: { nome: string; doc: string }[] = [];
  // o trecho a partir de "comprador" costuma trazer nome e documento
  const idx = t.search(/\b(compradora?e?s?|parte compradora|fiduciante|adquirente)\b/i);
  const trecho = idx >= 0 ? t.slice(idx) : t;
  const docs = [...trecho.matchAll(RE_DOC)].map((m) => m[0]);
  for (const d of docs) {
    const doc = dig(d);
    if (doc.length !== 11 && doc.length !== 14) continue;
    if (compradores.some((c) => c.doc === doc)) continue;
    const pos = trecho.indexOf(d);
    const nome = nomeAntesDoDoc(trecho.slice(Math.max(0, pos - 120), pos));
    compradores.push({ nome: nome.toUpperCase(), doc });
  }
  if (!compradores.length) faltando.push("comprador");

  return { endereco, valor_alienacao: valor, compradores, faltando };
}
