// GET /api/ccv-html/[id]
// Serve o HTML do CCV mais recente de uma diligência (igual ao /api/parecer-html).
// O HTML é gerado no backend (ccv_render.js) e guardado em ccvs.saida._html.
// Colocar em: app/api/ccv-html/[id]/route.ts

import { pool } from '@/lib/db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      `SELECT saida
       FROM ccvs
       WHERE diligencia_id = $1
       ORDER BY criado_em DESC
       LIMIT 1`,
      [id]
    );
    const saida = r.rows[0]?.saida ?? null;
    const html = saida && (typeof saida === 'string' ? JSON.parse(saida) : saida)?._html;
    if (!html) {
      return new Response('CCV ainda não gerado para esta diligência.', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('ccv-html erro:', err);
    return new Response('erro ao gerar o documento', { status: 500 });
  }
}
