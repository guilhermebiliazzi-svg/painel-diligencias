// .docx dos contratos de locação e de administração (mesmo visual do CCV:
// logo, Times New Roman 11, justificado, cláusulas em negrito, linhas de assinatura).
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, TextRun, convertMillimetersToTwip,
} from "docx";
import { LOGO_PNG_BASE64 } from "./logo";
import type { Bloco } from "./contrato-locacao";

const FONT = "Times New Roman";
const SZ = 22;      // 11pt
const SZ_TIT = 26;  // 13pt
const NAVY = "0E2545";

function runs(text: string, size = SZ): TextRun[] {
  const out: TextRun[] = [];
  String(text).split(/\*\*([^*]+?)\*\*/g).forEach((p, i) => {
    if (p) out.push(new TextRun({ text: p, bold: i % 2 === 1, font: FONT, size }));
  });
  return out.length ? out : [new TextRun({ text: "", font: FONT, size })];
}

function linha(): Paragraph {
  return new Paragraph({
    spacing: { before: 520, after: 40 },
    indent: { left: 1400, right: 1400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } },
    children: [new TextRun({ text: "" })],
  });
}

export async function gerarContratoDocx(blocos: Bloco[], opts: { rascunho?: boolean } = {}): Promise<Buffer> {
  const ch: Paragraph[] = [];
  ch.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new ImageRun({ type: "png", data: Buffer.from(LOGO_PNG_BASE64, "base64"), transformation: { width: 150, height: 65 } })],
  }));
  for (const b of blocos) {
    switch (b.t) {
      case "titulo":
        ch.push(new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 60, after: opts.rascunho ? 40 : 240 },
          children: [new TextRun({ text: b.texto, bold: true, font: FONT, size: SZ_TIT, color: NAVY })],
        }));
        if (opts.rascunho) {
          ch.push(new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { after: 220 },
            children: [new TextRun({ text: "— minuta gerada pelo painel · confira antes de enviar para assinatura —", italics: true, color: "B22222", font: FONT, size: 18 })],
          }));
        }
        break;
      case "rotulo":
        ch.push(new Paragraph({
          spacing: { before: 200, after: 80 }, keepNext: true,
          children: [new TextRun({ text: b.texto, bold: true, font: FONT, size: SZ })],
        }));
        break;
      case "clausula":
        ch.push(new Paragraph({
          spacing: { before: 260, after: 100 }, keepNext: true,
          children: [new TextRun({ text: b.texto, bold: true, font: FONT, size: SZ, color: NAVY })],
        }));
        break;
      case "par":
        ch.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 140, line: 276 }, children: runs(b.texto) }));
        break;
      case "item":
        ch.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 276 }, indent: { left: 360 },
          children: runs(b.texto),
        }));
        break;
      case "local_data":
        ch.push(new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 360, after: 120 },
          children: [new TextRun({ text: b.texto, font: FONT, size: SZ })],
        }));
        break;
      case "assinatura":
        ch.push(linha());
        ch.push(new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 60 }, keepLines: true,
          children: [new TextRun({ text: `${b.papel}: ${b.nome}`, font: FONT, size: 20 })],
        }));
        break;
      case "testemunhas":
        for (let i = 0; i < 2; i++) {
          const t = b.lista[i] || {};
          ch.push(linha());
          ch.push(new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { after: 60 },
            children: [new TextRun({
              text: t.nome
                ? `TESTEMUNHA ${i + 1}: ${t.nome.toUpperCase()}${t.cpf ? `   CPF: ${t.cpf}` : "   CPF: ______________"}`
                : `TESTEMUNHA ${i + 1}   Nome: ____________________   CPF: ______________`,
              font: FONT, size: 20,
            })],
          }));
        }
        break;
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: {
          top: convertMillimetersToTwip(25), bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(28), right: convertMillimetersToTwip(22),
        },
      } },
      children: ch,
    }],
  });
  return Packer.toBuffer(doc);
}
