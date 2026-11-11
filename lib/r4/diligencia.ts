// rquatro — quem pode mexer em qual diligência / card. Só servidor.
//
// A diligência do rquatro (Supabase do rquatro) aponta para a diligência do
// motor (banco da Ville) por motor_id. Toda ação num card confere:
//   pessoa logada e ativa, com a ferramenta "diligencia"
//   -> diligência do rquatro da unidade dela (superadmin: qualquer uma)
//   -> card (certidoes_status) pertence à diligência do motor dessa diligência.
import { pool } from '@/lib/db';
import { r4Admin, r4UsuarioAtual, type R4Usuario } from '@/lib/r4/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DilR4 = { id: string; unidade_id: string; motor_id: string; titulo: string | null };

export type CardMotor = {
  id: string;
  diligencia_id: string; // id no motor
  tipo: string;
  titular: string | null;
  pasta_id: string | null;
  manual: boolean;
  is_extra: boolean;
  drive_file_id: string | null;
};

export class SemAcesso extends Error {}

async function usuarioComDiligencia(): Promise<R4Usuario> {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo) throw new SemAcesso('Sessão expirada. Entre de novo.');
  if (u.papel !== 'superadmin' && (!u.unidade || !u.unidade.ativa)) throw new SemAcesso('Unidade inativa.');
  if (!u.ferramentas.includes('diligencia')) throw new SemAcesso('Seu acesso não inclui a diligência.');
  return u;
}

/** Diligência do rquatro que a pessoa pode ver (null se não pode / não existe). */
export async function diligenciaDoUsuario(u: R4Usuario, id: string): Promise<DilR4 | null> {
  if (!UUID_RE.test(id)) return null;
  let q = r4Admin().from('diligencias').select('id,unidade_id,motor_id,titulo').eq('id', id);
  if (u.papel !== 'superadmin') q = q.eq('unidade_id', u.unidade_id);
  const { data } = await q.maybeSingle();
  if (!data || !data.motor_id) return null;
  return data as DilR4;
}

/** Pessoa logada + diligência do rquatro (lança SemAcesso). */
export async function exigirDiligenciaR4(id: string): Promise<{ usuario: R4Usuario; dil: DilR4 }> {
  const usuario = await usuarioComDiligencia();
  const dil = await diligenciaDoUsuario(usuario, id);
  if (!dil) throw new SemAcesso('Diligência não encontrada.');
  return { usuario, dil };
}

/** Pessoa logada + diligência + card do motor que pertence a ela (lança SemAcesso). */
export async function exigirCardR4(
  dilR4Id: string,
  certidaoId: string
): Promise<{ usuario: R4Usuario; dil: DilR4; card: CardMotor }> {
  const { usuario, dil } = await exigirDiligenciaR4(dilR4Id);
  if (!UUID_RE.test(certidaoId)) throw new SemAcesso('Card inválido.');
  const r = await pool.query(
    `SELECT cs.id::text AS id, cs.diligencia_id::text AS diligencia_id, cs.tipo, cs.titular, cs.pasta_id,
            COALESCE(cs.manual, false) AS manual, COALESCE(cs.is_extra, false) AS is_extra, cs.drive_file_id
       FROM certidoes_status cs
       JOIN diligencias d ON d.id = cs.diligencia_id
      WHERE cs.id = $1 AND cs.diligencia_id = $2 AND d.dados_completos ->> 'origem' = 'rquatro'`,
    [certidaoId, dil.motor_id]
  );
  const card = r.rows[0] as CardMotor | undefined;
  if (!card) throw new SemAcesso('Card não encontrado nesta diligência.');
  return { usuario, dil, card };
}

/**
 * Para a rota de envio de arquivo, que só recebe o id do card: acha a
 * diligência do rquatro pelo motor_id do card e confere a unidade.
 */
export async function exigirCardPeloId(certidaoId: string) {
  const usuario = await usuarioComDiligencia();
  if (!UUID_RE.test(certidaoId)) throw new SemAcesso('Card inválido.');
  const r = await pool.query(`SELECT diligencia_id::text AS motor_id FROM certidoes_status WHERE id = $1`, [certidaoId]);
  const motorId = (r.rows[0] as { motor_id?: string } | undefined)?.motor_id;
  if (!motorId) throw new SemAcesso('Card não encontrado.');
  let q = r4Admin().from('diligencias').select('id').eq('motor_id', motorId);
  if (usuario.papel !== 'superadmin') q = q.eq('unidade_id', usuario.unidade_id);
  const { data } = await q.maybeSingle();
  if (!data) throw new SemAcesso('Sem acesso a esta diligência.');
  return exigirCardR4(data.id as string, certidaoId);
}

/** Pastas do Drive desta diligência no motor (para conferir pasta de card extra). */
export async function pastasDaDiligencia(motorId: string): Promise<Set<string>> {
  const r = await pool.query(
    `SELECT DISTINCT pasta_id FROM certidoes_status WHERE diligencia_id = $1 AND pasta_id IS NOT NULL
     UNION SELECT pasta_drive_id FROM diligencias WHERE id = $1 AND pasta_drive_id IS NOT NULL`,
    [motorId]
  );
  return new Set((r.rows as { pasta_id: string }[]).map((x) => x.pasta_id));
}

/** Logo e nome da unidade (para a página do cliente e o PDF). */
export async function marcaDaUnidade(unidadeId: string): Promise<{ nome: string; logo_url: string | null }> {
  const { data } = await r4Admin().from('unidades').select('nome,logo_url').eq('id', unidadeId).maybeSingle();
  return { nome: (data?.nome as string) || 'REMAX', logo_url: (data?.logo_url as string | null) ?? null };
}

/** Baixa o logo (PNG/JPG) para pôr no PDF. null se não houver ou não der. */
export async function bytesDoLogo(url: string | null): Promise<{ bytes: Uint8Array; tipo: 'png' | 'jpg' } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    if (b[0] === 0x89 && b[1] === 0x50) return { bytes: b, tipo: 'png' };
    if (b[0] === 0xff && b[1] === 0xd8) return { bytes: b, tipo: 'jpg' };
    return null;
  } catch {
    return null;
  }
}
