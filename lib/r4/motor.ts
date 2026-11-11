// rquatro — ponte com o MOTOR de certidões (n8n + banco da Ville). Só servidor.
//
// O rquatro não grava nada nas tabelas da Ville: quem cria a diligência e as
// certidões é o fluxo R4-01 do n8n (cópia do WF-01 para unidades externas), que
// cria as pastas no Drive DA UNIDADE e marca dados_completos.origem='rquatro'.
// Daqui só: (1) chamar o R4-01 com o segredo; (2) LER o andamento das certidões
// da diligência (pelo id do motor guardado no Supabase do rquatro).
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pool } from '@/lib/db';
import { r4Admin } from '@/lib/r4/supabase';

const N8N = (process.env.N8N_WEBHOOK_BASE || 'https://villejds.app.n8n.cloud/webhook').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Conta Google do motor: a unidade compartilha a pasta dela com este e-mail (Editor). */
export const CONTA_DRIVE_MOTOR = process.env.R4_CONTA_DRIVE || 'guilhermebiliazzi@remax.com.br';

/** Extrai o ID da pasta de um link do Google Drive (ou aceita o próprio ID). */
export function idDaPastaDrive(texto: string): string | null {
  const t = String(texto || '').trim();
  if (!t) return null;
  const m = t.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || t.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : null;
}

async function segredoMotor(): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('credenciais_sistema')
    .select('valor')
    .eq('chave', 'r4_motor_secret')
    .maybeSingle();
  const v = (data as { valor?: string } | null)?.valor || '';
  return v.length >= 20 ? v : null;
}

export type RespostaMotor = { ok: boolean; id?: string; pasta_drive_id?: string; erro?: string };

/** Envia a diligência ao R4-01. O corpo segue o formato do formulário do WF-01. */
export async function enviarAoMotor(corpo: Record<string, unknown>): Promise<RespostaMotor> {
  const segredo = await segredoMotor();
  if (!segredo) return { ok: false, erro: 'O motor do rquatro ainda não foi configurado (segredo ausente).' };
  let r: Response;
  try {
    r = await fetch(`${N8N}/r4-diligencia-submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-r4-secret': segredo },
      body: JSON.stringify(corpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(110_000),
    });
  } catch (e) {
    return { ok: false, erro: `Motor não respondeu: ${(e as Error).message}` };
  }
  const txt = await r.text();
  let j: RespostaMotor | null = null;
  try {
    j = JSON.parse(txt);
  } catch {
    j = null;
  }
  if (!r.ok || !j?.ok) {
    if (r.status === 404) return { ok: false, erro: 'O fluxo do motor está desligado. Avise a administração do rquatro.' };
    return { ok: false, erro: j?.erro || `Motor respondeu ${r.status}` };
  }
  if (!j.id || !UUID_RE.test(j.id)) return { ok: false, erro: 'O motor não devolveu o número da diligência.' };
  return j;
}

// Linha de painel.v_painel_cliente_admin (só o que o rquatro usa).
export type CertidaoMotor = {
  certidao_id: string;
  tipo: string;
  titular: string | null;
  tipo_documento: 'imovel' | 'pf' | 'pj' | 'outro';
  documento_normalizado: string | null;
  documento_mascarado: string | null;
  pasta_id: string | null;
  certidao: string;
  situacao: string;
  resultado: string | null;
  data_emissao: string | null;
  emitida_em: string | null;
  observacao_ia: string | null;
  manual: boolean | null;
  drive_file_id: string | null;
  cs_status: string;
  card_oculto: boolean | null;
  titular_oculto: boolean | null;
};

/** Certidões de uma diligência do motor — só se ela for do rquatro. */
export async function certidoesDoMotor(motorId: string): Promise<CertidaoMotor[]> {
  if (!UUID_RE.test(motorId)) return [];
  const r = await pool.query(
    `SELECT v.certidao_id, v.tipo, v.titular, v.tipo_documento, v.documento_normalizado,
            v.documento_mascarado, v.pasta_id, v.certidao, v.situacao, v.resultado,
            v.data_emissao, v.emitida_em, v.observacao_ia, v.manual, v.drive_file_id,
            v.cs_status, v.card_oculto, v.titular_oculto
       FROM painel.v_painel_cliente_admin v
       JOIN diligencias d ON d.id = v.diligencia_id
      WHERE v.diligencia_id = $1
        AND d.dados_completos ->> 'origem' = 'rquatro'
      ORDER BY v.titular NULLS FIRST, v.certidao`,
    [motorId]
  );
  return (r.rows as CertidaoMotor[]).filter(
    (c) => !c.card_oculto && !c.titular_oculto && c.cs_status !== 'cancelada'
  );
}

/**
 * Todas as linhas da tela de gestão (painel.v_painel_cliente_admin), inclusive
 * cards e pessoas ocultos (a unidade decide o que o cliente vê). Só diligência
 * do rquatro; certidões canceladas ficam de fora.
 */
export async function linhasAdminDoMotor<T = Record<string, unknown>>(motorId: string): Promise<T[]> {
  if (!UUID_RE.test(motorId)) return [];
  const r = await pool.query(
    `SELECT v.*
       FROM painel.v_painel_cliente_admin v
       JOIN diligencias d ON d.id = v.diligencia_id
      WHERE v.diligencia_id = $1
        AND d.dados_completos ->> 'origem' = 'rquatro'
        AND COALESCE(v.cs_status, '') <> 'cancelada'
      ORDER BY v.titular NULLS FIRST, v.certidao`,
    [motorId]
  );
  return r.rows as T[];
}

export type ResumoMotor = { total: number; prontas: number; andamento: number; atencao: number };

/** Contadores por diligência do motor (lista do rquatro). */
export async function resumoDoMotor(motorIds: string[]): Promise<Map<string, ResumoMotor>> {
  const ids = motorIds.filter((x) => UUID_RE.test(x));
  const out = new Map<string, ResumoMotor>();
  if (!ids.length) return out;
  const r = await pool.query(
    `SELECT cs.diligencia_id::text AS id,
            count(*) FILTER (WHERE NOT COALESCE(cs.manual, false)) AS total,
            count(*) FILTER (WHERE NOT COALESCE(cs.manual, false) AND cs.status IN ('concluido', 'com_pendencias') AND cs.drive_file_id IS NOT NULL) AS prontas,
            count(*) FILTER (WHERE NOT COALESCE(cs.manual, false) AND cs.status IN ('pendente', 'em_processamento', 'aguardando_email', 'aguardando_match', 'erro_infosimples', 'aguardando_origem')) AS andamento,
            count(*) FILTER (WHERE cs.validacao_status = 'divergencia' OR cs.status = 'com_pendencias') AS atencao
       FROM certidoes_status cs
       JOIN diligencias d ON d.id = cs.diligencia_id
      WHERE cs.diligencia_id = ANY($1::uuid[])
        AND d.dados_completos ->> 'origem' = 'rquatro'
        AND cs.status <> 'cancelada'
        AND NOT COALESCE(cs.oculta_cliente, false)
      GROUP BY cs.diligencia_id`,
    [ids]
  );
  for (const x of r.rows as { id: string; total: string; prontas: string; andamento: string; atencao: string }[]) {
    out.set(x.id, {
      total: Number(x.total),
      prontas: Number(x.prontas),
      andamento: Number(x.andamento),
      atencao: Number(x.atencao),
    });
  }
  return out;
}

/** Certidão que o sistema emitiu (entra na cobrança): automática, com PDF. */
export function emitidaPeloSistema(c: CertidaoMotor) {
  return !c.manual && !!c.drive_file_id && (c.cs_status === 'concluido' || c.cs_status === 'com_pendencias');
}

/** Mês de competência (1º dia) de uma data. */
function competencia(iso: string | null): string {
  const q = iso ? new Date(iso) : new Date();
  const d = isNaN(q.getTime()) ? new Date() : q;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Registra no rquatro as certidões emitidas pelo sistema que ainda não foram
 * cobradas. A chave é (certidão, arquivo do Drive): cada PDF novo que o sistema
 * emite para a mesma certidão (reemissão) é cobrado de novo; ver a mesma
 * certidão de novo não duplica. Arquivos que a própria unidade enviou ou
 * vinculou já entram antes com preço 0 (registrarSemCobranca) e não são cobrados.
 * Preço congelado na hora (tabela precos; '*' é o padrão).
 */
export async function registrarCobranca(
  dil: { id: string; unidade_id: string },
  certidoes: CertidaoMotor[]
): Promise<number> {
  const emitidas = certidoes.filter(emitidaPeloSistema);
  if (!emitidas.length) return 0;
  const adm = r4Admin();
  const [{ data: precos }, { data: jaTem }] = await Promise.all([
    adm.from('precos').select('tipo,preco,cobravel'),
    adm
      .from('certidoes_cobradas')
      .select('certidao_motor_id,drive_file_id')
      .in('certidao_motor_id', emitidas.map((c) => c.certidao_id)),
  ]);
  const registrados = new Set((jaTem || []).map((x) => `${x.certidao_motor_id}|${x.drive_file_id}`));
  const comAlgum = new Set((jaTem || []).map((x) => x.certidao_motor_id as string));
  const tabela = new Map((precos || []).map((p) => [p.tipo as string, p as { preco: number; cobravel: boolean }]));
  const padrao = tabela.get('*');
  const linhas = [];
  for (const c of emitidas) {
    if (registrados.has(`${c.certidao_id}|${c.drive_file_id}`)) continue;
    const p = tabela.get(c.tipo) || padrao;
    if (!p || !p.cobravel) continue;
    linhas.push({
      certidao_motor_id: c.certidao_id,
      drive_file_id: c.drive_file_id,
      origem: comAlgum.has(c.certidao_id) ? 'reemissao' : 'sistema',
      diligencia_id: dil.id,
      unidade_id: dil.unidade_id,
      tipo: c.tipo,
      titular: c.titular,
      preco: Number(p.preco),
      emitida_em: c.emitida_em,
      competencia: competencia(c.emitida_em),
    });
  }
  if (!linhas.length) return 0;
  const { error } = await adm
    .from('certidoes_cobradas')
    .upsert(linhas, { onConflict: 'certidao_motor_id,drive_file_id', ignoreDuplicates: true });
  if (error) console.error('[r4 registrarCobranca]', error.message);
  return linhas.length;
}

/**
 * Arquivo que a UNIDADE pôs no card (envio do computador ou "Vincular PDF"):
 * fica registrado com preço 0, para não ser cobrado como emissão do sistema.
 */
export async function registrarSemCobranca(
  dil: { id: string; unidade_id: string },
  c: { certidao_id: string; tipo: string; titular: string | null },
  driveFileId: string
): Promise<void> {
  if (!driveFileId) return;
  const { error } = await r4Admin()
    .from('certidoes_cobradas')
    .upsert(
      {
        certidao_motor_id: c.certidao_id,
        drive_file_id: driveFileId,
        origem: 'unidade',
        diligencia_id: dil.id,
        unidade_id: dil.unidade_id,
        tipo: c.tipo,
        titular: c.titular,
        preco: 0,
        emitida_em: new Date().toISOString(),
        competencia: competencia(null),
      },
      { onConflict: 'certidao_motor_id,drive_file_id', ignoreDuplicates: true }
    );
  if (error) console.error('[r4 registrarSemCobranca]', error.message);
}

/**
 * E-mail da conta de serviço que o painel usa para LER o Drive (listar PDFs da
 * pasta, juntar o PDF das certidões). Não é segredo; vem do JSON da credencial.
 */
export function emailLeitorDrive(): string | null {
  try {
    const j = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS_JSON || '{}') as { client_email?: string };
    return j.client_email && /@/.test(j.client_email) ? j.client_email : null;
  } catch {
    return null;
  }
}

export type VerificacaoPasta = {
  ok: boolean;
  nome?: string;
  drive_compartilhado?: boolean;
  /** o motor deu leitura da pasta à conta do painel (para listar e juntar PDFs) */
  leitura?: boolean;
  erro?: string;
};

/**
 * Pergunta ao motor (fluxo R4-02) se a conta dele consegue criar arquivos na
 * pasta e, se sim, dá leitura da pasta à conta do painel (sem e-mail de aviso).
 */
export async function verificarPastaDrive(pasta: string): Promise<VerificacaoPasta> {
  const segredo = await segredoMotor();
  if (!segredo) return { ok: false, erro: 'O motor do rquatro ainda não foi configurado. Avise a administração do rquatro.' };
  try {
    const r = await fetch(`${N8N}/r4-verificar-pasta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-r4-secret': segredo },
      body: JSON.stringify({ pasta, leitor: emailLeitorDrive() }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => null)) as VerificacaoPasta | null;
    if (!j) return { ok: false, erro: `Não consegui conferir a pasta agora (${r.status}). Tente de novo.` };
    return j;
  } catch (e) {
    return { ok: false, erro: `Não consegui conferir a pasta agora: ${(e as Error).message}` };
  }
}
