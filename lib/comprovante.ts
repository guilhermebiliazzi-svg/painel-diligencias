// Gera um comprovante (PDF) de pagamento Pix a partir dos dados confirmados
// pelo Inter. O Inter não fornece um "comprovante" pronto — este é o nosso,
// contendo o endToEnd (identificador oficial do Pix) como prova verificável.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type DadosComprovantePix = {
  valor: number;
  recebedorNome?: string | null;
  recebedorDoc?: string | null; // CPF/CNPJ
  bancoIspb?: string | null;
  agencia?: string | null;
  conta?: string | null;
  endToEnd?: string | null;
  codigoSolicitacao?: string | null;
  dataHora?: string | null; // ISO ou já formatada
  referencia?: string | null; // ex.: "Repasse contrato 30 · competência 2026-07"
  pagador?: string; // quem paga (imobiliária)
};

const AZUL = rgb(0 / 255, 61 / 255, 165 / 255);
const CINZA = rgb(90 / 255, 107 / 255, 133 / 255);
const PRETO = rgb(22 / 255, 35 / 255, 59 / 255);

const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(d?: string | null): string {
  if (!d) return "";
  // aceita ISO (2026-07-15T...) ou "2026-07-15"
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
  return String(d);
}

export async function gerarComprovantePixPDF(d: DadosComprovantePix): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // faixa superior
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: AZUL });
  page.drawText("Ville Jardins", { x: 40, y: height - 45, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Negócios Imobiliários", { x: 40, y: height - 65, size: 11, font, color: rgb(0.85, 0.9, 1) });
  page.drawText("COMPROVANTE", { x: width - 200, y: height - 40, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Pagamento via Pix", { x: width - 200, y: height - 58, size: 10, font, color: rgb(0.85, 0.9, 1) });

  let y = height - 130;
  const L = 40;

  page.drawText("Comprovante de pagamento — Pix", { x: L, y, size: 15, font: bold, color: PRETO });
  y -= 10;
  page.drawLine({ start: { x: L, y }, end: { x: width - L, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) });
  y -= 28;

  // valor em destaque
  page.drawText("Valor pago", { x: L, y, size: 10, font, color: CINZA });
  page.drawText(brl(d.valor), { x: L, y: y - 22, size: 24, font: bold, color: AZUL });
  y -= 60;

  const linha = (rotulo: string, valor?: string | null) => {
    if (!valor) return;
    page.drawText(rotulo, { x: L, y, size: 9, font, color: CINZA });
    page.drawText(String(valor), { x: L, y: y - 15, size: 12, font: bold, color: PRETO });
    y -= 40;
  };

  linha("Recebedor", d.recebedorNome || undefined);
  linha("CPF/CNPJ do recebedor", d.recebedorDoc || undefined);
  const dadosBanc = [d.agencia ? `Ag. ${d.agencia}` : "", d.conta ? `Conta ${d.conta}` : "", d.bancoIspb ? `ISPB ${d.bancoIspb}` : ""].filter(Boolean).join("  ·  ");
  linha("Conta de destino", dadosBanc || undefined);
  linha("Pagador", d.pagador || "Ville Jardins Negócios Imobiliários");
  linha("Data/hora do pagamento", fmtData(d.dataHora) || undefined);
  linha("Referência", d.referencia || undefined);

  // bloco de identificadores oficiais
  y -= 6;
  page.drawLine({ start: { x: L, y }, end: { x: width - L, y }, thickness: 1, color: rgb(0.9, 0.92, 0.95) });
  y -= 24;
  page.drawText("Identificação da transação (Banco Inter)", { x: L, y, size: 10, font: bold, color: PRETO });
  y -= 22;
  linha("End to End (Pix)", d.endToEnd || undefined);
  linha("Código de solicitação", d.codigoSolicitacao || undefined);

  // rodapé
  page.drawText(
    "Documento gerado eletronicamente pela Ville Jardins. O End to End é o identificador oficial do Pix e permite a",
    { x: L, y: 70, size: 8, font, color: CINZA }
  );
  page.drawText(
    "verificação do pagamento junto ao Banco Inter. Rua Batataes, nº 148, Jardim Paulista, São Paulo.",
    { x: L, y: 60, size: 8, font, color: CINZA }
  );

  return pdf.save();
}
