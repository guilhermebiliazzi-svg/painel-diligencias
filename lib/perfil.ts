// Leitura do usuário logado + seu perfil/permissões. Memoizado por render.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { podeTela, escopoDiligencias, escopoSdr, colunasDoPerfil, type Tela, type RegrasPerfil } from '@/lib/acesso';

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
  // Perfis de acesso (out/2026). Cópia das regras do perfil nomeado; null em
  // linha antiga, que segue pelas flags acima.
  perfil_acesso_id?: string | null;
  telas?: string[] | null;
  escopo_diligencias?: string | null;
  escopo_sdr?: string | null;
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
    .select(COLUNAS + ',pode_captacao,pode_postagens,perfil_acesso_id,telas,escopo_diligencias,escopo_sdr')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    // colunas dos perfis de acesso ainda não existem: segue como antes
    const r2 = await sb.from('perfis').select(COLUNAS + ',pode_captacao,pode_postagens').eq('email', email).maybeSingle();
    if (!r2.error) {
      if (r2.data) return { email, perfil: r2.data as unknown as Perfil };
      return { email, perfil: await provisionarCorretor(email, user.user_metadata?.full_name) };
    }
  }
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
    const base = {
      email,
      nome: (cor as { nome: string | null }).nome || nomeGoogle || null,
      ativo: true,
    };
    // Perfil "Corretor" (perfis_acesso.sistema = 'corretor'). Sem a tabela,
    // cai no acesso antigo: só Postagens.
    const { data: pa } = await admin
      .from('perfis_acesso')
      .select('id,admin,telas,escopo_diligencias,escopo_sdr')
      .eq('sistema', 'corretor')
      .maybeSingle();
    const novo = pa
      ? { ...base, perfil_acesso_id: (pa as { id: string }).id, ...colunasDoPerfil(pa as unknown as RegrasPerfil) }
      : {
          ...base,
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

// Postagens: admin ou quem tem a tela Postagens (corretores associados).
export async function exigirPostagens(): Promise<Perfil> {
  return exigirTela('postagens');
}

// Exige acesso a uma tela do catálogo (lib/acesso.ts).
export async function exigirTela(tela: Tela): Promise<Perfil> {
  const perfil = await exigirPerfil();
  if (!podeTela(perfil, tela)) redirect('/sem-acesso');
  return perfil;
}

export { podeTela, escopoDiligencias, escopoSdr };

// Corretor associado ligado ao e-mail da pessoa (para "minhas diligências" e
// "meu funil"). Casa por e-mail, sem diferenciar maiúsculas.
export type CorretorDaPessoa = { id: number; nome: string; phone: string | null };
export const corretorDaPessoa = cache(async (email: string): Promise<CorretorDaPessoa | null> => {
  if (!email) return null;
  const { data } = await supabaseAdmin()
    .from('corretores_associados')
    .select('id,nome,phone')
    .ilike('email', email)
    .order('status', { ascending: true }) // 'ativo' antes de 'inativo'
    .limit(1)
    .maybeSingle();
  return (data as CorretorDaPessoa | null) ?? null;
});

// Gestão do SDR (definir fila, descartar, referenciar, abrir o lead): quem tem a
// tela do SDR com alcance "todos". Quem vê só o próprio funil não gerencia.
export async function exigirSdrGestao(): Promise<Perfil> {
  const perfil = await exigirTela('sdr');
  if (escopoSdr(perfil) !== 'todos') redirect('/sem-acesso');
  return perfil;
}
