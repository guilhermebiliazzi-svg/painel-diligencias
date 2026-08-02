// Tela de login do painel interno. O controle de acesso em si é feito pelo
// proxy.ts (redireciona pra cá quem não tem sessão). Aqui só coletamos as
// credenciais e chamamos a Server Action.

import LoginForm from './login-form';

export const metadata = {
  title: 'Entrar — Painel RE/MAX Ville',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const next = typeof sp?.next === 'string' && sp.next.startsWith('/') ? sp.next : '/';

  return (
    <div
      style={{ backgroundColor: '#f8fafc' }}
      className="flex min-h-screen items-center justify-center px-4 py-12"
    >
      <div className="w-full max-w-sm">
        <div
          style={{ backgroundColor: '#ffffff' }}
          className="rounded-2xl border border-slate-200 p-8 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            RE/MAX Ville
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">
            Painel interno
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Entre com seu usuário e senha para continuar.
          </p>

          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Acesso restrito à equipe RE/MAX Ville — Jardins/Itaim, São Paulo
        </p>
      </div>
    </div>
  );
}
