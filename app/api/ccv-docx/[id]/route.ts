// GET /api/ccv-docx/[id]
// Gera o CCV em .docx (docx-js, layout de contrato) a partir do documento_md
// guardado em ccvs e devolve como download.
// Colocar em: app/api/ccv-docx/[id]/route.ts

import { pool } from '@/lib/db';
import { gerarCcvDocx } from '@/lib/ccv-docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeArquivo(endereco: string | null): string {
  const base = (endereco || 'Compromisso-de-Compra-e-Venda')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
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
      `SELECT c.documento_md, c.status, d.endereco
       FROM ccvs c
       JOIN diligencias d ON d.id = c.diligencia_id
       WHERE c.diligencia_id = $1
       ORDER BY c.criado_em DESC
       LIMIT 1`,
      [id]
    );
    const row = r.rows[0];
    if (!row?.documento_md) {
      return new Response('CCV ainda não gerado para esta diligência.', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const buffer = await gerarCcvDocx({ documento_md: row.documento_md, status: row.status });
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    return new Response(blob, {
      headers: {
        'content-disposition': `attachment; filename="${nomeArquivo(row.endereco)}"`,
      },
    });
  } catch (err) {
    console.error('ccv-docx erro:', err);
    return new Response('erro ao gerar o documento', { status: 500 });
  }
}
