import { redirect } from 'next/navigation';
import { Marca } from '../_ui';
import { r4Base, r4Configurado, r4Server, r4UsuarioAtual } from '@/lib/r4/supabase';

export const metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

const ERROS: Record<string, string> = {
  credenciais: 'E-mail ou senha incorretos.',
  acesso: 'Seu acesso não está ativo. Fale com o administrador da sua unidade.',
  unidade: 'Sua unidade está desativada no rquatro.',
  config: 'O rquatro está em configuração. Tente novamente em alguns minutos.',
};

async function entrar(form: FormData) {
  'use server';
  const base = await r4Base();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const senha = String(form.get('senha') || '');
  if (!r4Configurado()) redirect(`${base}/login?erro=config`);
  if (!email || !senha) redirect(`${base}/login?erro=credenciais`);
  const sb = await r4Server();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) redirect(`${base}/login?erro=credenciais`);
  redirect(`${base}/`);
}

export default async function LoginR4({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const sp = await searchParams;
  const base = await r4Base();
  // com erro na URL, fica no login (evita ir e voltar quando a unidade está inativa)
  if (!sp?.erro && r4Configurado() && (await r4UsuarioAtual())) redirect(`${base}/`);
  const erro = sp?.erro ? ERROS[sp.erro] || 'Não foi possível entrar.' : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Marca tamanho="lg" />
          <p className="mt-2 text-sm text-slate-500">Ferramentas para unidades REMAX</p>
        </div>
        <form action={entrar} className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <h1 className="text-lg font-semibold">Entrar</h1>
          {erro && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}
          <label className="mt-5 block text-sm font-medium text-slate-700">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Senha
            <input
              name="senha"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button className="mt-6 w-full rounded-lg bg-[#0F1B2D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2c45]">
            Entrar
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">
          Acesso liberado pela administração do rquatro para unidades parceiras.
        </p>
      </div>
    </main>
  );
}
