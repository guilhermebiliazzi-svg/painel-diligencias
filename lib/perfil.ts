// Leitura do usuário logado + seu perfil/permissões. Memoizado por render.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export type Perfil = {
  email: string;
  nome: string | null;
  is_admin: boolean;
  ativo: boolean;
  pode_diligencias: boolean;
  pode_cobrancas: boolean;
  pode_repasse: boolean;
  pode_notas: boolean;
};

export type SessaoPerfil = {
  email: string | null;
  perfil: Perfil | null;
};

export const getSessaoPerfil = cache(async (): Promise<SessaoPerfil> => {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return { email: null, perfil: null };

  const { data } = await sb
    .from('perfis')
    .select(
      'email,nome,is_admin,ativo,pode_diligencias,pode_cobrancas,pode_repasse,pode_notas'
    )
    .eq('email', user.email.toLowerCase())
    .maybeSingle();

  return { email: user.email.toLowerCase(), perfil: (data as Perfil) ?? null };
});

// Exige login + perfil ativo. Sem login -> /login; sem perfil/ativo -> /sem-acesso.
export async function exigirPerfil(): Promise<Perfil> {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) redirect('/login');
  if (!perfil || !perfil.ativo) redirect('/sem-acesso');
  return perfil;
}

export async function exigirAdmin(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (!perfil.is_admin) redirect('/sem-acesso');
  return perfil;
}
