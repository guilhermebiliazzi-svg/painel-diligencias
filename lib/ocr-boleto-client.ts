// lib/ocr-boleto-client.ts
// ------------------------------------------------------------------------------------
// Fallback de leitura de boleto NO NAVEGADOR (client component) para quando o PDF é
// imagem/escaneado — caso em que o leitor do servidor (lib/linha-digitavel.ts, via
// `unpdf`) não acha texto e devolve null.
//
// Fluxo: baixa o PDF → renderiza as páginas com pdf.js → OCR com tesseract.js →
// extrai a linha digitável → VALIDA o dígito verificador (mód-10 por campo no boleto
// bancário) → devolve linha + valor + vencimento. Se o DV não fechar, devolve o que
// leu com `validado:false` para a tela pedir conferência manual (nunca manda número
// não-conferido pro Inter).
//
// Dependências (adicionar ao package.json):  pdfjs-dist  tesseract.js
// Ambas são importadas DINAMICAMENTE — só carregam quando o fallback roda, então o
// caso comum (boleto com texto) continua leve.
//
// Uso (ver guia de integração):
//   import { lerBoletoViaOCR } from "@/lib/ocr-boleto-client";
//   const ocr = await lerBoletoViaOCR(urlDoBoletoAnexado);
//   if (ocr?.validado) { /* preenche linha/valor/vencimento */ }
// ------------------------------------------------------------------------------------

export type ResultadoOCRBoleto = {
  linha: string;          // só dígitos (47 bancário / 48 arrecadação)
  tipo: "banco-47" | "arrecadacao-48";
  valor: number | null;   // em reais
  vencimento: string | null; // YYYY-MM-DD (só boleto bancário, pelo fator)
  validado: boolean;      // DV conferido (bancário). false => pedir conferência manual
  origem: "ocr";
};

// ---------- parser puro (espelha lib/linha-digitavel.ts + validação de DV) ----------

const RE_BANCO = /(\d{5})\.?\s*(\d{5})\s*(\d{5})\.?\s*(\d{6})\s*(\d{5})\.?\s*(\d{6})\s*(\d)\s*(\d{14})/;
const RE_ARREC = /(8\d{11})[\s.\-]*(\d{12})[\s.\-]*(\d{12})[\s.\-]*(\d{12})/;

function mod10(num: string): number {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = parseInt(num[i], 10) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

// valida os 3 DVs de campo da linha digitável bancária (47 díg.)
function validaDVBanco(dig: string): boolean {
  if (dig.length !== 47) return false;
  return (
    mod10(dig.slice(0, 9)) === +dig[9] &&
    mod10(dig.slice(10, 20)) === +dig[20] &&
    mod10(dig.slice(21, 31)) === +dig[31]
  );
}

function extrairLinhaDigitavel(texto: string): { linha: string; tipo: "banco-47" | "arrecadacao-48" } | null {
  const t = (texto || "").replace(/ /g, " ");

  const mb = RE_BANCO.exec(t);
  if (mb) {
    const dig = mb.slice(1).join("").replace(/\D/g, "");
    if (dig.length === 47) return { linha: dig, tipo: "banco-47" };
  }
  const ma = RE_ARREC.exec(t);
  if (ma) {
    const dig = ma.slice(1).join("").replace(/\D/g, "");
    if (dig.length === 48 && dig.startsWith("8")) return { linha: dig, tipo: "arrecadacao-48" };
  }
  // fallback: varre linha a linha, tira não-dígitos, aceita bloco de 47/48
  for (const ln of t.split(/\r?\n/)) {
    const d = ln.replace(/\D/g, "");
    if (d.length === 47) return { linha: d, tipo: "banco-47" };
    if (d.length === 48 && d.startsWith("8")) return { linha: d, tipo: "arrecadacao-48" };
  }
  return null;
}

// valor do título embutido na linha (reais)
function valorDaLinha(dig: string, tipo: string): number | null {
  const emReais = (d: string) => {
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
  };
  if (tipo === "banco-47") {
    return emReais(dig.slice(37, 47)); // 10 díg. em centavos, após o fator
  }
  if (tipo === "arrecadacao-48" && dig.startsWith("8")) {
    // remove o DV de cada bloco de 12 -> código de barras de 44
    const barras = dig.slice(0, 11) + dig.slice(12, 23) + dig.slice(24, 35) + dig.slice(36, 47);
    if (barras.length !== 44) return null;
    const ident = barras[2]; // 6/8 => valor em reais; 7/9 => referência (não é R$)
    if (ident !== "6" && ident !== "8") return null;
    return emReais(barras.slice(4, 15)); // 11 díg.
  }
  return null;
}

// vencimento pelo fator (só boleto bancário). Trata o rollover de 2025-02-22.
function vencimentoDaLinha(dig: string, tipo: string): string | null {
  if (tipo !== "banco-47") return null; // arrecadação não tem fator padrão
  const fator = parseInt(dig.slice(33, 37), 10);
  if (!Number.isFinite(fator) || fator <= 0) return null;
  const addDias = (baseISO: string, d: number) =>
    new Date(new Date(baseISO + "T00:00:00Z").getTime() + d * 86400000);
  const candAntigo = addDias("2000-07-03", fator - 1000); // ciclo antigo
  const candNovo = addDias("2025-02-22", fator - 1000);   // ciclo pós-rollover
  const hoje = Date.now();
  const escolhido =
    Math.abs(candNovo.getTime() - hoje) <= Math.abs(candAntigo.getTime() - hoje)
      ? candNovo
      : candAntigo;
  return escolhido.toISOString().slice(0, 10);
}

export function parseLinhaDigitavelDeTexto(texto: string): ResultadoOCRBoleto | null {
  const r = extrairLinhaDigitavel(texto);
  if (!r) return null;
  const validado = r.tipo === "banco-47" ? validaDVBanco(r.linha) : false;
  return {
    linha: r.linha,
    tipo: r.tipo,
    valor: valorDaLinha(r.linha, r.tipo),
    vencimento: vencimentoDaLinha(r.linha, r.tipo),
    validado,
    origem: "ocr",
  };
}

// ---------- OCR no navegador (pdf.js + tesseract.js, importados dinamicamente) ----------

async function bytesDoBoleto(src: string | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  const resp = await fetch(src, { cache: "no-store" });
  if (!resp.ok) throw new Error("falha ao baixar o boleto: HTTP " + resp.status);
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Lê um boleto em PDF (inclusive imagem/escaneado) via OCR no navegador.
 * @param src URL do boleto anexado, ou os bytes do PDF.
 * @param opts.maxPaginas quantas páginas OCR no máximo (default 3)
 * @param opts.escala escala de render pro OCR (default 3 — mais nítido = melhor OCR)
 * @param opts.idioma idioma do tesseract (default "por")
 * @returns resultado com linha/valor/vencimento, ou null se não achar.
 */
export async function lerBoletoViaOCR(
  src: string | ArrayBuffer | Uint8Array,
  opts: { maxPaginas?: number; escala?: number; idioma?: string } = {}
): Promise<ResultadoOCRBoleto | null> {
  if (typeof window === "undefined") return null; // só roda no cliente
  const maxPaginas = opts.maxPaginas ?? 3;
  const escala = opts.escala ?? 3;
  const idioma = opts.idioma ?? "por";

  // 1) pdf.js
  const pdfjs: any = await import("pdfjs-dist");
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  } catch {
    /* versões antigas: ignora */
  }

  // 2) tesseract.js
  const tjs: any = await import("tesseract.js");
  const recognize: (img: any, lang: string, o?: any) => Promise<any> =
    tjs.recognize ?? tjs.default?.recognize;

  const bytes = await bytesDoBoleto(src);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const n = Math.min(pdf.numPages, maxPaginas);

  let textoTotal = "";
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const { data } = await recognize(canvas, idioma);
    textoTotal += "\n" + (data?.text || "");

    // achou já na primeira página? não precisa OCR das demais
    const parcial = parseLinhaDigitavelDeTexto(textoTotal);
    if (parcial) return parcial;
  }

  return parseLinhaDigitavelDeTexto(textoTotal);
}
