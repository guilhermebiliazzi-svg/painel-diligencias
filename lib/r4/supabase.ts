// rquatro — clientes do Supabase PRÓPRIO do rquatro (projeto ktzgxzzuqbixcxwguepq).
// Nada aqui toca o Supabase da Ville. As variáveis são só de servidor:
//   R4_SUPABASE_ANON_KEY (publishable), R4_SUPABASE_SERVICE_ROLE_KEY (secret); R4_SUPABASE_URL opcional.
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

// A URL do projeto não é segredo; a variável é opcional.
export const R4_URL = process.env.R4_SUPABASE_URL || 'https://ktzgxzzuqbixcxwguepq.supabase.co';

export function r4Configurado() {
  return !!(process.env.R4_SUPABASE_ANON_KEY && process.env.R4_SUPABASE_SERVICE_ROLE_KEY);
}

/** Cliente com a sessão do usuário (cookies). Usar em páginas, actions e rotas. */
export async function r4Server() {
  const jar = await cookies();
  return createServerClient(R4_URL, process.env.R4_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(list: CookieParaGravar[]) {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Server Component não grava cookie; o proxy renova a sessão.
        }
      },
    },
  });
}

/** Cliente com a secret key — SOMENTE no servidor. Ignora RLS. */
export function r4Admin() {
  return createClient(R4_URL, process.env.R4_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Prefixo dos links. No domínio rquatro.com.br as rotas não têm /r4 (o proxy
 * reescreve); no domínio do painel (testes) elas ficam em /r4.
 */
export async function r4Base() {
  const h = await headers();
  if (h.get('x-r4-host') === '1') return '';
  const host = (h.get('x-forwarded-host') || h.get('host') || '').split(':')[0].toLowerCase();
  return host === 'rquatro.com.br' || host.endsWith('.rquatro.com.br') ? '' : '/r4';
}

export type R4Usuario = {
  id: string;
  email: string;
  nome: string | null;
  papel: 'superadmin' | 'admin' | 'corretor';
  unidade_id: string | null;
  ativo: boolean;
  trocar_senha: boolean;
  unidade: { id: string; nome: string; ativa: boolean; logo_url: string | null } | null;
  /** ferramentas que a pessoa pode usar (superadmin: todas; responsável: as da unidade;
   *  corretor: as marcadas para ele que a unidade também tem) */
  ferramentas: string[];
};

/** Ferramentas efetivas de um usuário. */
async function ferramentasDe(
  adm: ReturnType<typeof r4Admin>,
  u: { id: string; papel: string; unidade_id: string | null }
): Promise<string[]> {
  const { data: ativas } = await adm.from('ferramentas').select('codigo').eq('ativa', true);
  const todas = (ativas || []).map((f) => f.codigo as string);
  if (u.papel === 'superadmin') return todas;
  if (!u.unidade_id) return [];
  const { data: un } = await adm.from('unidade_ferramentas').select('ferramenta').eq('unidade_id', u.unidade_id);
  const daUnidade = (un || []).map((f) => f.ferramenta as string).filter((c) => todas.includes(c));
  if (u.papel === 'admin') return daUnidade;
  const { data: us } = await adm.from('usuario_ferramentas').select('ferramenta').eq('usuario_id', u.id);
  const minhas = new Set((us || []).map((f) => f.ferramenta as string));
  return daUnidade.filter((c) => minhas.has(c));
}

/** Usuário logado + unidade. null se não há sessão ou não está cadastrado. */
export async function r4UsuarioAtual(): Promise<R4Usuario | null> {
  if (!r4Configurado()) return null;
  const sb = await r4Server();
  const { data } = await sb.auth.getUser();
  const user = data?.user;
  if (!user) return null;
  const adm = r4Admin();
  const { data: u } = await adm
    .from('usuarios')
    .select('id,email,nome,papel,unidade_id,ativo,unidades(id,nome,ativa,logo_url)')
    .eq('id', user.id)
    .maybeSingle();
  if (!u) return null;
  const unidade = (Array.isArray(u.unidades) ? u.unidades[0] : u.unidades) ?? null;
  return {
    id: u.id,
    email: u.email,
    nome: u.nome,
    papel: u.papel,
    unidade_id: u.unidade_id,
    ativo: u.ativo,
    trocar_senha: !!user.user_metadata?.trocar_senha,
    unidade: unidade as R4Usuario['unidade'],
    ferramentas: await ferramentasDe(adm, { id: u.id, papel: u.papel, unidade_id: u.unidade_id }),
  };
}

/**
 * Exige login válido (usuário ativo, unidade ativa). Redireciona para o login,
 * para a troca de senha obrigatória ou para "sem acesso".
 */
export async function exigirR4(
  opcoes: { papel?: 'superadmin' | 'admin'; permitirTrocaSenha?: boolean; ferramenta?: string } = {}
) {
  const base = await r4Base();
  if (!r4Configurado()) redirect(`${base}/login?erro=config`);
  const sb = await r4Server();
  const { data } = await sb.auth.getUser();
  if (!data?.user) redirect(`${base}/login`);
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo) redirect(`${base}/login?erro=acesso`);
  if (u.papel !== 'superadmin' && (!u.unidade || !u.unidade.ativa)) redirect(`${base}/login?erro=unidade`);
  if (u.trocar_senha && !opcoes.permitirTrocaSenha) redirect(`${base}/senha`);
  if (opcoes.papel === 'superadmin' && u.papel !== 'superadmin') redirect(`${base}/`);
  if (opcoes.papel === 'admin' && !(u.papel === 'admin' || u.papel === 'superadmin')) redirect(`${base}/`);
  if (opcoes.ferramenta && !u.ferramentas.includes(opcoes.ferramenta)) redirect(`${base}/?sem=ferramenta`);
  return { usuario: u, base };
}
