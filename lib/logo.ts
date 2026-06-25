// lib/ccv-docx.ts
// Gera o CCV em .docx NATIVAMENTE (docx-js) a partir do documento_md.
// Layout de contrato: logo, título centralizado, cláusulas, justificado, assinaturas.
// Colocar em: lib/ccv-docx.ts

import {
  Document, Packer, Paragraph, TextRun, ImageRun,
  AlignmentType, BorderStyle, convertMillimetersToTwip,
} from 'docx';
import { LOGO_PNG_BASE64 } from './logo';

const FONT = 'Times New Roman';
const SZ_BODY = 22;   // 11pt
const SZ_TITLE = 26;  // 13pt
const SZ_SEC = 23;    // 11.5pt
const NAVY = '0E2545';
const RED = 'B22222';

function runs(text: string, base: Record<string, unknown> = {}): TextRun[] {
  const out: TextRun[] = [];
  const parts = String(text).split(/\*\*([^*]+?)\*\*/g);
  parts.forEach((p, i) => {
    if (p === '') return;
    out.push(new TextRun({ text: p, bold: i % 2 === 1, font: FONT, size: SZ_BODY, ...base }));
  });
  return out.length ? out : [new TextRun({ text: '', font: FONT, size: SZ_BODY })];
}

export async function gerarCcvDocx(
  { documento_md, status }: { documento_md: string; status?: string | null }
): Promise<Buffer> {
  const logoBuffer = Buffer.from(LOGO_PNG_BASE64, 'base64');
  const blocos = String(documento_md || '')
    .replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const children: Paragraph[] = [];

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new ImageRun({ type: 'png', data: logoBuffer, transformation: { width: 150, height: 65 } })],
  }));

  let tituloFeito = false;
  for (const b of blocos) {
    if (!tituloFeito && /^\*\*[^*]+\*\*$/.test(b) && /INSTRUMENTO|COMPROMISSO/i.test(b)) {
      const txt = b.replace(/^\*\*|\*\*$/g, '');
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 },
        children: [new TextRun({ text: txt, bold: true, font: FONT, size: SZ_TITLE, color: NAVY })],
      }));
      if (status !== 'aprovado') {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { after: 200 },
          children: [new TextRun({ text: '— RASCUNHO · aguarda revisão e liberação —', italics: true, color: RED, font: FONT, size: 18 })],
        }));
      } else {
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
      tituloFeito = true;
      continue;
    }
    if (/^_{5,}$/.test(b)) {
      children.push(new Paragraph({
        spacing: { before: 480, after: 160 },
        indent: { left: 1400, right: 1400 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
        children: [new TextRun({ text: '' })],
      }));
      continue;
    }
    if (/^\*\*[^*]+\*\*$/.test(b)) {
      const txt = b.replace(/^\*\*|\*\*$/g, '').trim();
      const soMaiusc = txt === txt.toUpperCase() && /[A-ZÀ-Ý]/.test(txt) && !/^\d/.test(txt);
      if (soMaiusc) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 0, after: 20 },
          children: [new TextRun({ text: txt, bold: true, font: FONT, size: SZ_BODY })],
        }));
      } else {
        children.push(new Paragraph({
          spacing: { before: 260, after: 100 }, keepNext: true,
          children: [new TextRun({ text: txt, bold: true, font: FONT, size: SZ_SEC, color: NAVY })],
        }));
      }
      continue;
    }
    const ehCargo = /^(PARTE |TESTEMUNHA|INTERVEN|OUTORG|PROMITENTE|PROMISS)/i.test(b)
      || (b.length <= 50 && b === b.toUpperCase() && /[A-ZÀ-Ý]/.test(b));
    if (ehCargo) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 },
        children: runs(b, { size: 20 }),
      }));
      continue;
    }
    children.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 140, line: 276 },
      children: runs(b),
    }));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ_BODY } } } },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: {
          top: convertMillimetersToTwip(25), bottom: convertMillimetersToTwip(25),
          left: convertMillimetersToTwip(28), right: convertMillimetersToTwip(22),
        },
      } },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
