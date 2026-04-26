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
 * Reemitir: dispara o webhook do WF-04/WF-08/WF-03 conforme o tipo da
 * certidao. Faz a mesma coisa que o Code — Roteador do WF-09 faz, mas
 * sob demanda (sem esperar cron).
 *
 * Tambem reseta o card pra 'pendente' (limpa erro/tentativas) pra que
 * o WF-04/08 possa re-marcar e re-processar.
 */
const WEBHOOKS = {
  wf03: 'https://villejds.app.n8n.cloud/webhook/wf03-cnd-federal',
  wf04: 'https://villejds.app.n8n.cloud/webhook/wf04-certidoes-judiciais',
  wf08: 'https://villejds.app.n8n.cloud/webhook/wf08-certidoes-cadastrais',
};

function rotaDoTipo(tipo: string): 'wf03' | 'wf04' | 'wf08' | null {
  if (!tipo) return null;
  if (tipo.startsWith('cnd_federal')) return 'wf03';
  if (tipo.startsWith('tjsp_') || tipo.startsWith('trf_') || tipo.startsWith('trt2_')) return 'wf04';
  if (
    tipo.startsWith('cndt_tst') ||
    tipo.startsWith('pge_sp_') ||
    tipo.startsWith('sefaz_sp_') ||
    tipo.startsWith('mobiliaria_') ||
    tipo === 'crf_fgts' ||
    tipo.startsWith('sit_cadastral_') ||
    tipo.startsWith('cenprot_') ||
    tipo === 'iptu_pref_sp' ||
    tipo === 'prefeitura_iss'
  )
    return 'wf08';
  return null;
}

export async function reemitirCertidao(certidao_id: string, diligencia_id: string) {
  if (!certidao_id || !diligencia_id) throw new Error('parametros invalidos');

  // Carrega dados da certidao (mesmo SELECT que o WF-09 faz)
  const { rows } = await pool.query(
    `SELECT cs.id AS certidao_id,
            cs.diligencia_id,
            cs.tipo,
            cs.documento,
            cs.titular,
            cs.nome_mae,
            to_char(cs.data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
            cs.genero,
            cs.rg,
            COALESCE(cs.pasta_id, d.pasta_drive_id) AS pasta_id
     FROM certidoes_status cs
     JOIN diligencias d ON d.id = cs.diligencia_id
     WHERE cs.id = $1`,
    [certidao_id]
  );
  const c = rows[0];
  if (!c) throw new Error('certidao nao encontrada');

  const rota = rotaDoTipo(c.tipo);
  if (!rota) throw new Error(`tipo nao roteavel: ${c.tipo}`);
  const url = WEBHOOKS[rota];

  // Body base
  const body: Record<string, unknown> = {
    certidao_id: c.certidao_id,
    diligencia_id: c.diligencia_id,
    tipo: c.tipo,
    documento: c.documento,
    pasta_id: c.pasta_id || '',
  };

  // Campos adicionais por rota (mesma logica do WF-09)
  if (rota === 'wf04') {
    body.titular = c.titular || '';
    body.nome_mae = c.nome_mae || '';
    body.data_nascimento = c.data_nascimento || '';
    body.genero = c.genero || 'M';
    body.rg = c.rg || '';
  }
  if (rota === 'wf08' && c.tipo === 'iptu_pref_sp') {
    body.sql_iptu = c.documento;
  }

  // Reseta o card pra pendente antes de disparar
  await pool.query(
    `UPDATE certidoes_status
     SET status = 'pendente',
         erro = NULL,
         atualizado_em = NOW()
     WHERE id = $1`,
    [certidao_id]
  );

  // Dispara o webhook (fire-and-forget com timeout curto)
  let httpStatus = 0;
  let erroDisparo: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    httpStatus = resp.status;
    if (!resp.ok) erroDisparo = `http_${resp.status}`;
  } catch (e) {
    erroDisparo = e instanceof Error ? e.message : String(e);
  }

  await logAcao({
    acao: 'reemitir',
    certidao_id,
    detalhe: {
      tipo: c.tipo,
      rota,
      url,
      http_status: httpStatus,
      erro_disparo: erroDisparo,
    },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Auditar diligencia: chama o webhook do WF-07 com diligencia_id.
 * O WF-07 v3.4 vai varrer todas as pastas pendentes dessa diligencia
 * e tentar vincular os PDFs orfaos nos cards correspondentes.
 */
const WEBHOOK_WF07 = 'https://villejds.app.n8n.cloud/webhook/wf07-auditoria-pdf';

export async function auditarDiligencia(diligencia_id: string) {
  if (!diligencia_id) throw new Error('diligencia_id ausente');

  let httpStatus = 0;
  let erroDisparo: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(WEBHOOK_WF07, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diligencia_id }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    httpStatus = resp.status;
    if (!resp.ok) erroDisparo = `http_${resp.status}`;
  } catch (e) {
    erroDisparo = e instanceof Error ? e.message : String(e);
  }

  await logAcao({
    acao: 'auditar_diligencia',
    detalhe: {
      diligencia_id,
      http_status: httpStatus,
      erro_disparo: erroDisparo,
    },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
  redirect('/admin/login');
}
