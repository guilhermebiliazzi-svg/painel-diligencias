'use server';

import { revalidatePath } from 'next/cache';
import { r4Admin, r4UsuarioAtual } from '@/lib/r4/supabase';
import { idDaPastaDrive, verificarPastaDrive } from '@/lib/r4/motor';

export type ResultadoPasta = { ok: boolean; msg: string } | null;

/** O responsável da unidade cola o link da pasta; o motor confere o acesso antes de salvar. */
export async function salvarMinhaPasta(_prev: ResultadoPasta, form: FormData): Promise<ResultadoPasta> {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo || u.papel !== 'admin' || !u.unidade_id || !u.unidade?.ativa) {
    return { ok: false, msg: 'Só o responsável da unidade pode alterar a pasta.' };
  }
  const txt = String(form.get('pasta_drive') || '').trim();
  const pasta = idDaPastaDrive(txt);
  if (!pasta) return { ok: false, msg: 'Cole o link da pasta do Google Drive (ele tem "/folders/" no meio).' };

  const v = await verificarPastaDrive(pasta);
  if (!v.ok) return { ok: false, msg: v.erro || 'Não consegui acessar a pasta.' };

  const { error } = await r4Admin().from('unidades').update({ pasta_drive_id: pasta }).eq('id', u.unidade_id);
  if (error) return { ok: false, msg: `Não consegui salvar: ${error.message}` };
  revalidatePath('/r4/minha-unidade');
  return { ok: true, msg: `Pasta "${v.nome || 'sem nome'}" conferida e salva. Já dá para iniciar diligências.` };
}
