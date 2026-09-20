// Captação — quem consta ligado a uma unidade. Exige login + perfil ativo, e
// permissão de captação (ou admin).
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirPerfil } from '@/lib/perfil';
import BuscaUnidade from './busca';

export const metadata = { title: 'Captação — Painel RE/MAX Ville' };
export const dynamic = 'force-dynamic';

export default async function Captacao() {
  const perfil = await exigirPerfil();
  if (!perfil.is_admin && !perfil.pode_captacao) redirect('/sem-acesso');

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Quem está na unidade</h1>
        <p className="mt-1 text-sm text-slate-600">
          Endereço e apartamento — para saber com quem falar antes de captar.
        </p>
        <BuscaUnidade />
      </main>
    </div>
  );
}
