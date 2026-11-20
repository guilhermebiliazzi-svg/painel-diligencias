// 19/11: tipo do logradouro (Rua, Avenida, Alameda...) separado do nome no cadastro do imóvel.
// No banco continua um campo só (adm_imoveis.rua = "Alameda Itu"); aqui só separamos e juntamos,
// e o contrato sempre escreve o tipo por extenso ("Av." -> "Avenida").

export const TIPOS_LOGRADOURO = ["Rua", "Avenida", "Alameda", "Praça", "Travessa", "Estrada", "Rodovia", "Largo", "Viela", "Via"] as const;

// abreviações e variações aceitas no começo do texto -> tipo por extenso
// (palavra inteira precisa de espaço depois; abreviação com ponto pode vir colada: "Av.Braz Leme")
const PREFIXOS: [RegExp, string][] = [
  [/^(rua\s+|r\.\s*)(?=\S)/i, "Rua"],
  [/^(avenida\s+|av\.\s*|av\s+)(?=\S)/i, "Avenida"],
  [/^(alameda\s+|al\.\s*)(?=\S)/i, "Alameda"],
  [/^(pra[çc]a\s+|p[çc]a\.\s*)(?=\S)/i, "Praça"],
  [/^(travessa\s+|tv\.\s*|trav\.\s*)(?=\S)/i, "Travessa"],
  [/^(estrada\s+|estr\.\s*)(?=\S)/i, "Estrada"],
  [/^(rodovia\s+|rod\.\s*)(?=\S)/i, "Rodovia"],
  [/^(largo\s+|lgo\.\s*)(?=\S)/i, "Largo"],
  [/^viela\s+(?=\S)/i, "Viela"],
  [/^via\s+(?=\S)/i, "Via"],
];

/** "Av.Braz Leme" -> { tipo: "Avenida", nome: "Braz Leme" }; "Viradouro" -> { tipo: "", nome: "Viradouro" } */
export function separarLogradouro(rua: string | null | undefined): { tipo: string; nome: string } {
  const s = String(rua ?? "").replace(/^\s+/, "");
  for (const [re, tipo] of PREFIXOS) {
    const m = s.match(re);
    if (m) return { tipo, nome: s.slice(m[0].length) };
  }
  return { tipo: "", nome: s };
}

export function juntarLogradouro(tipo: string, nome: string): string {
  return [tipo, nome].filter((x) => x !== "").join(" ").replace(/^\s+/, "");
}

/** Para o contrato: tipo por extenso na frente. Sem tipo reconhecido, devolve como está. */
export function logradouroPorExtenso(rua: string | null | undefined): string {
  const { tipo, nome } = separarLogradouro(rua);
  return tipo ? `${tipo} ${nome.trim()}`.trim() : String(rua ?? "").trim();
}

export const temTipoLogradouro = (rua: string | null | undefined) => !!separarLogradouro(rua).tipo;
