// Quem pode ver/gerir cada diligência.
//
//  - Alcance "todas" (admin, jurídico...): vê e gerencia qualquer diligência.
//  - Alcance "proprias" (perfil Corretor): vê só as diligências ligadas ao seu
//    cadastro em corretores_associados (tabela diligencia_corretores) e só usa o
//    que é do dia a dia do corretor: ficha do negócio, enviar arquivo no card,
//    link do cliente e auditar. Emitir/reemitir, validar, vincular PDF, parecer,
//    CCV, cobrança, ocultar e arquivar ficam com quem tem alcance "todas".
//
// A senha única antiga (cookie admin_session) continua valendo como acesso total,
// igual ao proxy.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessaoPerfil, corretorDaPessoa, type Perfil } from '@/lib/perfil';
import { escopoDiligencias, podeTela } from '@/lib/acesso';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type AcessoDiligencias = {
  perfil: Perfil | null;
  // true = vê e gerencia todas
  todas: boolean;
  // corretor da pessoa (alcance "proprias")
  corretorId: number | null;
};

async function senhaAntigaValida(): Promise<boolean> {
  try {
    const tok = process.env.ADMIN_SESSION_TOKEN;
    const c = (await cookies()).get('admin_session');
    return !!(tok && c && c.value === tok);
  } catch {
    return false;
  }
}

export async function acessoDiligencias(): Promise<AcessoDiligencias | null> {
  const { perfil } = await getSessaoPerfil();
  if (perfil && perfil.ativo && podeTela(perfil, 'diligencias')) {
    if (escopoDiligencias(perfil) === 'todas') return { perfil, todas: true, corretorId: null };
    const cor = await corretorDaPessoa(perfil.email);
    return { perfil, todas: false, corretorId: cor?.id ?? null };
  }
  if (await senhaAntigaValida()) return { perfil: null, todas: true, corretorId: null };
  return null;
}

// Ids das diligências ligadas a um corretor.
export async function diligenciasDoCorretor(corretorId: number | null): Promise<string[]> {
  if (!corretorId) return [];
  const { data, error } = await supabaseAdmin()
    .from('diligencia_corretores')
    .select('diligencia_id')
    .eq('corretor_id', corretorId);
  if (error) {
    console.error('[diligenciasDoCorretor]', error.message);
    return [];
  }
  return (data ?? []).map((r) => String((r as { diligencia_id: string }).diligencia_id));
}

async function corretorLigado(diligenciaId: string, corretorId: number | null): Promise<boolean> {
  if (!corretorId || !diligenciaId) return false;
  const { data } = await supabaseAdmin()
    .from('diligencia_corretores')
    .select('corretor_id')
    .eq('diligencia_id', diligenciaId)
    .eq('corretor_id', corretorId)
    .limit(1);
  return !!data?.length;
}

// Para páginas: sem acesso -> /sem-acesso. Devolve se a pessoa pode gerir.
export async function exigirVerDiligencia(diligenciaId: string): Promise<{ gerir: boolean; acesso: AcessoDiligencias }> {
  const a = await acessoDiligencias();
  if (!a) redirect('/sem-acesso');
  if (a.todas) return { gerir: true, acesso: a };
  if (!(await corretorLigado(diligenciaId, a.corretorId))) redirect('/sem-acesso');
  return { gerir: false, acesso: a };
}

// Para server actions e rotas: lança erro (não redireciona).
export async function podeVerDiligencia(diligenciaId: string): Promise<boolean> {
  const a = await acessoDiligencias();
  if (!a) return false;
  return a.todas || (await corretorLigado(diligenciaId, a.corretorId));
}

export async function garantirVerDiligencia(diligenciaId: string): Promise<void> {
  if (!(await podeVerDiligencia(diligenciaId))) throw new Error('Sem acesso a esta diligência.');
}

export async function garantirGerirDiligencias(): Promise<void> {
  const a = await acessoDiligencias();
  if (!a || !a.todas) throw new Error('Esta ação é só para quem gerencia todas as diligências.');
}

// ---------- ligação diligência <-> corretor ----------

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');

type CorretorCad = { id: number; nome: string | null; creci: string | null; cpf: string | null };

// Casa os credores do split da comissão com o cadastro de corretores: CRECI (só
// pessoa física — CRECI terminado em J é de empresa), CPF ou nome igual (o nome
// do cadastro sem o sufixo " - Equipe").
export function corretoresDoSplit(split: unknown, cadastro: CorretorCad[]): number[] {
  const lista = Array.isArray(split) ? (split as Record<string, unknown>[]) : [];
  const out = new Set<number>();
  for (const s of lista) {
    const credor = norm(s.credor);
    const creci = dig(s.creci);
    const doc = dig(s.documento);
    for (const c of cadastro) {
      const cCreci = /j\s*$/i.test(String(c.creci ?? '')) ? '' : dig(c.creci);
      const cNome = norm(String(c.nome ?? '').split(' - ')[0]);
      if (
        (creci.length >= 5 && cCreci === creci) ||
        (doc.length === 11 && dig(c.cpf) === doc) ||
        (credor && cNome && cNome === credor)
      )
        out.add(c.id);
    }
  }
  return [...out];
}

// Liga à diligência os corretores que aparecem no split. Não remove ninguém
// (quem foi ligado à mão ou criou a diligência continua).
export async function ligarCorretoresDoSplit(diligenciaId: string, split: unknown): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from('corretores_associados').select('id,nome,creci,cpf');
    const ids = corretoresDoSplit(split, (data ?? []) as CorretorCad[]);
    if (!ids.length) return;
    await sb
      .from('diligencia_corretores')
      .upsert(
        ids.map((corretor_id) => ({ diligencia_id: diligenciaId, corretor_id, origem: 'split' })),
        { onConflict: 'diligencia_id,corretor_id', ignoreDuplicates: true }
      );
  } catch (e) {
    console.error('[ligarCorretoresDoSplit]', e);
  }
}
