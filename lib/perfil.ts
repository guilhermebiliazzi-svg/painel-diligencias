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
  pode_pagamentos: boolean;
  // Opcional: a coluna entrou depois (migração 20/09). Enquanto ela não
  // existir no banco, vem undefined e só admin vê a captação.
  pode_captacao?: boolean;
};

export type SessaoPerfil = {
  email: string | null;
  perfil: Perfil | null;
};

const COLUNAS =
  'email,nome,is_admin,ativo,pode_diligencias,pode_cobrancas,pode_repasse,pode_notas,pode_pagamentos';

export const getSessaoPerfil = cache(async (): Promise<SessaoPerfil> => {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return { email: null, perfil: null };

  const email = user.email.toLowerCase();

  // pode_captacao entrou depois das outras. Se o deploy subir antes da migração
  // rodar, um select com a coluna inexistente volta erro e data vem null — o
  // que jogaria TODO mundo em /sem-acesso e derrubaria o painel inteiro. Por
  // isso a segunda tentativa sem ela: o painel continua de pé e a captação
  // fica só para admin até a coluna existir.
  const { data, error } = await sb
    .from('perfis')
    .select(COLUNAS + ',pode_captacao')
    .eq('email', email)
    .maybeSingle();
  if (!error) return { email, perfil: (data as unknown as Perfil) ?? null };

  const { data: semNova } = await sb
    .from('perfis')
    .select(COLUNAS)
    .eq('email', email)
    .maybeSingle();
  return { email, perfil: (semNova as unknown as Perfil) ?? null };
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
