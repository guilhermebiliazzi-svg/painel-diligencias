// 06/11: tela própria do recrutamento de corretores (perfil com a tela "Recrutamento de corretores",
// ex.: Jessica). Mesmo funil da aba Recrutamento do Funil do SDR, sem acesso ao resto do SDR.
import Link from 'next/link';
import { exigirRecrutamento } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { FunilRecrutamento } from './funil';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recrutamento de corretores — REMAX Ville' };

const PERIODOS = [
  { k: '7', rotulo: '7 dias' },
  { k: '30', rotulo: '30 dias' },
  { k: '90', rotulo: '90 dias' },
  { k: 'tudo', rotulo: 'Tudo' },
];

export default async function Recrutamento({ searchParams }: { searchParams: Promise<{ d?: string; a?: string }> }) {
  await exigirRecrutamento();
  const { d, a } = await searchParams;
  const periodo = PERIODOS.some((p) => p.k === d) ? (d as string) : '30';
  const dias = periodo === 'tudo' ? null : Number(periodo);
  const { data: cors } = await supabaseAdmin().from('corretores_associados').select('id,nome').eq('status', 'ativo').order('nome');
  const corretores = ((cors ?? []) as { id: number; nome: string }[]).map((x) => ({ id: x.id, nome: x.nome.split(' - ')[0] }));

  let conteudo: React.ReactNode = null;
  let erro: string | null = null;
  try {
    conteudo = await FunilRecrutamento({ dias, base: `/recrutamento?d=${periodo}`, aba: a ?? 'decidir', corretores });
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">← Painel interno</Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Recrutamento de corretores</h1>
            <p className="mt-1 text-sm text-slate-600">Candidatos da landing Seja REMAX e do WhatsApp da Eva.</p>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODOS.map((p) => (
              <Link key={p.k} href={`/recrutamento?d=${p.k}${a ? `&a=${a}` : ''}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${p.k === periodo ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {p.rotulo}
              </Link>
            ))}
          </nav>
        </header>
        {erro ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui ler os dados: {erro}</div>
        ) : conteudo}
      </main>
    </div>
  );
}
