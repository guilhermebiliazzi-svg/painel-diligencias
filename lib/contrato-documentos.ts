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

// ---- cobrança do seguro do inquilino (no boleto, em N parcelas, ou pago direto) ----
// mes "YYYY-MM" -> "YYYY-MM-01"
export function mesParaData(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s + "-01";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 8) + "01";
  return null;
}

// valida/normaliza os campos de cobrança do seguro; devolve erro legível
export function normalizarCobrancaSeguro(
  b: any
): { ok: true; dados: { cobrar_no_boleto: boolean; valor_mensal: number | null; parcelas_total: number | null; cobranca_inicio: string | null; premio: number | null } } | { ok: false; error: string } {
  const noBoleto = b?.cobrar_no_boleto === true || b?.cobrar_no_boleto === "true";
  // aceita "41.08" e "41,08"
  const n = (v: unknown) => {
    const val = parseFloat(String(v ?? "").replace(",", ".").trim());
    return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : null;
  };
  const premio = n(b?.premio);
  if (!noBoleto) {
    return { ok: true, dados: { cobrar_no_boleto: false, valor_mensal: n(b?.valor_mensal), parcelas_total: null, cobranca_inicio: null, premio } };
  }
  const valor = n(b?.valor_mensal);
  // quantidade em branco = cobra todo mês enquanto o seguro estiver ativo (ex.: seguro-fiança)
  const parcTxt = String(b?.parcelas_total ?? "").trim();
  const parc = parcTxt ? parseInt(parcTxt, 10) : null;
  const ini = mesParaData(b?.cobranca_inicio);
  const falta: string[] = [];
  if (!valor) falta.push("valor da parcela");
  if (parc !== null && (!Number.isInteger(parc) || parc < 1 || parc > 120)) falta.push("quantidade de parcelas válida (1 a 120)");
  if (parc !== null && !ini) falta.push("mês da 1ª cobrança");
  if (falta.length) return { ok: false, error: `Seguro cobrado no boleto: informe ${falta.join(", ")}.` };
  return { ok: true, dados: { cobrar_no_boleto: true, valor_mensal: valor, parcelas_total: parc, cobranca_inicio: parc !== null ? ini : null, premio } };
}

// "nov/26" a partir de "2026-11-01"
export function mesCurto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [a, mm] = iso.slice(0, 7).split("-");
  return `${m[Number(mm) - 1] || mm}/${a.slice(2)}`;
}
