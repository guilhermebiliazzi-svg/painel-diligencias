// app/admin/actions.ts
// Server actions do painel admin: desvincular, vincular, logout.

'use server';

import { pool } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

async function getIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown';
}

async function logAcao(opts: {
  acao: string;
  certidao_id?: string | null;
  drive_file_id_antigo?: string | null;
  drive_file_id_novo?: string | null;
  detalhe?: object;
}) {
  const ip = await getIp();
  await pool.query(
    `INSERT INTO painel_admin_log (acao, certidao_id, drive_file_id_antigo, drive_file_id_novo, detalhe, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      opts.acao,
      opts.certidao_id ?? null,
      opts.drive_file_id_antigo ?? null,
      opts.drive_file_id_novo ?? null,
      opts.detalhe ? JSON.stringify(opts.detalhe) : null,
      ip,
    ]
  );
}

/**
 * Desvincular: remove o PDF do card e devolve a certidao para 'pendente'.
 * Nao apaga o arquivo no Drive (decisao do usuario: opcao 2).
 */
export async function desvincularPDF(certidao_id: string, diligencia_id: string) {
  if (!certidao_id || !diligencia_id) throw new Error('parametros invalidos');

  // Pega estado atual pra log
  const before = await pool.query(
    `SELECT drive_file_id, status FROM certidoes_status WHERE id = $1`,
    [certidao_id]
  );
  const drive_file_id_antigo = before.rows[0]?.drive_file_id ?? null;

  await pool.query(
    `UPDATE certidoes_status
     SET drive_file_id = NULL,
         url_pdf = NULL,
         status = 'pendente',
         validacao_status = NULL,
         divergencia = false,
         resultado_certidao = NULL,
         observacao_ia = NULL,
         data_emissao_pdf = NULL,
         emitida_em = NULL,
         auditoria_tentativas = 0,
         auditado_em = NULL
     WHERE id = $1`,
    [certidao_id]
  );

  await logAcao({
    acao: 'desvincular',
    certidao_id,
    drive_file_id_antigo,
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Vincular: associa um drive_file_id a um card.
 * NAO move o arquivo no Drive (decisao 2). So atualiza o banco.
 * Marca como 'concluido' + 'validado' (intervencao manual do admin).
 */
export async function vincularPDF(opts: {
  certidao_id: string;
  diligencia_id: string;
  drive_file_id: string;
  url_pdf: string;
  nome_arquivo: string;
}) {
  const { certidao_id, diligencia_id, drive_file_id, url_pdf, nome_arquivo } = opts;
  if (!certidao_id || !drive_file_id) throw new Error('parametros invalidos');

  // Pega estado anterior
  const before = await pool.query(
    `SELECT drive_file_id FROM certidoes_status WHERE id = $1`,
    [certidao_id]
  );
  const drive_file_id_antigo = before.rows[0]?.drive_file_id ?? null;

  await pool.query(
    `UPDATE certidoes_status
     SET drive_file_id = $1,
         url_pdf = $2,
         status = 'concluido',
         validacao_status = 'validado',
         divergencia = false,
         observacao_ia = 'Vinculado manualmente pelo admin.',
         emitida_em = COALESCE(emitida_em, NOW()),
         auditado_em = NOW()
     WHERE id = $3`,
    [drive_file_id, url_pdf, certidao_id]
  );

  await logAcao({
    acao: 'vincular',
    certidao_id,
    drive_file_id_antigo,
    drive_file_id_novo: drive_file_id,
    detalhe: { nome_arquivo },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Logout: limpa cookie de sessao.
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
  redirect('/admin/login');
}
