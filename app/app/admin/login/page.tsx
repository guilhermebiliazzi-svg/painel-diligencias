// app/admin/login/page.tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

async function loginAction(formData: FormData) {
  'use server';
  const senha = formData.get('senha') as string;
  const next = (formData.get('next') as string) || '/admin';

  if (senha !== process.env.ADMIN_PASSWORD) {
    redirect('/admin/login?erro=1' + (next ? `&next=${encodeURIComponent(next)}` : ''));
  }

  const cookieStore = await cookies();
  cookieStore.set('admin_session', process.env.ADMIN_SESSION_TOKEN!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 horas
  });

  redirect(next);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const erro = sp.erro === '1';
  const next = sp.next || '/admin';

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            RE/MAX Ville
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Painel administrativo
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Acesso restrito. Informe a senha para continuar.
          </p>

          <form action={loginAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={next} />
            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-slate-700">
                Senha
              </label>
              <input
                id="senha"
                name="senha"
                type="password"
                autoFocus
                required
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {erro && (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Senha incorreta.
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
