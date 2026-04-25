// app/admin/page.tsx
// Lista todas as diligencias com contadores e busca.

import { pool } from '@/lib/db';
import Link from 'next/link';
import { logoutAction } from './actions';

type DiligenciaListRow = {
  diligencia_id: string;
  endereco: string;
  cliente_nome: string | null;
  criado_em: string;
  total_certidoes: number;
  concluidas: number;
  com_divergencia: number;
  em_andamento: number;
  com_pendencias: number;
  uploads_pendentes: number;
  percentual_concluido: number;
};

async function fetchDiligencias(busca?: string): Promise<DiligenciaListRow[]> {
  if (busca && busca.trim().length > 0) {
    const term = `%${busca.trim()}%`;
    const r = await pool.query(
      `SELECT * FROM painel.v_painel_admin
       WHERE endereco ILIKE $1 OR cliente_nome ILIKE $1
       ORDER BY criado_em DESC`,
      [term]
    );
    return r.rows;
  }
  const r = await pool.query(
    `SELECT * FROM painel.v_painel_admin ORDER BY criado_em DESC LIMIT 200`
  );
  return r.rows;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const busca = sp.q?.trim() ?? '';
  const diligencias = await fetchDiligencias(busca);

  // Totais agregados
  const tot = diligencias.reduce(
    (acc, d) => {
      acc.total += d.total_certidoes;
      acc.concluidas += d.concluidas;
      acc.alertas += d.com_divergencia;
      acc.uploads += d.uploads_pendentes;
      return acc;
    },
    { total: 0, concluidas: 0, alertas: 0, uploads: 0 }
  );

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              RE/MAX Ville — Painel admin
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
              Diligências
            </h1>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Sair
            </button>
          </form>
        </header>

        {/* Cards de resumo */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Resumo titulo="Diligências" valor={String(diligencias.length)} cor="slate" />
          <Resumo
            titulo="Certidões"
            valor={`${tot.concluidas}/${tot.total}`}
            sub={tot.total > 0 ? `${Math.round((tot.concluidas / tot.total) * 100)}% concluído` : undefined}
            cor="emerald"
          />
          <Resumo
            titulo="Alertas (divergência)"
            valor={String(tot.alertas)}
            cor={tot.alertas > 0 ? 'rose' : 'slate'}
          />
          <Resumo
            titulo="Uploads pendentes"
            valor={String(tot.uploads)}
            cor={tot.uploads > 0 ? 'amber' : 'slate'}
          />
        </section>

        {/* Busca */}
        <section className="mb-6">
          <form method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={busca}
              placeholder="Buscar por endereço ou cliente..."
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
            >
              Buscar
            </button>
            {busca && (
              <Link
                href="/admin"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </Link>
            )}
          </form>
        </section>

        {/* Lista de diligências */}
        <section className="space-y-2">
          {diligencias.length === 0 && (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Nenhuma diligência encontrada.
            </p>
          )}
          {diligencias.map((d) => (
            <Link
              key={d.diligencia_id}
              href={`/admin/d/${d.diligencia_id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {d.endereco}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {d.cliente_nome ?? 'Sem cliente'} · {formatDate(d.criado_em)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="text-slate-600">
                      <strong className="text-slate-900">{d.concluidas}</strong>/{d.total_certidoes} concluídas
                    </span>
                    {d.com_divergencia > 0 && (
                      <span className="font-medium text-rose-700">
                        {d.com_divergencia} divergência{d.com_divergencia > 1 ? 's' : ''}
                      </span>
                    )}
                    {d.uploads_pendentes > 0 && (
                      <span className="font-medium text-amber-700">
                        {d.uploads_pendentes} upload{d.uploads_pendentes > 1 ? 's' : ''} pendente{d.uploads_pendentes > 1 ? 's' : ''}
                      </span>
                    )}
                    {d.em_andamento > 0 && (
                      <span className="text-sky-700">
                        {d.em_andamento} em andamento
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <span className="text-lg font-semibold text-slate-900">
                      {d.percentual_concluido}%
                    </span>
                  </div>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${d.percentual_concluido}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  sub,
  cor,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  cor: 'slate' | 'emerald' | 'rose' | 'amber';
}) {
  const corMap = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    amber: 'text-amber-700',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${corMap[cor]}`}>{valor}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
