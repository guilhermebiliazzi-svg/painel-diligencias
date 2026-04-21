// GET /api/diligencia/[id]
//
// Retorna todas as certidões de uma diligência, já sanitizadas pela view
// painel.v_painel_cliente (CPF/CNPJ mascarado, status em linguagem de
// cliente, sem erros técnicos).
//
// O UUID na URL é a única "autenticação" — quem tem o link, vê o painel.
// Não é segurança cripto-forte, mas é aceitável pro fluxo: o corretor
// envia o link pessoalmente pelo WhatsApp.

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

// Regex pra validar UUID v4 (formato padrão do Postgres)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validação defensiva: se vier lixo na URL, nem consulta o banco.
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json(
      { erro: 'ID de diligência invalido' },
      { status: 400 }
    );
  }

  try {
    const { rows } = await pool.query(
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
        { erro: 'Diligência não encontrada' },
        { status: 404 }
      );
    }

    // Cabeçalho sai da primeira linha (todas têm os mesmos dados da
    // diligência), e as certidões ficam numa lista separada.
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
    console.error('Erro ao consultar diligência:', err);
    return NextResponse.json(
      { erro: 'Erro ao consultar dados' },
      { status: 500 }
    );
  }
}
