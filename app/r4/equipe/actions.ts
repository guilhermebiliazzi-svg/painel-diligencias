'use server';

// rquatro — o responsável da unidade cadastra os corretores dela e escolhe as
// ferramentas de cada um (só entre as que a unidade tem).
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { r4Admin, r4UsuarioAtual } from '@/lib/r4/supabase';

export type ResultadoEquipe = { ok: boolean; msg: string; email?: string; senha?: string } | null;

const senhaProvisoria = () => randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + '!7';

/** Responsável ativo da unidade (ou erro). */
async function responsavel() {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo || u.papel !== 'admin' || !u.unidade_id || !u.unidade?.ativa) {
    throw new Error('Só o responsável da unidade pode gerenciar a equipe.');
  }
  return u;
}

/** Corretor da mesma unidade (nunca o próprio responsável nem outro admin). */
async function corretorDaUnidade(id: string, unidadeId: string) {
  const { data } = await r4Admin()
    .from('usuarios')
    .select('id,email,papel,unidade_id')
    .eq('id', id)
    .maybeSingle();
  if (!data || data.unidade_id !== unidadeId || data.papel !== 'corretor') throw new Error('Usuário não encontrado na sua equipe.');
  return data;
}

function ferramentasDoForm(form: FormData, daUnidade: string[]) {
  return form
    .getAll('ferramentas')
    .map(String)
    .filter((c) => daUnidade.includes(c));
}

export async function criarCorretor(_prev: ResultadoEquipe, form: FormData): Promise<ResultadoEquipe> {
  try {
    const u = await responsavel();
    const nome = String(form.get('nome') || '').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    if (!nome) return { ok: false, msg: 'Informe o nome.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: 'E-mail inválido.' };
    const ferramentas = ferramentasDoForm(form, u.ferramentas);

    const adm = r4Admin();
    const { data: ja } = await adm.from('usuarios').select('id').eq('email', email).maybeSingle();
    if (ja) return { ok: false, msg: 'Esse e-mail já tem acesso ao rquatro.' };

    const senha = senhaProvisoria();
    const { data: au, error: e1 } = await adm.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, trocar_senha: true },
    });
    if (e1 || !au?.user) return { ok: false, msg: `Não criei o acesso: ${e1?.message || 'erro'}` };
    const { error: e2 } = await adm
      .from('usuarios')
      .insert({ id: au.user.id, unidade_id: u.unidade_id, nome, email, papel: 'corretor' });
    if (e2) {
      await adm.auth.admin.deleteUser(au.user.id);
      return { ok: false, msg: `Não vinculei o acesso: ${e2.message}` };
    }
    if (ferramentas.length) {
      await adm.from('usuario_ferramentas').insert(ferramentas.map((f) => ({ usuario_id: au.user!.id, ferramenta: f })));
    }
    revalidatePath('/r4/equipe');
    return { ok: true, msg: `${nome} cadastrado(a).`, email, senha };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}

export async function salvarFerramentasCorretor(_prev: ResultadoEquipe, form: FormData): Promise<ResultadoEquipe> {
  try {
    const u = await responsavel();
    const id = String(form.get('usuario_id') || '');
    await corretorDaUnidade(id, u.unidade_id!);
    const ferramentas = ferramentasDoForm(form, u.ferramentas);
    const adm = r4Admin();
    // só mexe nas ferramentas que a unidade tem; as demais (se houver) ficam como estão
    await adm.from('usuario_ferramentas').delete().eq('usuario_id', id).in('ferramenta', u.ferramentas);
    if (ferramentas.length) {
      await adm.from('usuario_ferramentas').insert(ferramentas.map((f) => ({ usuario_id: id, ferramenta: f })));
    }
    revalidatePath('/r4/equipe');
    return { ok: true, msg: 'Acessos salvos.' };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}

export async function novaSenhaCorretor(_prev: ResultadoEquipe, form: FormData): Promise<ResultadoEquipe> {
  try {
    const u = await responsavel();
    const id = String(form.get('usuario_id') || '');
    const alvo = await corretorDaUnidade(id, u.unidade_id!);
    const adm = r4Admin();
    const senha = senhaProvisoria();
    const { data: cur } = await adm.auth.admin.getUserById(id);
    const { error } = await adm.auth.admin.updateUserById(id, {
      password: senha,
      user_metadata: { ...(cur?.user?.user_metadata || {}), trocar_senha: true },
    });
    if (error) return { ok: false, msg: error.message };
    return { ok: true, msg: 'Senha provisória gerada.', email: alvo.email, senha };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}

/** Liga/desliga o acesso de um corretor (desligado não entra mais). */
export async function alternarCorretor(form: FormData) {
  const u = await responsavel();
  const id = String(form.get('usuario_id') || '');
  await corretorDaUnidade(id, u.unidade_id!);
  const ativo = String(form.get('ativo') || '') === 'true';
  await r4Admin().from('usuarios').update({ ativo: !ativo }).eq('id', id);
  revalidatePath('/r4/equipe');
}
