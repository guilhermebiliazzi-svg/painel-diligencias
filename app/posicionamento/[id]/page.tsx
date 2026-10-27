// Posicionamento — editar um condomínio do mapa (ou excluí-lo).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirTela, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Condominio } from '@/lib/posicionamento';
import Ficha from '../ficha';
import { excluirCondominio } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Condomínio — Posicionamento — REMAX Ville' };

export default async function EditarCondominio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const perfil = await exigirTela('posicionamento');
  const { id } = await params;
  const { erro } = await searchParams;
  const admin = !!perfil.is_admin;
  const sb = supabaseAdmin();

  const { data } = await sb.from('posicionamento_condominios').select('*').eq('id', Number(id) || 0).maybeSingle();
  const c = data as Condominio | null;
  if (!c) notFound();
  const eu = await corretorDaPessoa(perfil.email);
  if (!admin && Number(c.corretor_id) !== eu?.id) redirect('/sem-acesso');

  const { data: regs } = await sb.from('posicionamento_condominios').select('regiao').eq('corretor_id', c.corretor_id).limit(2000);
  const regioes = [...new Set(((regs ?? []) as { regiao: string }[]).map((r) => r.regiao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  let corretores: { id: number; nome: string }[] | null = null;
  if (admin) {
    const { data: cors } = await sb.from('corretores_associados').select('id,nome').order('nome');
    corretores = ((cors ?? []) as { id: number; nome: string }[]).map((o) => ({ id: Number(o.id), nome: String(o.nome ?? '').split(' - ')[0] }));
  }

  const voltar = `/posicionamento?aba=mapa&reg=${encodeURIComponent(c.regiao)}${admin ? `&cor=${c.corretor_id}` : ''}`;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href={voltar} className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao mapa</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">{c.nome}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">{c.regiao}</p>
        {erro === 'obrigatorio' && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Preencha a região e o nome do condomínio.</p>}

        <Ficha c={c} regioes={regioes} regiaoPadrao={c.regiao} corretores={corretores} corretorPadrao={c.corretor_id} />

        <form action={excluirCondominio} style={{ backgroundColor: '#ffffff' }} className="mt-10 rounded-2xl border border-rose-200 p-5">
          <input type="hidden" name="id" value={c.id} />
          <h2 className="text-sm font-semibold text-rose-700">Excluir do mapa</h2>
          {erro === 'confirmar' && <p className="mt-2 text-xs text-rose-700">Marque a confirmação para excluir.</p>}
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="confirmar" value="sim" /> Quero excluir este condomínio do meu mapa
          </label>
          <button type="submit" className="mt-3 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
            Excluir
          </button>
        </form>
      </main>
    </div>
  );
}
