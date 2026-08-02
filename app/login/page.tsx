import GoogleButton from './google-button';

export const metadata = { title: 'Entrar — Painel RE/MAX Ville' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  const next = typeof sp?.next === 'string' && sp.next.startsWith('/') ? sp.next : '/';
  const erro = sp?.erro;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">RE/MAX Ville</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Painel interno</h1>
          <p className="mt-1 text-sm text-slate-600">Entre com sua conta Google autorizada.</p>
          {erro && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Não foi possível concluir o login. Tente novamente.
            </p>
          )}
          <GoogleButton next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Acesso restrito à equipe RE/MAX Ville — Jardins/Itaim, São Paulo
        </p>
      </div>
    </div>
  );
}
