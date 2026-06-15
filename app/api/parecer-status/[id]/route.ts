// GET /api/parecer-status/[id]
// Devolve o parecer mais recente de uma diligência (status + link), para o
// componente GerarParecer acompanhar a geração.
// Colocar em: app/api/parecer-status/[id]/route.ts

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ erro: 'id invalido' }, { status: 400 });
  }
  try {
    const r = await pool.query(
      `SELECT id, veredito, modo, status, pdf_url, criado_em
       FROM pareceres
       WHERE diligencia_id = $1
       ORDER BY criado_em DESC
       LIMIT 1`,
      [id]
    );
    return NextResponse.json({ parecer: r.rows[0] ?? null });
  } catch (err) {
    console.error('parecer-status erro:', err);
    return NextResponse.json({ erro: 'erro ao consultar' }, { status: 500 });
  }
}
