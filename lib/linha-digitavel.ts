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

// Extrai o vencimento (YYYY-MM-DD) do texto do boleto: a data logo após a
// palavra "vencimento"; se não achar, a maior data dd/mm/aaaa do documento.
export function extrairVencimento(texto: string): string | null {
  const t = texto || "";
  const re = /vencimento/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const seg = t.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const d = /(\d{2})\/(\d{2})\/(\d{4})/.exec(seg);
    if (d) return `${d[3]}-${d[2]}-${d[1]}`;
  }
  // Antes havia um palpite aqui: a MAIOR data dd/mm/aaaa da página. Numa
  // página de condomínio ou IPTU há várias datas que não são o vencimento, e o
  // palpite errava — foi o que fez um boleto de 01/09 aparecer como 25/09.
  // Sem rótulo, é melhor devolver nada e deixar quem paga digitar.
  return null;
}

// Calcula o vencimento REAL do título a partir do "fator de vencimento"
// embutido no código de barras / linha digitável (boleto bancário).
// É a data autoritativa que o Inter valida — mais confiável que a data lida
// do PDF ou digitada. Retorna YYYY-MM-DD, ou null para arrecadação/convênio
// (48 díg., começa com 8) e casos sem fator.
//
// Regra Febraban: fator 1000 = 2000-07-03. O fator (4 díg.) estourou em
// 9999 = 2025-02-21 e reiniciou em 1000 = 2025-02-22. Como não dá pra saber
// só pelo fator em qual ciclo ele está, calculamos as duas datas possíveis
// e escolhemos a mais próxima de hoje.
export function vencimentoDaLinhaDigitavel(linhaOuBarras: string): string | null {
  const d = String(linhaOuBarras || "").replace(/\D/g, "");
  if (!d || d.startsWith("8")) return null; // arrecadação não tem fator padrão
  let fatorStr: string | null = null;
  if (d.length === 47) fatorStr = d.slice(33, 37);       // linha digitável bancária
  else if (d.length === 44) fatorStr = d.slice(5, 9);    // código de barras
  else return null;
  const fator = parseInt(fatorStr, 10);
  if (!Number.isFinite(fator) || fator <= 0) return null;

  const addDias = (baseISO: string, n: number) =>
    new Date(new Date(baseISO + "T00:00:00Z").getTime() + n * 86400000);
  const candAntigo = addDias("2000-07-03", fator - 1000); // ciclo antigo
  const candNovo = addDias("2025-02-22", fator - 1000);   // ciclo pós-rollover
  const hoje = Date.now();
  const escolhido =
    Math.abs(candNovo.getTime() - hoje) <= Math.abs(candAntigo.getTime() - hoje)
      ? candNovo
      : candAntigo;
  return escolhido.toISOString().slice(0, 10);
}

// Valor do título embutido na linha digitável / código de barras.
//
// Boleto bancário: 10 dígitos em centavos logo após o fator de vencimento.
//
// Arrecadação/convênio (IPTU, água, luz): o valor tem 11 dígitos e mora no
// código de barras de 44. A linha de 48 é o mesmo código com um dígito
// verificador ao fim de cada bloco de 12 — tirando esses quatro DVs, volta-se
// ao código de barras. O 3º dígito diz o que aquele campo significa:
//   6 e 8 -> valor efetivo em reais   (dá para usar)
//   7 e 9 -> quantidade de moeda/referência, NÃO é em reais (devolvemos null)
// Chutar nos casos 7 e 9 mandaria um valor errado ao banco.
//
// Em qualquer formato, valor zero significa "boleto sem valor fixo" e também
// devolve null: melhor o campo em branco do que um zero que parece lido.
export function valorDaLinhaDigitavel(linhaOuBarras: string): number | null {
  const d = String(linhaOuBarras || "").replace(/\D/g, "");
  if (!d) return null;

  const emReais = (digitos: string) => {
    const n = parseInt(digitos, 10);
    return Number.isFinite(n) && n > 0 ? Math.round(n) / 100 : null;
  };

  // --- arrecadação / convênio ---
  if (d.startsWith("8")) {
    let barras: string;
    if (d.length === 48) {
      // remove o DV de cada bloco de 12 -> 44 dígitos
      barras = d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
    } else if (d.length === 44) {
      barras = d;
    } else return null;
    if (barras.length !== 44) return null;
    const identificador = barras[2];
    if (identificador !== "6" && identificador !== "8") return null; // não é valor em reais
    return emReais(barras.slice(4, 15));
  }

  // --- boleto bancário ---
  if (d.length === 47) return emReais(d.slice(37, 47));   // linha digitável
  if (d.length === 44) return emReais(d.slice(9, 19));    // código de barras
  return null;
}

// Lê o PDF (buffer) e devolve a linha digitável + vencimento, se encontrar.
export async function lerLinhaDigitavelDoPdf(buffer: ArrayBuffer | Uint8Array): Promise<{
  linha: string;
  tipo: string;
  vencimento: string | null;
  vencimento_origem: "codigo-de-barras" | "texto";
  valor: number | null;
} | null> {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const txt = Array.isArray(text) ? text.join("\n") : String(text || "");
    const ld = extrairLinhaDigitavel(txt);
    if (!ld) return null;
    // O fator de vencimento é a fonte da verdade: é o que o banco valida.
    // A data varrida do texto só entra quando não há fator (arrecadação),
    // porque ela pega qualquer dd/mm/aaaa da página — inclusive datas que
    // nada têm a ver com o título.
    const vencFator = vencimentoDaLinhaDigitavel(ld.linha);
    return {
      ...ld,
      vencimento: vencFator || extrairVencimento(txt),
      vencimento_origem: vencFator ? "codigo-de-barras" : "texto",
      valor: valorDaLinhaDigitavel(ld.linha),
    };
  } catch {
    return null; // PDF escaneado (imagem) ou ilegível → sem sugestão
  }
}
