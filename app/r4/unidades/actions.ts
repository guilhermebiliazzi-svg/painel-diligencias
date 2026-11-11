'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { r4Admin, r4UsuarioAtual } from '@/lib/r4/supabase';
import { idDaPastaDrive, verificarPastaDrive } from '@/lib/r4/motor';

export type Resultado = { ok: boolean; msg: string; email?: string; senha?: string };

const senhaProvisoria = () =>
  randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + '!7';

async function exigirSuper() {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo || u.papel !== 'superadmin') throw new Error('Só a administração do rquatro.');
}

/** Cria a unidade e o primeiro usuário (admin da unidade) com senha provisória. */
export async function criarUnidade(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    await exigirSuper();
    const nome = String(form.get('nome') || '').trim();
    const cnpj = String(form.get('cnpj') || '').replace(/\D/g, '') || null;
    const razao = String(form.get('razao_social') || '').trim() || null;
    const emailCob = String(form.get('email_cobranca') || '').trim().toLowerCase() || null;
    const adminNome = String(form.get('admin_nome') || '').trim();
    const adminEmail = String(form.get('admin_email') || '').trim().toLowerCase();
    const pastaTxt = String(form.get('pasta_drive') || '').trim();
    const ferramentas = form.getAll('ferramentas').map(String).filter(Boolean);
    const pasta = pastaTxt ? idDaPastaDrive(pastaTxt) : null;
    if (!nome) return { ok: false, msg: 'Informe o nome da unidade.' };
    if (pastaTxt && !pasta) return { ok: false, msg: 'Link da pasta do Google Drive inválido.' };
    if (cnpj && cnpj.length !== 14) return { ok: false, msg: 'CNPJ com 14 dígitos.' };
    if (!adminNome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return { ok: false, msg: 'Informe nome e e-mail válidos do responsável da unidade.' };
    }

    const adm = r4Admin();
    const { data: un, error: e1 } = await adm
      .from('unidades')
      .insert({ nome, cnpj, razao_social: razao, email_cobranca: emailCob, pasta_drive_id: pasta })
      .select('id')
      .single();
    if (e1 || !un) return { ok: false, msg: `Não criei a unidade: ${e1?.message || 'erro'}` };

    const senha = senhaProvisoria();
    const { data: au, error: e2 } = await adm.auth.admin.createUser({
      email: adminEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: adminNome, trocar_senha: true },
    });
    if (e2 || !au?.user) {
      await adm.from('unidades').delete().eq('id', un.id);
      return { ok: false, msg: `Não criei o usuário: ${e2?.message || 'erro'}` };
    }
    const { error: e3 } = await adm
      .from('usuarios')
      .insert({ id: au.user.id, unidade_id: un.id, nome: adminNome, email: adminEmail, papel: 'admin' });
    if (e3) {
      await adm.auth.admin.deleteUser(au.user.id);
      await adm.from('unidades').delete().eq('id', un.id);
      return { ok: false, msg: `Não vinculei o usuário: ${e3.message}` };
    }
    if (ferramentas.length) {
      await adm.from('unidade_ferramentas').insert(ferramentas.map((f) => ({ unidade_id: un.id, ferramenta: f })));
    }
    revalidatePath('/r4/unidades');
    return { ok: true, msg: `Unidade "${nome}" criada.`, email: adminEmail, senha };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}

/** Gera nova senha provisória para um usuário (ele troca no próximo acesso). */
export async function redefinirSenha(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    await exigirSuper();
    const id = String(form.get('usuario_id') || '');
    const adm = r4Admin();
    const { data: u } = await adm.from('usuarios').select('email').eq('id', id).maybeSingle();
    if (!u) return { ok: false, msg: 'Usuário não encontrado.' };
    const senha = senhaProvisoria();
    const { data: cur } = await adm.auth.admin.getUserById(id);
    const { error } = await adm.auth.admin.updateUserById(id, {
      password: senha,
      user_metadata: { ...(cur?.user?.user_metadata || {}), trocar_senha: true },
    });
    if (error) return { ok: false, msg: error.message };
    return { ok: true, msg: 'Senha provisória gerada.', email: u.email, senha };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}

/** Liga/desliga a unidade (desligada: ninguém dela entra). */
export async function alternarUnidade(form: FormData) {
  await exigirSuper();
  const id = String(form.get('unidade_id') || '');
  const ativa = String(form.get('ativa') || '') === 'true';
  await r4Admin().from('unidades').update({ ativa: !ativa }).eq('id', id);
  revalidatePath('/r4/unidades');
}

/** Grava (ou troca) a pasta do Google Drive onde as diligências da unidade são salvas. */
export async function salvarPastaDrive(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    await exigirSuper();
    const id = String(form.get('unidade_id') || '');
    const txt = String(form.get('pasta_drive') || '').trim();
    const pasta = txt ? idDaPastaDrive(txt) : null;
    if (txt && !pasta) return { ok: false, msg: 'Link da pasta do Google Drive inválido.' };
    let nome = '';
    if (pasta) {
      const v = await verificarPastaDrive(pasta);
      if (!v.ok) return { ok: false, msg: v.erro || 'Pasta sem acesso.' };
      nome = v.nome || '';
    }
    const { error } = await r4Admin().from('unidades').update({ pasta_drive_id: pasta }).eq('id', id);
    if (error) return { ok: false, msg: error.message };
    revalidatePath('/r4/unidades');
    return { ok: true, msg: pasta ? `Pasta "${nome}" conferida e salva.` : 'Pasta removida.' };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}

/** Ferramentas que a unidade pode usar (o responsável distribui entre os corretores). */
export async function salvarFerramentasUnidade(_prev: Resultado | null, form: FormData): Promise<Resultado> {
  try {
    await exigirSuper();
    const id = String(form.get('unidade_id') || '');
    const ferramentas = form.getAll('ferramentas').map(String).filter(Boolean);
    const adm = r4Admin();
    await adm.from('unidade_ferramentas').delete().eq('unidade_id', id);
    if (ferramentas.length) {
      const { error } = await adm.from('unidade_ferramentas').insert(ferramentas.map((f) => ({ unidade_id: id, ferramenta: f })));
      if (error) return { ok: false, msg: error.message };
    }
    revalidatePath('/r4/unidades');
    return { ok: true, msg: 'Ferramentas salvas.' };
  } catch (e) {
    return { ok: false, msg: String((e as Error).message || e) };
  }
}
