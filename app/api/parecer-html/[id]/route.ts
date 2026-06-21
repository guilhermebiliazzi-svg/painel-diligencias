// GET /api/parecer-html/[id]
// Serve o HTML renderizado (saida._html) do parecer mais recente de uma diligência,
// para o botão "Ver parecer" do painel abrir o documento.
// Colocar em: app/api/parecer-html/[id]/route.ts

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
      `SELECT saida, status
       FROM pareceres
       WHERE diligencia_id = $1
       ORDER BY criado_em DESC
       LIMIT 1`,
      [id]
    );
    const row = r.rows[0];
    const saida = row?.saida as { _html?: string; html?: string } | undefined;
    let html = saida?._html ?? saida?.html;
    if (!html) {
      return new Response('parecer ainda nao disponivel', { status: 404 });
    }

    // O _html é renderizado uma única vez, na geração (quando ainda é rascunho),
    // e guardado pronto. Liberar muda só a coluna `status`, não o HTML guardado.
    // Por isso, quando o parecer já está liberado ('aprovado'), removemos aqui os
    // dois blocos que só fazem sentido durante a revisão: a tarja "RASCUNHO"
    // (<div class="draft">…</div>) e o quadro "Para sua revisão" (<div class="review">…</div>).
    if (String(row?.status).toLowerCase() === 'aprovado') {
      html = html
        .replace(/<div class="draft">[\s\S]*?<\/div>/, '')
        .replace(/<div class="review">[\s\S]*?<\/ul><\/div>/, '');
    }

    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('parecer-html erro:', err);
    return new Response('erro ao consultar', { status: 500 });
  }
}
