/**
 * Leitor do CSV de "NFS-e emitidas" exportado pelo portal da Prefeitura de SP.
 *
 * Formato observado nos arquivos de 2026: separador ";", 73 colunas, uma linha
 * de cabeçalho, linhas de dados começando com "2" e uma linha final "Total".
 * O arquivo vem em Latin-1 — quem lê o arquivo precisa decodificar antes,
 * senão os acentos chegam quebrados aqui.
 */

export type NotaCsv = {
  numero_nota: string;
  codigo_verificacao: string;
  data_emissao: string; // AAAA-MM-DD
  valor_servico: number;
  codigo_servico: string;
  tomador_nome: string;
  tomador_doc: string;
  tomador_email: string;
  discriminacao: string;
  cancelada: boolean;
};

/** índices das colunas que interessam (0-based) */
const COL = {
  tipoRegistro: 0,
  numero: 1,
  dataHora: 2,
  verificacao: 3,
  situacao: 22,
  valor: 26,
  codigoServico: 28,
  tomadorDoc: 34,
  tomadorNome: 37,
  tomadorEmail: 46,
  discriminacao: 72,
};

const TOTAL_COLUNAS = 73;

const dig = (v: string) => String(v ?? "").replace(/\D/g, "");

/** "3.190,00" -> 3190 ; "0,00" -> 0 */
function valorBr(v: string): number {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

/** "31/01/2026 23:23:36" -> "2026-01-31" */
function dataBr(v: string): string {
  const m = String(v ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function lerCsvPrefeitura(texto: string): {
  notas: NotaCsv[];
  linhasIgnoradas: number;
} {
  const linhas = String(texto ?? "").split(/\r?\n/);
  const notas: NotaCsv[] = [];
  let ignoradas = 0;

  for (const linha of linhas) {
    if (!linha.trim()) continue;
    // cabeçalho e a linha de fechamento não são notas
    if (!linha.startsWith("2;")) continue;

    const p = linha.split(";");
    if (p.length < TOTAL_COLUNAS) {
      ignoradas++;
      continue;
    }
    // A discriminação é o último campo e pode conter ";" — o que sobrar da
    // contagem pertence a ela.
    const discri =
      p.length > TOTAL_COLUNAS
        ? p.slice(COL.discriminacao).join(";")
        : p[COL.discriminacao];

    const numero = dig(p[COL.numero]);
    if (!numero) {
      ignoradas++;
      continue;
    }

    notas.push({
      numero_nota: numero,
      codigo_verificacao: String(p[COL.verificacao] ?? "").trim(),
      data_emissao: dataBr(p[COL.dataHora]),
      valor_servico: valorBr(p[COL.valor]),
      codigo_servico: String(p[COL.codigoServico] ?? "").trim(),
      tomador_nome: String(p[COL.tomadorNome] ?? "").trim(),
      tomador_doc: dig(p[COL.tomadorDoc]),
      tomador_email: String(p[COL.tomadorEmail] ?? "").trim(),
      // no arquivo as quebras de linha viram "|"
      discriminacao: String(discri ?? "").replace(/\|/g, "\n").trim(),
      // "C" = cancelada; "T" = tributada (normal)
      cancelada: String(p[COL.situacao] ?? "").trim().toUpperCase() === "C",
    });
  }

  return { notas, linhasIgnoradas: ignoradas };
}
