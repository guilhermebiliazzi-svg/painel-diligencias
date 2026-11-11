'use server';

// rquatro — ações dos cards da diligência (mesmas do painel da Ville), sempre
// conferindo que o card é de uma diligência da unidade de quem está logado.
// Gravam no banco do motor (certidoes_status) e deixam rastro em
// painel_admin_log com origem 'rquatro'.
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { pool } from '@/lib/db';
import { rotaDoTipo } from '@/lib/rota-certidao';
import { exigirCardR4, exigirDiligenciaR4, pastasDaDiligencia } from '@/lib/r4/diligencia';
import { registrarSemCobranca } from '@/lib/r4/motor';
import { r4Admin } from '@/lib/r4/supabase';

const N8N = (process.env.N8N_WEBHOOK_BASE || 'https://villejds.app.n8n.cloud/webhook').replace(/\/+$/, '');
const WEBHOOKS = {
  wf03: `${N8N}/wf03-cnd-federal`,
  wf04: `${N8N}/wf04-certidoes-judiciais`,
  wf08: `${N8N}/wf08-certidoes-cadastrais`,
};
const WEBHOOK_WF07 = `${N8N}/wf07-auditoria-pdf`;
const DESLIGADO = true;

function atualizar(dilR4Id: string) {
  revalidatePath(`/r4/diligencias/${dilR4Id}`);
}

async function log(acao: string, usuario: { id: string; email: string }, extra: {
  certidao_id?: string | null;
  antigo?: string | null;
  novo?: string | null;
  detalhe?: Record<string, unknown>;
}) {
  const h = await headers();
  const ip = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown';
  await pool
    .query(
      `INSERT INTO painel_admin_log (acao, certidao_id, drive_file_id_antigo, drive_file_id_novo, detalhe, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        acao,
        extra.certidao_id ?? null,
        extra.antigo ?? null,
        extra.novo ?? null,
        JSON.stringify({ origem: 'rquatro', usuario: usuario.email, ...(extra.detalhe || {}) }),
        ip,
      ]
    )
    .catch((e) => console.error('[r4 log]', e));
}

async function dispara(url: string, body: unknown): Promise<{ status: number; erro: string | null }> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: r.status, erro: r.ok ? null : `http_${r.status}` };
  } catch (e) {
    return { status: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Reemitir: dispara o fluxo de emissão da certidão. Cobra de novo quando o PDF novo chegar. */
export async function r4Reemitir(dilR4Id: string, certidaoId: string) {
  const { usuario, card } = await exigirCardR4(dilR4Id, certidaoId);
  const { rows } = await pool.query(
    `SELECT cs.id AS certidao_id, cs.diligencia_id, cs.tipo, cs.documento, cs.titular, cs.nome_mae,
            to_char(cs.data_nascimento, 'YYYY-MM-DD') AS data_nascimento, cs.genero, cs.rg,
            COALESCE(cs.pasta_id, d.pasta_drive_id) AS pasta_id
       FROM certidoes_status cs JOIN diligencias d ON d.id = cs.diligencia_id
      WHERE cs.id = $1`,
    [card.id]
  );
  const c = rows[0];
  if (!c) throw new Error('Card não encontrado.');
  const rota = rotaDoTipo(c.tipo);
  if (!rota) throw new Error('Esta certidão não tem emissão automática.');
  const body: Record<string, unknown> = {
    certidao_id: c.certidao_id,
    diligencia_id: c.diligencia_id,
    tipo: c.tipo,
    documento: c.documento,
    pasta_id: c.pasta_id || '',
  };
  if (rota === 'wf04') {
    body.titular = c.titular || '';
    body.nome_mae = c.nome_mae || '';
    body.data_nascimento = c.data_nascimento || '';
    body.genero = c.genero || 'M';
    body.rg = c.rg || '';
  }
  if (rota === 'wf08' && c.tipo === 'iptu_pref_sp') body.sql_iptu = c.documento;

  await pool.query(`UPDATE certidoes_status SET status = 'pendente', erro = NULL, atualizado_em = NOW() WHERE id = $1`, [card.id]);
  const r = await dispara(WEBHOOKS[rota], body);
  await log('reemitir', usuario, { certidao_id: card.id, detalhe: { tipo: c.tipo, rota, http_status: r.status, erro_disparo: r.erro } });
  atualizar(dilR4Id);
}

/** Tira o PDF do card (o arquivo continua no Drive) e volta o card para pendente. */
export async function r4Desvincular(dilR4Id: string, certidaoId: string) {
  const { usuario, card } = await exigirCardR4(dilR4Id, certidaoId);
  await pool.query(
    `UPDATE certidoes_status
        SET drive_file_id = NULL, url_pdf = NULL, status = 'pendente', validacao_status = NULL,
            divergencia = false, resultado_certidao = NULL, observacao_ia = NULL, data_emissao_pdf = NULL,
            emitida_em = NULL, auditoria_tentativas = 0, auditado_em = NULL
      WHERE id = $1`,
    [card.id]
  );
  await log('desvincular', usuario, { certidao_id: card.id, antigo: card.drive_file_id });
  atualizar(dilR4Id);
}

/** Liga ao card um PDF que já está na pasta da diligência. Não é cobrado. */
export async function r4Vincular(dilR4Id: string, certidaoId: string, driveFileId: string, urlPdf: string, nome: string) {
  const { usuario, dil, card } = await exigirCardR4(dilR4Id, certidaoId);
  if (!/^[A-Za-z0-9_-]{10,}$/.test(driveFileId)) throw new Error('Arquivo inválido.');
  await registrarSemCobranca(dil, { certidao_id: card.id, tipo: card.tipo, titular: card.titular }, driveFileId);
  await pool.query(
    `UPDATE certidoes_status
        SET drive_file_id = $1, url_pdf = $2, status = 'concluido', validacao_status = 'validado', divergencia = false,
            observacao_ia = 'Vinculado manualmente pela unidade.', emitida_em = COALESCE(emitida_em, NOW()), auditado_em = NOW()
      WHERE id = $3`,
    [driveFileId, String(urlPdf || '').slice(0, 500), card.id]
  );
  await log('vincular', usuario, { certidao_id: card.id, antigo: card.drive_file_id, novo: driveFileId, detalhe: { nome_arquivo: nome } });
  atualizar(dilR4Id);
}

/** A unidade leu o PDF e registra o resultado. */
export async function r4ValidarManual(dilR4Id: string, certidaoId: string, fd: FormData) {
  const { usuario, card } = await exigirCardR4(dilR4Id, certidaoId);
  const resultado = String(fd.get('resultado') || '');
  const observacao = String(fd.get('observacao') || '').trim();
  if (!['negativa', 'positiva', 'com_pendencias'].includes(resultado)) throw new Error('Resultado inválido.');
  if (!card.drive_file_id) throw new Error('Vincule um PDF antes de validar.');
  const carimbo =
    'Validado manualmente pela unidade em ' +
    new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) +
    (observacao ? ' — ' + observacao.slice(0, 400) : '');
  await pool.query(
    `UPDATE certidoes_status
        SET resultado_certidao = $1, validacao_status = 'validado', divergencia = false, status = 'concluido',
            observacao_ia = $2, erro = NULL, auditado_em = NOW()
      WHERE id = $3`,
    [resultado, carimbo, card.id]
  );
  await log('validar_manual', usuario, { certidao_id: card.id, detalhe: { resultado, observacao: observacao || null } });
  atualizar(dilR4Id);
}

/** Mostrar/ocultar o card no link do cliente. */
export async function r4ToggleCard(certidaoId: string, dilR4Id: string, novoOculto: boolean) {
  const { usuario, card } = await exigirCardR4(dilR4Id, certidaoId);
  await pool.query(`UPDATE certidoes_status SET oculta_cliente = $2, atualizado_em = NOW() WHERE id = $1`, [card.id, !!novoOculto]);
  await log(novoOculto ? 'ocultar_card' : 'mostrar_card', usuario, { certidao_id: card.id });
  atualizar(dilR4Id);
}

/** Mostrar/ocultar uma pessoa inteira no link do cliente. */
export async function r4TogglePessoa(dilR4Id: string, documento: string, novoOculto: boolean) {
  const { usuario, dil } = await exigirDiligenciaR4(dilR4Id);
  const doc = String(documento || '').replace(/\D/g, '');
  if (!doc) throw new Error('Documento inválido.');
  if (novoOculto) {
    await pool.query(
      `INSERT INTO painel.titulares_ocultos (diligencia_id, documento_normalizado, criado_em)
       VALUES ($1, $2, NOW()) ON CONFLICT (diligencia_id, documento_normalizado) DO NOTHING`,
      [dil.motor_id, doc]
    );
  } else {
    await pool.query(`DELETE FROM painel.titulares_ocultos WHERE diligencia_id = $1 AND documento_normalizado = $2`, [dil.motor_id, doc]);
  }
  await log(novoOculto ? 'ocultar_pessoa' : 'mostrar_pessoa', usuario, { detalhe: { diligencia_id: dil.motor_id } });
  atualizar(dilR4Id);
}

/**
 * Card extra (documento avulso) num grupo. O form vem do CardExtraNovo:
 * diligencia_id = id da diligência no rquatro; pasta_id tem de ser uma pasta desta diligência.
 */
export async function r4CriarExtra(fd: FormData): Promise<string> {
  const dilR4Id = String(fd.get('diligencia_id') || '');
  const { usuario, dil } = await exigirDiligenciaR4(dilR4Id);
  const pasta = String(fd.get('pasta_id') || '');
  const descricao = String(fd.get('descricao') || '').trim().slice(0, 120);
  const doc = String(fd.get('documento_normalizado') || '').replace(/\D/g, '');
  const titular = String(fd.get('titular') || '').slice(0, 200);
  const driveFileId = String(fd.get('drive_file_id') || '');
  const urlPdf = String(fd.get('url_pdf') || '').slice(0, 500);
  if (!descricao) throw new Error('Informe a descrição do documento.');
  if (!(await pastasDaDiligencia(dil.motor_id)).has(pasta)) throw new Error('Pasta inválida para esta diligência.');
  if (driveFileId && !/^[A-Za-z0-9_-]{10,}$/.test(driveFileId)) throw new Error('Arquivo inválido.');
  const doComputador = !driveFileId;
  const ins = await pool.query(
    `INSERT INTO certidoes_status (
       diligencia_id, tipo, titular, documento, pasta_id, sheet_label, descricao_extra, is_extra,
       status, validacao_status, resultado_certidao, drive_file_id, url_pdf, emitida_em, atualizado_em, manual
     ) VALUES (
       $1, 'extra', NULLIF($2,''), NULLIF($3,''), $4, $5, $5, TRUE,
       CASE WHEN $8 THEN 'pendente' ELSE 'concluido' END,
       CASE WHEN $8 THEN NULL ELSE 'validado' END,
       NULL, NULLIF($6,''), NULLIF($7,''),
       CASE WHEN $8 THEN NULL ELSE NOW() END, NOW(), TRUE
     ) RETURNING id::text AS id`,
    [dil.motor_id, titular, doc, pasta, descricao, driveFileId, urlPdf, doComputador]
  );
  const id = ins.rows[0].id as string;
  await log('criar_extra', usuario, { certidao_id: id, novo: driveFileId || null, detalhe: { descricao, origem: doComputador ? 'computador' : 'drive' } });
  atualizar(dilR4Id);
  return id;
}

/** Exclui um card extra (só extras; o arquivo continua no Drive). */
export async function r4ExcluirExtra(certidaoId: string, dilR4Id: string) {
  const { usuario, card } = await exigirCardR4(dilR4Id, certidaoId);
  if (!card.is_extra) throw new Error('Só documentos adicionados por você podem ser excluídos.');
  await pool.query(`DELETE FROM certidoes_status WHERE id = $1 AND is_extra = TRUE`, [card.id]);
  await log('excluir_extra', usuario, { certidao_id: card.id, antigo: card.drive_file_id });
  atualizar(dilR4Id);
}

/** Auditoria: varre as pastas da diligência e liga PDFs soltos aos cards pendentes. */
export async function r4Auditar(dilR4Id: string) {
  // Desligado por decisão do Guilherme (11/11): ainda não liberado para as unidades.
  if (DESLIGADO) throw new Error('Auditoria da diligência não disponível.');
  const { usuario, dil } = await exigirDiligenciaR4(dilR4Id);
  const r = await dispara(WEBHOOK_WF07, { diligencia_id: dil.motor_id });
  await log('auditar_diligencia', usuario, { detalhe: { diligencia_id: dil.motor_id, http_status: r.status, erro_disparo: r.erro } });
  atualizar(dilR4Id);
}

/**
 * Corretores da equipe que podem ver esta diligência (além de quem cadastrou).
 * Só o responsável da unidade (ou o superadmin) escolhe.
 */
export async function r4SalvarCorretores(dilR4Id: string, ids: string[]): Promise<{ ok: boolean; msg: string }> {
  const { usuario, dil } = await exigirDiligenciaR4(dilR4Id);
  if (usuario.papel !== 'admin' && usuario.papel !== 'superadmin') {
    return { ok: false, msg: 'Só o responsável da unidade escolhe quem vê a diligência.' };
  }
  const adm = r4Admin();
  const { data: equipe } = await adm
    .from('usuarios')
    .select('id')
    .eq('unidade_id', dil.unidade_id)
    .eq('papel', 'corretor');
  const validos = new Set((equipe || []).map((x) => x.id as string));
  const escolhidos = [...new Set(ids)].filter((x) => validos.has(x));
  const { error: e1 } = await adm.from('diligencia_corretores').delete().eq('diligencia_id', dil.id);
  if (e1) return { ok: false, msg: 'Não consegui salvar. Tente de novo.' };
  if (escolhidos.length) {
    const { error: e2 } = await adm
      .from('diligencia_corretores')
      .insert(escolhidos.map((u) => ({ diligencia_id: dil.id, usuario_id: u, liberado_por: usuario.id })));
    if (e2) return { ok: false, msg: 'Não consegui salvar. Tente de novo.' };
  }
  atualizar(dilR4Id);
  return { ok: true, msg: escolhidos.length ? `Liberada para ${escolhidos.length} corretor(es).` : 'Nenhum corretor além de quem cadastrou.' };
}
