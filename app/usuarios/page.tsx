// Usuários e perfis de acesso (somente admin).
import Link from 'next/link';
import { exigirAdmin, type Perfil } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import UsuariosClient from './usuarios-client';
import type { PerfilAcessoRow } from './actions';

export const metadata = { title: 'Usuários e perfis — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

export default async function Usuarios() {
  const eu = await exigirAdmin();
  const sb = supabaseAdmin();
  const [{ data }, { data: pas, error: ePa }] = await Promise.all([
    sb
      .from('perfis')
      .select('email,nome,is_admin,ativo,pode_diligencias,pode_cobrancas,pode_repasse,pode_notas,pode_pagamentos,pode_captacao,pode_postagens,perfil_acesso_id,telas')
      .order('nome', { nullsFirst: false }),
    sb
      .from('perfis_acesso')
      .select('id,nome,descricao,admin,telas,escopo_diligencias,escopo_sdr,sistema')
      .order('criado_em'),
  ]);
  const lista = (data ?? []) as Perfil[];
  // Administrador e Corretor primeiro, depois os personalizados
  const ordem = (p: PerfilAcessoRow) => (p.sistema === 'admin' ? 0 : p.sistema === 'corretor' ? 1 : 2);
  const perfis = ((pas ?? []) as PerfilAcessoRow[]).sort((a, b) => ordem(a) - ordem(b));

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Usuários e perfis</h1>
        <p className="mt-1 text-sm text-slate-600">Conectado como {eu.email} (admin).</p>
        {ePa ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não consegui ler os perfis de acesso: {ePa.message}</p>
        ) : (
          <UsuariosClient lista={lista} perfis={perfis} meuEmail={eu.email} />
        )}
      </main>
    </div>
  );
}
