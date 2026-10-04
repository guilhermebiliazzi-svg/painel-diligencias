// Leitura do usuário logado + seu perfil/permissões. Memoizado por render.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

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
  // Postagens no Instagram (carrossel do imóvel). Corretores associados ganham
  // este acesso automaticamente ao entrar com o e-mail cadastrado.
  pode_postagens?: boolean;
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
    .select(COLUNAS + ',pode_captacao,pode_postagens')
    .eq('email', email)
    .maybeSingle();
  if (!error) {
    if (data) return { email, perfil: data as unknown as Perfil };
    return { email, perfil: await provisionarCorretor(email, user.user_metadata?.full_name) };
  }

  const { data: semNova } = await sb
    .from('perfis')
    .select(COLUNAS)
    .eq('email', email)
    .maybeSingle();
  return { email, perfil: (semNova as unknown as Perfil) ?? null };
});

// Corretor associado entrando pela primeira vez: cria o perfil na hora, só
// com a tela de Postagens. Quem não está em corretores_associados continua
// sem acesso (fica para o admin convidar).
async function provisionarCorretor(email: string, nomeGoogle?: string | null): Promise<Perfil | null> {
  try {
    const admin = supabaseAdmin();
    const { data: cor } = await admin
      .from('corretores_associados')
      .select('nome')
      .ilike('email', email)
      .eq('status', 'ativo')
      .limit(1)
      .maybeSingle();
    if (!cor) return null;
    const novo = {
      email,
      nome: (cor as { nome: string | null }).nome || nomeGoogle || null,
      ativo: true,
      is_admin: false,
      pode_diligencias: false,
      pode_cobrancas: false,
      pode_repasse: false,
      pode_notas: false,
      pode_pagamentos: false,
      pode_captacao: false,
      pode_postagens: true,
    };
    const { error } = await admin.from('perfis').upsert(novo, { onConflict: 'email', ignoreDuplicates: true });
    if (error) return null;
    return novo as Perfil;
  } catch {
    return null;
  }
}

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

// Postagens: admin ou quem tem pode_postagens (corretores associados).
export async function exigirPostagens(): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (!perfil.is_admin && !perfil.pode_postagens) redirect('/sem-acesso');
  return perfil;
}
