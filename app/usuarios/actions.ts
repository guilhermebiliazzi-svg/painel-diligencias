'use server';

import { revalidatePath } from 'next/cache';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://painel.villejardins.com.br';

export type AcaoState = { ok?: boolean; erro?: string; aviso?: string } | undefined;

function lerPermissoes(fd: FormData) {
  return {
    pode_diligencias: fd.get('pode_diligencias') === 'on',
    pode_cobrancas: fd.get('pode_cobrancas') === 'on',
    pode_repasse: fd.get('pode_repasse') === 'on',
    pode_notas: fd.get('pode_notas') === 'on',
  };
}

// Convidar: cria/atualiza o perfil (allowlist) e dispara o e-mail de convite.
// Não mexe em is_admin (preserva se a pessoa já for admin).
export async function convidarUsuario(_prev: AcaoState, fd: FormData): Promise<AcaoState> {
  await exigirAdmin();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const nome = String(fd.get('nome') || '').trim();
  if (!email || !email.includes('@')) return { erro: 'Informe um e-mail válido.' };

  const admin = supabaseAdmin();
  const { error: e1 } = await admin
    .from('perfis')
    .upsert({ email, nome: nome || null, ativo: true, ...lerPermissoes(fd) }, { onConflict: 'email' });
  if (e1) return { erro: 'Falha ao salvar o perfil: ' + e1.message };

  const { error: e2 } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE}/auth/callback?next=/`,
  });

  revalidatePath('/usuarios');
  if (e2) {
    return {
      ok: true,
      aviso:
        'Perfil salvo. O e-mail de convite não saiu agora (a conta pode já existir) — use "Reenviar convite" se precisar.',
    };
  }
  return { ok: true };
}

export async function salvarUsuario(fd: FormData): Promise<void> {
  const eu = await exigirAdmin();
  const email = String(fd.get('email') || '').toLowerCase();
  const ativo = fd.get('ativo') === 'on';
  const is_admin = fd.get('is_admin') === 'on';

  // Trava anti-lockout: você não pode se desativar nem tirar o próprio admin.
  if (email === eu.email && (!ativo || !is_admin)) {
    throw new Error('Você não pode remover o próprio acesso de admin.');
  }

  const admin = supabaseAdmin();
  await admin.from('perfis').update({ ativo, is_admin, ...lerPermissoes(fd) }).eq('email', email);
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
