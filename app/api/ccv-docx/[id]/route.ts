// GET /api/ccv-docx/[id]
// Converte o HTML do CCV mais recente da diligência (ccvs.saida._html) em um
// arquivo .docx e devolve como download. Reaproveita o mesmo render (com a logo).
// Colocar em: app/api/ccv-docx/[id]/route.ts

import { pool } from '@/lib/db';
import HTMLtoDOCX from 'html-to-docx';

export const runtime = 'nodejs';        // html-to-docx precisa do runtime Node (não Edge)
export const dynamic = 'force-dynamic'; // nunca cachear

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeArquivo(endereco: string | null): string {
  const base = (endereco || 'Compromisso-de-Compra-e-Venda')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')                     // só alfanumérico
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `CCV-${base || 'documento'}.docx`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return new Response('id invalido', { status: 400 });
  }
  try {
    const r = await pool.query(
      `SELECT c.saida, c.status, d.endereco
       FROM ccvs c
       JOIN diligencias d ON d.id = c.diligencia_id
       WHERE c.diligencia_id = $1
       ORDER BY c.criado_em DESC
       LIMIT 1`,
      [id]
    );
    const row = r.rows[0];
    const saida = row && (typeof row.saida === 'string' ? JSON.parse(row.saida) : row.saida);
    const html = saida?._html;
    if (!html) {
      return new Response('CCV ainda não gerado para esta diligência.', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const buffer = await HTMLtoDOCX(html, null, { footer: false, pageNumber: false });
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);

    return new Response(bytes, {
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': `attachment; filename="${nomeArquivo(row.endereco)}"`,
      },
    });
  } catch (err) {
    console.error('ccv-docx erro:', err);
    return new Response('erro ao gerar o documento', { status: 500 });
  }
}
