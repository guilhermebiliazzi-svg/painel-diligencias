'use server';

// Usuários e perfis de acesso (só admin).
//  - Perfis nomeados (public.perfis_acesso): Administrador e Corretor (de sistema)
//    e os personalizados. Cada perfil define as telas e o alcance em Diligências e
//    no Funil do SDR.
//  - Cada pessoa (public.perfis) aponta para um perfil e guarda uma cópia das
//    regras dele (colunasDoPerfil). Mudou o perfil -> regrava todo mundo nele.

import { revalidatePath } from 'next/cache';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { colunasDoPerfil, TELAS, type RegrasPerfil } from '@/lib/acesso';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://painel.villejardins.com.br';

export type AcaoState = { ok?: boolean; erro?: string; aviso?: string } | undefined;

export type PerfilAcessoRow = {
  id: string;
  nome: string;
  descricao: string | null;
  admin: boolean;
  telas: string[];
  escopo_diligencias: 'todas' | 'proprias';
  escopo_sdr: 'todos' | 'proprio';
  sistema: string | null;
};

async function carregarPerfilAcesso(id: string): Promise<PerfilAcessoRow | null> {
  if (!id) return null;
  const { data } = await supabaseAdmin()
    .from('perfis_acesso')
    .select('id,nome,descricao,admin,telas,escopo_diligencias,escopo_sdr,sistema')
    .eq('id', id)
    .maybeSingle();
  return (data as PerfilAcessoRow | null) ?? null;
}

const regras = (pa: PerfilAcessoRow): RegrasPerfil => ({
  admin: pa.admin,
  telas: pa.telas ?? [],
  escopo_diligencias: pa.escopo_diligencias,
  escopo_sdr: pa.escopo_sdr,
});

// ---------- perfis de acesso ----------

export async function salvarPerfilAcesso(_prev: AcaoState, fd: FormData): Promise<AcaoState> {
  await exigirAdmin();
  const id = String(fd.get('id') || '').trim();
  const nome = String(fd.get('nome') || '').trim();
  const descricao = String(fd.get('descricao') || '').trim() || null;
  const permitidas = TELAS.filter((t) => !t.soAdmin).map((t) => t.chave as string);
  const telas = fd.getAll('telas').map(String).filter((t) => permitidas.includes(t));
  const escopo_diligencias = fd.get('escopo_diligencias') === 'proprias' ? 'proprias' : 'todas';
  const escopo_sdr = fd.get('escopo_sdr') === 'proprio' ? 'proprio' : 'todos';

  const sb = supabaseAdmin();
  const atual = id ? await carregarPerfilAcesso(id) : null;
  if (id && !atual) return { erro: 'Perfil não encontrado.' };
  if (atual?.admin) return { erro: 'O perfil Administrador vê tudo e não se edita.' };
  if (!atual && !nome) return { erro: 'Dê um nome ao perfil.' };
  if (!telas.length) return { erro: 'Marque pelo menos uma tela.' };

  const dados = {
    // perfis de sistema mantêm o nome
    ...(atual?.sistema ? {} : { nome }),
    descricao,
    telas,
    escopo_diligencias,
    escopo_sdr,
    atualizado_em: new Date().toISOString(),
  };
  let pa: PerfilAcessoRow | null;
  if (atual) {
    const { data, error } = await sb.from('perfis_acesso').update(dados).eq('id', id).select().single();
    if (error) return { erro: error.message.includes('duplicate') ? 'Já existe um perfil com esse nome.' : error.message };
    pa = data as PerfilAcessoRow;
  } else {
    const { data, error } = await sb.from('perfis_acesso').insert({ ...dados, nome, admin: false }).select().single();
    if (error) return { erro: error.message.includes('duplicate') ? 'Já existe um perfil com esse nome.' : error.message };
    pa = data as PerfilAcessoRow;
  }

  // todo mundo neste perfil passa a valer as regras novas
  const { error: e2, count } = await sb
    .from('perfis')
    .update(colunasDoPerfil(regras(pa!)), { count: 'exact' })
    .eq('perfil_acesso_id', pa!.id);
  revalidatePath('/usuarios');
  if (e2) return { ok: true, aviso: 'Perfil salvo, mas não consegui atualizar as pessoas: ' + e2.message };
  return { ok: true, aviso: atual && count ? `Perfil salvo — ${count} pessoa(s) atualizada(s).` : undefined };
}

export async function excluirPerfilAcesso(fd: FormData): Promise<void> {
  await exigirAdmin();
  const id = String(fd.get('id') || '');
  const pa = await carregarPerfilAcesso(id);
  if (!pa || pa.sistema) throw new Error('Este perfil não pode ser excluído.');
  const sb = supabaseAdmin();
  const { count } = await sb.from('perfis').select('email', { count: 'exact', head: true }).eq('perfil_acesso_id', id);
  if (count) throw new Error('Ainda há pessoas neste perfil. Troque o perfil delas antes.');
  await sb.from('perfis_acesso').delete().eq('id', id);
  revalidatePath('/usuarios');
}

// ---------- pessoas ----------

export async function convidarUsuario(_prev: AcaoState, fd: FormData): Promise<AcaoState> {
  await exigirAdmin();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const nome = String(fd.get('nome') || '').trim();
  if (!email || !email.includes('@')) return { erro: 'Informe um e-mail válido.' };
  const pa = await carregarPerfilAcesso(String(fd.get('perfil_acesso_id') || ''));
  if (!pa) return { erro: 'Escolha o perfil de acesso.' };

  const admin = supabaseAdmin();
  const { error: e1 } = await admin
    .from('perfis')
    .upsert({ email, nome: nome || null, ativo: true, perfil_acesso_id: pa.id, ...colunasDoPerfil(regras(pa)) }, { onConflict: 'email' });
  if (e1) return { erro: 'Falha ao salvar o perfil: ' + e1.message };

  const { error: e2 } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE}/auth/callback?next=/`,
  });

  revalidatePath('/usuarios');
  if (e2) {
    return { ok: true, aviso: 'Pessoa salva. O e-mail de convite não saiu agora (a conta pode já existir) — use "Reenviar convite" se precisar.' };
  }
  return { ok: true };
}

export async function salvarUsuario(fd: FormData): Promise<void> {
  const eu = await exigirAdmin();
  const email = String(fd.get('email') || '').toLowerCase();
  const ativo = fd.get('ativo') === 'on';
  const paId = String(fd.get('perfil_acesso_id') || '');
  const admin = supabaseAdmin();

  // "legado": a pessoa continua sem perfil, com as permissões antigas; só muda o ativo
  if (!paId || paId === 'legado') {
    if (email === eu.email && !ativo) throw new Error('Você não pode desativar o próprio acesso.');
    await admin.from('perfis').update({ ativo }).eq('email', email);
    revalidatePath('/usuarios');
    return;
  }
  const pa = await carregarPerfilAcesso(paId);
  if (!pa) throw new Error('Perfil não encontrado.');
  if (email === eu.email && (!ativo || !pa.admin)) {
    throw new Error('Você não pode remover o próprio acesso de administrador.');
  }
  await admin
    .from('perfis')
    .update({ ativo, perfil_acesso_id: pa.id, ...colunasDoPerfil(regras(pa)) })
    .eq('email', email);
  revalidatePath('/usuarios');
}

export async function reenviarConvite(fd: FormData): Promise<void> {
  await exigirAdmin();
  const email = String(fd.get('email') || '').toLowerCase();
  const admin = supabaseAdmin();
  await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${SITE}/auth/callback?next=/` });
}

export async function removerUsuario(fd: FormData): Promise<void> {
  const eu = await exigirAdmin();
  const email = String(fd.get('email') || '').toLowerCase();
  if (email === eu.email) throw new Error('Você não pode remover a si mesmo.');
  const admin = supabaseAdmin();
  await admin.from('perfis').delete().eq('email', email);
  revalidatePath('/usuarios');
}
