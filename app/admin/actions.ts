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

  console.log('[reemitirCertidao] inicio', { certidao_id, diligencia_id });

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
  console.log('[reemitirCertidao] query retornou', rows.length, 'linhas');
  const c = rows[0];
  if (!c) {
    // Tenta sem JOIN pra ver se eh problema de permissao em diligencias
    const fallback = await pool.query(
      `SELECT id, diligencia_id, tipo FROM certidoes_status WHERE id = $1`,
      [certidao_id]
    );
    console.log('[reemitirCertidao] fallback sem JOIN retornou', fallback.rows.length, 'linhas:', fallback.rows[0] ?? '(nada)');
    throw new Error('certidao nao encontrada');
  }

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

/**
 * Alterna visibilidade de UM card no painel cliente.
 * Atualiza certidoes_status.oculta_cliente.
 */
export async function toggleCardOculto(certidao_id: string, diligencia_id: string, novoOculto: boolean) {
  if (!certidao_id || !diligencia_id) throw new Error('parametros invalidos');

  await pool.query(
    `UPDATE certidoes_status SET oculta_cliente = $2, atualizado_em = NOW() WHERE id = $1`,
    [certidao_id, novoOculto]
  );

  await logAcao({
    acao: novoOculto ? 'ocultar_card' : 'mostrar_card',
    certidao_id,
    detalhe: { diligencia_id },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Alterna visibilidade de uma PESSOA inteira (todos os cards do mesmo
 * documento_normalizado naquela diligencia) no painel cliente.
 * Insere/remove em painel.titulares_ocultos.
 */
export async function togglePessoaOculta(
  diligencia_id: string,
  documento_normalizado: string,
  novoOculto: boolean
) {
  if (!diligencia_id || !documento_normalizado) {
    throw new Error('parametros invalidos');
  }

  if (novoOculto) {
    await pool.query(
      `INSERT INTO painel.titulares_ocultos (diligencia_id, documento_normalizado, criado_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (diligencia_id, documento_normalizado) DO NOTHING`,
      [diligencia_id, documento_normalizado]
    );
  } else {
    await pool.query(
      `DELETE FROM painel.titulares_ocultos
       WHERE diligencia_id = $1 AND documento_normalizado = $2`,
      [diligencia_id, documento_normalizado]
    );
  }

  await logAcao({
    acao: novoOculto ? 'ocultar_pessoa' : 'mostrar_pessoa',
    detalhe: { diligencia_id, documento_normalizado },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Cria um card EXTRA (documento avulso) num grupo da diligencia.
 * NAO faz upload — o admin sobe o PDF manualmente no Drive (na pasta do grupo)
 * e seleciona ele aqui pelo dropdown. Apenas vincula no banco.
 *
 * - documento_normalizado e titular: identificam a pessoa dona do card
 *   (NULL pra cards de imovel — nao tem pessoa).
 * - pasta_id: pasta do Drive onde o PDF ja esta (mesma pasta usada pelo
 *   grupo onde o card sera inserido).
 * - drive_file_id e url_pdf: do PDF ja existente no Drive.
 */
export async function criarCertidaoExtra(formData: FormData) {
  const diligencia_id = String(formData.get('diligencia_id') || '');
  const documento_normalizado = String(formData.get('documento_normalizado') || '');
  const titular = String(formData.get('titular') || '');
  const pasta_id = String(formData.get('pasta_id') || '');
  const descricao = String(formData.get('descricao') || '').trim();
  const drive_file_id = String(formData.get('drive_file_id') || '');
  const url_pdf = String(formData.get('url_pdf') || '');

  if (!diligencia_id) throw new Error('diligencia_id obrigatorio');
  if (!pasta_id) throw new Error('pasta_id obrigatoria');
  if (!descricao) throw new Error('descricao obrigatoria');
  if (!drive_file_id) throw new Error('selecione um PDF da pasta');

  const insert = await pool.query(
    `INSERT INTO certidoes_status (
       diligencia_id, tipo, titular, documento, pasta_id,
       sheet_label, descricao_extra, is_extra,
       status, validacao_status, resultado_certidao,
       drive_file_id, url_pdf,
       emitida_em, atualizado_em, manual
     ) VALUES (
       $1, 'extra', NULLIF($2,''), NULLIF($3,''), $4,
       $5, $5, TRUE,
       'concluido', 'validado', NULL,
       $6, $7,
       NOW(), NOW(), TRUE
     )
     RETURNING id`,
    [
      diligencia_id,
      titular,
      documento_normalizado,
      pasta_id,
      descricao,
      drive_file_id,
      url_pdf,
    ]
  );

  const certidao_id = insert.rows[0].id as string;

  await logAcao({
    acao: 'criar_extra',
    certidao_id,
    drive_file_id_novo: drive_file_id,
    detalhe: { diligencia_id, descricao, pasta_id, documento_normalizado, titular },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Exclui um card extra. So funciona para is_extra=true (seguranca).
 * Nao deleta o PDF do Drive (caso queira, exclua manualmente).
 */
export async function excluirCertidaoExtra(certidao_id: string, diligencia_id: string) {
  if (!certidao_id || !diligencia_id) throw new Error('parametros invalidos');

  const before = await pool.query(
    `SELECT drive_file_id, is_extra FROM certidoes_status WHERE id = $1`,
    [certidao_id]
  );
  const row = before.rows[0];
  if (!row) throw new Error('certidao nao encontrada');
  if (!row.is_extra) throw new Error('apenas cards extras podem ser excluidos por aqui');

  await pool.query(`DELETE FROM certidoes_status WHERE id = $1 AND is_extra = TRUE`, [
    certidao_id,
  ]);

  await logAcao({
    acao: 'excluir_extra',
    certidao_id,
    drive_file_id_antigo: row.drive_file_id,
    detalhe: { diligencia_id },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

/**
 * Gerar parecer: dispara o workflow B (montagem dos fatos -> motor no Render).
 * Fire-and-forget — o motor (Opus) demora, então o fetch pode expirar; o B segue
 * rodando no n8n, gera o HTML, sobe no Storage e grava a URL em pareceres.
 * O painel acompanha pelo /api/parecer-status.
 */
const WEBHOOK_PARECER = 'https://villejds.app.n8n.cloud/webhook/gerar-parecer';

export async function gerarParecer(fd: FormData) {
  const diligencia_id = String(fd.get('diligencia_id') || '');
  if (!diligencia_id) throw new Error('diligencia_id ausente');

  const payload = {
    diligencia_id,
    comprador_nome: (fd.get('comprador_nome') as string) || null,
    comprador_cpf: (fd.get('comprador_cpf') as string) || null,
    comprador_qualificacao: (fd.get('comprador_qualificacao') as string) || null,
    preco: (fd.get('preco') as string) || null,
    forma_pagamento: (fd.get('forma_pagamento') as string) || null,
  };

  let httpStatus = 0;
  let erroDisparo: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(WEBHOOK_PARECER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    httpStatus = resp.status;
    if (!resp.ok) erroDisparo = `http_${resp.status}`;
  } catch (e) {
    erroDisparo = e instanceof Error ? e.message : String(e);
  }

  await logAcao({
    acao: 'gerar_parecer',
    detalhe: { diligencia_id, http_status: httpStatus, erro_disparo: erroDisparo },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('admin_session');
  redirect('/admin/login');
}

/**
 * Liberar parecer: congela o rascunho como aprovado, registrando quem e quando.
 * Atômico — demove qualquer parecer já aprovado desta diligência (mantém histórico
 * como 'substituido') antes de aprovar este, respeitando o índice único de
 * 1-aprovado-por-diligência.
 */
export async function liberarParecer(
  fd: FormData
): Promise<{ ok: boolean; error?: string }> {
  const parecer_id = String(fd.get('parecer_id') || '');
  const diligencia_id = String(fd.get('diligencia_id') || '');
  if (!parecer_id || !diligencia_id) return { ok: false, error: 'parecer_id/diligencia_id ausente' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE pareceres SET status = 'substituido'
         WHERE diligencia_id = $1 AND status = 'aprovado' AND id <> $2`,
      [diligencia_id, parecer_id]
    );
    const r = await client.query(
      `UPDATE pareceres
          SET status = 'aprovado', aprovado_por = $2, aprovado_em = NOW()
        WHERE id = $1 AND diligencia_id = $3`,
      [parecer_id, 'admin', diligencia_id]
    );
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Parecer não encontrado para esta diligência.' };
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    client.release();
  }

  await logAcao({ acao: 'liberar_parecer', detalhe: { diligencia_id, parecer_id } });
  revalidatePath(`/admin/d/${diligencia_id}`);
  return { ok: true };
}
// ====== ACRESCENTAR AO FINAL DO app/admin/actions.ts ======
// Dispara o webhook gerar-ccv (fire-and-forget). O negócio vem do dados_completos
// da diligência e a parte registral do parecer liberado — por isso só precisa do id.

const WEBHOOK_CCV = 'https://villejds.app.n8n.cloud/webhook/gerar-ccv';

export async function gerarCCV(diligencia_id: string) {
  if (!diligencia_id) throw new Error('diligencia_id ausente');

  let httpStatus = 0;
  let erroDisparo: string | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(WEBHOOK_CCV, {
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
    acao: 'gerar_ccv',
    detalhe: { diligencia_id, http_status: httpStatus, erro_disparo: erroDisparo },
  });

  revalidatePath(`/admin/d/${diligencia_id}`);
}
