// GET /api/diligencia/[id]
//
// Retorna todas as certidoes de uma diligencia, ja sanitizadas pela view
// painel.v_painel_cliente (CPF/CNPJ mascarado, status em linguagem de
// cliente, sem erros tecnicos).

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Regex pra validar UUID v4 (formato padrao do Postgres)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tipo de cada linha retornada pela view. Tem que bater com as colunas do SELECT.
type DiligenciaRow = {
  diligencia_id: string;
  endereco: string;
  cliente_nome: string;
  certidao_id: string;
  tipo: string;
  titular: string | null;
  documento_mascarado: string | null;
  certidao: string | null;
  situacao: string;
  resultado: string | null;
  data_emissao: string | null;
  link_documento: string | null;
  emitida_em: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { erro: 'ID de diligencia invalido' },
      { status: 400 }
    );
  }

  try {
    const { rows } = await pool.query<DiligenciaRow>(
      `SELECT
         diligencia_id,
         endereco,
         cliente_nome,
         certidao_id,
         tipo,
         titular,
         documento_mascarado,
         certidao,
         situacao,
         resultado,
         data_emissao,
         link_documento,
         emitida_em
       FROM painel.v_painel_cliente
       WHERE diligencia_id = $1
       ORDER BY titular NULLS LAST, certidao`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { erro: 'Diligencia nao encontrada' },
        { status: 404 }
      );
    }

    const head = rows[0];
    return NextResponse.json({
      diligencia: {
        id: head.diligencia_id,
        endereco: head.endereco,
        cliente_nome: head.cliente_nome,
      },
      certidoes: rows.map((r) => ({
        id: r.certidao_id,
        tipo: r.tipo,
        titular: r.titular,
        documento: r.documento_mascarado,
        certidao: r.certidao,
        situacao: r.situacao,
        resultado: r.resultado,
        data_emissao: r.data_emissao,
        link: r.link_documento,
        emitida_em: r.emitida_em,
      })),
    });
  } catch (err) {
    console.error('Erro ao consultar diligencia:', err);
    return NextResponse.json(
      { erro: 'Erro ao consultar dados' },
      { status: 500 }
    );
  }
}