// Gestão de usuários (admin). Placeholder protegido — a versão completa
// (convidar, ativar/desativar, permissões) entra no próximo passo.
import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';

export const metadata = { title: 'Usuários — Painel RE/MAX Ville' };

export default async function Usuarios() {
  const admin = await exigirAdmin();
  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Usuários</h1>
        <p className="mt-1 text-sm text-slate-600">Conectado como {admin.email} (admin).</p>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Gestão de usuários em construção: convidar por e-mail, ativar/desativar
          e definir permissões por tela. Chega no próximo passo.
        </div>
      </main>
    </div>
  );
}
