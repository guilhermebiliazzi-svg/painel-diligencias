// Funil do SDR (Eva). Só admin. Lê a view public.v_painel_sdr_funil
// (uma linha por lead, sem telefone) com a role painel_looker.

import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Funil do SDR — REMAX Ville' };

type Lead = {
  id: string;
  created_at: string;
  nome: string | null;
  fonte: string;
  status: string;
  intencao: string | null;
  temperatura: string | null;
  endereco: string | null;
  valor: number | null;
  direto: boolean;
  respondeu: boolean;
  qualificado: boolean;
  cartao_enviado_em: string | null;
  atribuido_em: string | null;
  arquivado: boolean;
  motivo_arquivamento: string | null;
  corretor: string | null;
  visita_agendada: boolean;
  proposta: boolean;
  min_ate_cartao: number | null;
  min_ate_atribuicao: number | null;
};

const PERIODOS = [
  { k: '7', rotulo: '7 dias' },
  { k: '30', rotulo: '30 dias' },
  { k: '90', rotulo: '90 dias' },
  { k: 'tudo', rotulo: 'Tudo' },
] as const;

const STATUS_ROTULO: Record<string, string> = {
  direto: 'Direto ao gestor',
  atribuido: 'Atribuído',
  arquivado: 'Arquivado',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_guilherme: 'Aguardando você',
  em_cascata: 'Em cascata',
  qualificando: 'Qualificando',
};

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const fmtValor = (v: number | null) =>
  v == null ? '—' : v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => x != null && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}
function fmtMin(m: number | null) {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.round(h / 24)} dias`;
}

async function carregar(periodo: string): Promise<Lead[]> {
  const dias = periodo === 'tudo' ? null : Number(periodo);
  const { rows } = await pool.query<Lead>(
    `select * from public.v_painel_sdr_funil
      where ($1::int is null or created_at >= now() - make_interval(days => $1::int))
      order by created_at desc`,
    [dias]
  );
  return rows.map((r) => ({ ...r, valor: r.valor == null ? null : Number(r.valor) }));
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string | number; sub?: string }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function FunilSdr({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await exigirAdmin();
  const { d } = await searchParams;
  const periodo = PERIODOS.some((p) => p.k === d) ? (d as string) : '30';

  let leads: Lead[] = [];
  let erro: string | null = null;
  try {
    leads = await carregar(periodo);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  const total = leads.length;
  const diretos = leads.filter((l) => l.direto);
  const sdr = leads.filter((l) => !l.direto);
  const etapas = [
    { rotulo: 'Entraram no SDR', n: sdr.length },
    { rotulo: 'Responderam a Eva', n: sdr.filter((l) => l.respondeu).length },
    { rotulo: 'Qualificados', n: sdr.filter((l) => l.qualificado).length },
    { rotulo: 'Cartão enviado', n: sdr.filter((l) => l.cartao_enviado_em).length },
    { rotulo: 'Atribuídos a corretor', n: sdr.filter((l) => l.atribuido_em).length },
    { rotulo: 'Visita agendada', n: sdr.filter((l) => l.visita_agendada).length },
    { rotulo: 'Proposta', n: sdr.filter((l) => l.proposta).length },
  ];
  const topo = Math.max(etapas[0].n, 1);
  const arquivados = sdr.filter((l) => l.arquivado);
  const emAndamento = sdr.filter((l) => !l.arquivado && !l.atribuido_em);

  const porFonte = Object.values(
    leads.reduce<Record<string, { fonte: string; total: number; direto: number; sdr: number; atrib: number }>>((acc, l) => {
      const f = (acc[l.fonte] ??= { fonte: l.fonte, total: 0, direto: 0, sdr: 0, atrib: 0 });
      f.total++;
      if (l.direto) f.direto++; else { f.sdr++; if (l.atribuido_em) f.atrib++; }
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const porCorretor = Object.values(
    leads.filter((l) => l.corretor).reduce<Record<string, { nome: string; sdr: number; direto: number; visitas: number }>>((acc, l) => {
      const c = (acc[l.corretor!] ??= { nome: l.corretor!, sdr: 0, direto: 0, visitas: 0 });
      if (l.direto) c.direto++; else if (l.atribuido_em) c.sdr++;
      if (l.visita_agendada) c.visitas++;
      return acc;
    }, {})
  ).sort((a, b) => b.sdr + b.direto - (a.sdr + a.direto));

  const motivos = Object.entries(
    arquivados.reduce<Record<string, number>>((acc, l) => {
      const m = (l.motivo_arquivamento || 'sem motivo').replace(/\s*\(.*?\)\s*/g, ' ').trim();
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const medCartao = mediana(sdr.map((l) => l.min_ate_cartao!).filter((x) => x != null));
  const medAtrib = mediana(sdr.map((l) => l.min_ate_atribuicao!).filter((x) => x != null));

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">← Painel interno</Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Funil do SDR</h1>
            <p className="mt-1 text-sm text-slate-600">Leads que a Eva recebeu, qualificou e distribuiu.</p>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODOS.map((p) => (
              <Link
                key={p.k}
                href={`/sdr?d=${p.k}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${p.k === periodo ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {p.rotulo}
              </Link>
            ))}
          </nav>
        </header>

        {erro && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Não consegui ler os dados do SDR: {erro}
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi rotulo="Leads recebidos" valor={total} sub={`${diretos.length} direto ao gestor · ${sdr.length} no SDR`} />
          <Kpi rotulo="Atribuídos (SDR)" valor={etapas[4].n} sub={`${pct(etapas[4].n, sdr.length)}% dos que entraram no SDR`} />
          <Kpi rotulo="Em andamento" valor={emAndamento.length} sub={`${arquivados.length} arquivados`} />
          <Kpi rotulo="Tempo até atribuir" valor={fmtMin(medAtrib)} sub={`mediana · cartão em ${fmtMin(medCartao)}`} />
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Secao titulo="Funil (leads do SDR)">
              <ol className="space-y-3">
                {etapas.map((e, i) => (
                  <li key={e.rotulo}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-slate-700">{e.rotulo}</span>
                      <span className="tabular-nums text-slate-900">
                        <strong>{e.n}</strong>
                        {i > 0 && <span className="ml-2 text-xs text-slate-500">{pct(e.n, etapas[0].n)}%</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${Math.max((e.n / topo) * 100, e.n ? 2 : 0)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-slate-500">
                &quot;Responderam&quot; conta quem mandou mensagem à Eva depois de chegar. Leads da carteira Ville vão direto ao gestor e não entram no funil.
              </p>
            </Secao>
          </div>

          <div className="lg:col-span-2">
            <Secao titulo="Arquivados por motivo">
              {motivos.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum no período.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {motivos.map(([m, n]) => (
                    <li key={m} className="flex justify-between gap-3">
                      <span className="text-slate-700">{m}</span>
                      <span className="tabular-nums font-medium text-slate-900">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Secao titulo="Por fonte">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Fonte</th>
                  <th className="pb-2 text-right font-medium">Leads</th>
                  <th className="pb-2 text-right font-medium">Direto</th>
                  <th className="pb-2 text-right font-medium">SDR</th>
                  <th className="pb-2 text-right font-medium">Atrib.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {porFonte.map((f) => (
                  <tr key={f.fonte}>
                    <td className="py-1.5 text-slate-700">{f.fonte}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{f.total}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{f.direto}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{f.sdr}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{f.atrib}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>

          <Secao titulo="Por corretor">
            {porCorretor.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum lead atribuído no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-medium">Corretor</th>
                    <th className="pb-2 text-right font-medium">SDR</th>
                    <th className="pb-2 text-right font-medium">Direto</th>
                    <th className="pb-2 text-right font-medium">Visitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porCorretor.map((c) => (
                    <tr key={c.nome}>
                      <td className="py-1.5 text-slate-700">{c.nome}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{c.sdr}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{c.direto}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{c.visitas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Secao>
        </div>

        <div className="mt-4">
          <Secao titulo={`Leads do período (${total})`}>
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-medium">Chegou</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 font-medium">Fonte</th>
                    <th className="pb-2 font-medium">Imóvel</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Corretor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="whitespace-nowrap py-2 tabular-nums text-slate-600">{fmtData.format(new Date(l.created_at))}</td>
                      <td className="py-2 text-slate-900">
                        {l.nome || '—'}
                        {l.temperatura && <span className="ml-1 text-xs text-slate-500">· {l.temperatura}</span>}
                      </td>
                      <td className="py-2 text-slate-600">{l.fonte}</td>
                      <td className="py-2 text-slate-600">
                        {l.endereco || '—'}
                        {l.valor != null && <span className="block text-xs text-slate-500">{fmtValor(l.valor)}</span>}
                      </td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          l.status === 'atribuido' ? 'bg-emerald-100 text-emerald-700'
                            : l.status === 'arquivado' ? 'bg-slate-100 text-slate-600'
                            : l.status === 'direto' ? 'bg-violet-100 text-violet-700'
                            : 'bg-amber-100 text-amber-700'}`}>
                          {STATUS_ROTULO[l.status] ?? l.status}
                        </span>
                      </td>
                      <td className="py-2 text-slate-600">{l.corretor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-400">Dados do SDR da Eva · atualizados a cada acesso</footer>
      </main>
    </div>
  );
}
