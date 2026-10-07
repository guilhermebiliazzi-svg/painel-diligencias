// Constantes compartilhadas (cliente e servidor) da pasta de documentos do contrato.

export const CATEGORIAS_DOC = [
  { v: "apolice", t: "Apólices", dica: "Capitalização, seguro-fiança, seguro residencial…" },
  { v: "contrato_locacao", t: "Contrato de locação e aditivos", dica: "" },
  { v: "contrato_administracao", t: "Contrato de administração e aditivos", dica: "" },
  { v: "vistoria_entrada", t: "Vistoria de entrada", dica: "" },
  { v: "vistoria_saida", t: "Vistoria de saída", dica: "" },
  { v: "termo_entrega_chaves", t: "Termo de quitação e entrega de chaves", dica: "" },
  { v: "notificacao", t: "Notificações e cobranças", dica: "" },
  { v: "outros", t: "Outros", dica: "" },
] as const;

export type CategoriaDoc = (typeof CATEGORIAS_DOC)[number]["v"];

export const CATEGORIAS_VALIDAS = new Set<string>(CATEGORIAS_DOC.map((c) => c.v));

// valores do enum adm_tipo_seguro
export const TIPOS_SEGURO = [
  { v: "fianca", t: "Seguro-fiança" },
  { v: "capitalizacao", t: "Título de capitalização" },
  { v: "residencial", t: "Seguro residencial" },
  { v: "incendio", t: "Seguro incêndio" },
  { v: "fianca_bancaria", t: "Fiança bancária" },
  { v: "outro", t: "Outro" },
] as const;

export const TIPOS_SEGURO_VALIDOS = new Set<string>(TIPOS_SEGURO.map((t) => t.v));

export function nomeTipoSeguro(v: string | null | undefined): string {
  return TIPOS_SEGURO.find((t) => t.v === v)?.t || v || "Apólice";
}

// antecedência do alerta de vencimento de apólice
export const ALERTA_APOLICE_DIAS = 30;

// "hoje" no fuso de São Paulo, como YYYY-MM-DD
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// dias entre hoje (SP) e a data (YYYY-MM-DD). Negativo = já passou.
export function diasAte(dataISO: string | null | undefined): number | null {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}/.test(dataISO)) return null;
  const a = Date.parse(hojeSP() + "T00:00:00Z");
  const b = Date.parse(dataISO.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}
