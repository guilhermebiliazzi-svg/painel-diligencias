// 25/11/2026: lista do planejamento 2027 para o Guilherme (quem escolheu cada grupo e quem falta).
import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { GRUPOS, LOCAL } from '@/lib/planejamento';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planejamento 2027 — lista', robots: { index: false, follow: false } };

type Cor = { id: number; nome: string; status: string | null };
type Ag = { corretor_id: number; grupo: number; atualizado_em: string; lembrete_enviado_em: string | null };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default async function Lista() {
  await exigirAdmin();
  const sb = supabaseAdmin();
  const [{ data: cs }, { data: ags }] = await Promise.all([
    sb.from('corretores_associados').select('id,nome,status'),
    sb.from('planejamento_2027').select('corretor_id,grupo,atualizado_em,lembrete_enviado_em'),
  ]);
  const cors = new Map(((cs ?? []) as Cor[]).map((c) => [c.id, c]));
  const agenda = (ags ?? []) as Ag[];
  const marcou = new Set(agenda.map((a) => a.corretor_id));
  const nome = (id: number) => (cors.get(id)?.nome ?? '—').split(' - ')[0];
  const faltam = [...cors.values()].filter((c) => (c.status ?? 'ativo') === 'ativo' && !marcou.has(c.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Início</Link>
        <h1 className="text-2xl font-semibold text-slate-900">Planejamento 2027</h1>
        <p className="text-sm text-slate-600">
          {agenda.length} agendado(s). Link para os corretores: <strong>painel.villejardins.com.br/planejamento</strong>. Local: {LOCAL}.
          A Eva manda o lembrete na véspera às 18h.
        </p>
        {GRUPOS.map((g) => {
          const xs = agenda.filter((a) => a.grupo === g.n).sort((a, b) => nome(a.corretor_id).localeCompare(nome(b.corretor_id)));
          return (
            <section key={g.n} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">Grupo {g.n}</h2>
                <span className="text-sm text-slate-600">{g.rotulo} · {xs.length} corretor(es)</span>
              </div>
              {xs.length ? (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {xs.map((a) => (
                    <li key={a.corretor_id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                      <span className="text-slate-800">{nome(a.corretor_id)}</span>
                      <span className="text-xs text-slate-500">
                        marcou {fmt.format(new Date(a.atualizado_em))}{a.lembrete_enviado_em ? ' · lembrete enviado' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-slate-500">Ninguém ainda.</p>}
            </section>
          );
        })}
        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-base font-semibold text-slate-900">Ainda não escolheram ({faltam.length})</h2>
          <p className="mt-2 text-sm text-slate-700">{faltam.map((c) => c.nome.split(' - ')[0]).join(', ') || 'Todos já escolheram.'}</p>
        </section>
      </div>
    </main>
  );
}
