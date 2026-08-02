import { logoutAction } from '../actions';

export const metadata = { title: 'Sem acesso — Painel RE/MAX Ville' };

export default function SemAcesso() {
  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="flex min-h-screen items-center justify-center px-4 py-12">
      <div style={{ backgroundColor: '#ffffff' }} className="w-full max-w-md rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">RE/MAX Ville</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Acesso não liberado</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Sua conta entrou, mas ainda não tem acesso ao painel. Peça ao administrador
          para liberar o seu e-mail.
        </p>
        <form action={logoutAction} className="mt-6">
          <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
