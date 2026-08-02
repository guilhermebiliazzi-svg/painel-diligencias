// Gestão de usuários (somente admin): convidar, ativar/desativar, permissões.
import Link from 'next/link';
import { exigirAdmin, type Perfil } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import UsuariosClient from './usuarios-client';

export const metadata = { title: 'Usuários — Painel RE/MAX Ville' };
export const dynamic = 'force-dynamic';

export default async function Usuarios() {
  const eu = await exigirAdmin();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('perfis')
    .select('email,nome,is_admin,ativo,pode_diligencias,pode_cobrancas,pode_repasse,pode_notas')
    .order('email');
  const lista = (data ?? []) as Perfil[];

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Usuários</h1>
        <p className="mt-1 text-sm text-slate-600">Conectado como {eu.email} (admin).</p>
        <UsuariosClient lista={lista} meuEmail={eu.email} />
      </main>
    </div>
  );
}
