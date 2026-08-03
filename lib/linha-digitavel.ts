// Extrai a linha digitável / código de barras de um boleto a partir do texto
// do PDF. Cobre os dois formatos comuns de condomínio/IPTU:
//   - Boleto bancário (47 dígitos): 5.5  5.6  5.6  1  14
//   - Arrecadação/convênio (48 dígitos, começa com 8): 4 blocos de 12
import { extractText, getDocumentProxy } from "unpdf";

// banco (47): campos com ponto/espaço
const RE_BANCO = /(\d{5})\.?(\d{5})\s+(\d{5})\.?(\d{6})\s+(\d{5})\.?(\d{6})\s+(\d)\s+(\d{14})/;
// arrecadação (48): 4 blocos de 12, começa com 8, separadores variados
const RE_ARREC = /(8\d{11})[\s.\-]*(\d{12})[\s.\-]*(\d{12})[\s.\-]*(\d{12})/;

export function extrairLinhaDigitavel(texto: string): { linha: string; tipo: string } | null {
  const t = texto || "";

  const mb = RE_BANCO.exec(t);
  if (mb) {
    const dig = mb.slice(1).join("");
    if (dig.length === 47) return { linha: dig, tipo: "banco-47" };
  }

  const ma = RE_ARREC.exec(t);
  if (ma) {
    const dig = ma.slice(1).join("");
    if (dig.length === 48) return { linha: dig, tipo: "arrecadacao-48" };
  }

  // fallback: qualquer bloco que, sem separadores, dê 47 ou 48 dígitos
  const blocos = t.match(/[\d][\d.\s\-]{40,75}[\d]/g) || [];
  for (const b of blocos) {
    const d = b.replace(/\D/g, "");
    if (d.length === 47) return { linha: d, tipo: "fallback-47" };
    if (d.length === 48 && d.startsWith("8")) return { linha: d, tipo: "fallback-48" };
  }
  return null;
}

// Lê o PDF (buffer) e devolve a linha digitável, se encontrar.
export async function lerLinhaDigitavelDoPdf(
  buffer: ArrayBuffer | Uint8Array
): Promise<{ linha: string; tipo: string } | null> {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const txt = Array.isArray(text) ? text.join("\n") : String(text || "");
    return extrairLinhaDigitavel(txt);
  } catch {
    return null; // PDF escaneado (imagem) ou ilegível → sem sugestão
  }
}
