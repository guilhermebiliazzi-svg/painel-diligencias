'use server';

// Corretores ligados a uma diligência (quem a vê em "Minhas diligências").
// Só quem gerencia todas as diligências mexe nessa lista.
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { garantirGerirDiligencias } from '@/lib/diligencia-acesso';

export type CorretorLigado = { id: number; nome: string; origem: string };
export type CorretorOpcao = { id: number; nome: string };

const ORIGEM: Record<string, string> = {
  criou: 'criou a diligência',
  split: 'está no split',
  manual: 'incluído à mão',
  backfill: 'está no split',
};

export async function listarCorretoresDiligencia(
  diligenciaId: string
): Promise<{ ok: boolean; ligados: CorretorLigado[]; opcoes: CorretorOpcao[]; erro?: string }> {
  try {
    await garantirGerirDiligencias();
    const sb = supabaseAdmin();
    const [{ data: lig, error }, { data: cors }] = await Promise.all([
      sb.from('diligencia_corretores').select('corretor_id,origem').eq('diligencia_id', diligenciaId),
      sb.from('corretores_associados').select('id,nome,status').order('nome'),
    ]);
    if (error) throw new Error(error.message);
    const lista = (cors ?? []) as { id: number; nome: string; status: string | null }[];
    const nome = new Map(lista.map((c) => [c.id, c.nome]));
    const ligados = ((lig ?? []) as { corretor_id: number; origem: string | null }[]).map((l) => ({
      id: l.corretor_id,
      nome: nome.get(l.corretor_id) ?? `#${l.corretor_id}`,
      origem: ORIGEM[l.origem ?? ''] ?? (l.origem || ''),
    }));
    const jaLigados = new Set(ligados.map((l) => l.id));
    const opcoes = lista
      .filter((c) => c.status === 'ativo' && !jaLigados.has(c.id))
      .map((c) => ({ id: c.id, nome: c.nome }));
    return { ok: true, ligados, opcoes };
  } catch (e) {
    return { ok: false, ligados: [], opcoes: [], erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function ligarCorretor(diligenciaId: string, corretorId: number): Promise<{ ok: boolean; erro?: string }> {
  try {
    await garantirGerirDiligencias();
    const { error } = await supabaseAdmin()
      .from('diligencia_corretores')
      .upsert({ diligencia_id: diligenciaId, corretor_id: corretorId, origem: 'manual' }, { onConflict: 'diligencia_id,corretor_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/d/${diligenciaId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function desligarCorretor(diligenciaId: string, corretorId: number): Promise<{ ok: boolean; erro?: string }> {
  try {
    await garantirGerirDiligencias();
    const { error } = await supabaseAdmin()
      .from('diligencia_corretores')
      .delete()
      .eq('diligencia_id', diligenciaId)
      .eq('corretor_id', corretorId);
    if (error) throw new Error(error.message);
    revalidatePath(`/admin/d/${diligenciaId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
