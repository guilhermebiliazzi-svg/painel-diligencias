// rquatro — página PÚBLICA da diligência para o cliente (link "Compartilhar link").
// Mesmo desenho da página do cliente do painel da Ville, com o logo e o nome da
// UNIDADE (nada da REMAX Ville). Só mostra cards e pessoas visíveis ao cliente.
// Os PDFs abrem pela rota /api/r4/arquivo (a pasta do Drive não precisa ser pública).
import { notFound } from 'next/navigation';
import { pool } from '@/lib/db';
import { r4Admin } from '@/lib/r4/supabase';
import { marcaDaUnidade } from '@/lib/r4/diligencia';
import { agrupar, rotuloSituacao, SITUACOES_ATENCAO, type GroupTipo, type RowOrdem } from '@/lib/diligencia-ordem';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Linha = RowOrdem & {
  endereco: string;
  certidao: string | null;
  situacao: string;
  data_emissao: string | null;
  link_documento: string | null;
  observacao_ia: string | null;
};

async function carregar(id: string) {
  if (!UUID_RE.test(id)) return null;
  const { data: dil } = await r4Admin().from('diligencias').select('id,unidade_id,titulo,motor_id').eq('id', id).maybeSingle();
  if (!dil?.motor_id) return null;
  const r = await pool.query(
    `SELECT v.*, NULL::text AS pasta_id
       FROM painel.v_painel_cliente v
       JOIN diligencias d ON d.id = v.diligencia_id
      WHERE v.diligencia_id = $1 AND d.dados_completos ->> 'origem' = 'rquatro'
      ORDER BY v.titular NULLS FIRST, v.certidao`,
    [dil.motor_id]
  );
  const marca = await marcaDaUnidade(dil.unidade_id as string);
  return { dil, rows: r.rows as Linha[], marca };
}

type Estilo = { card: string; badge: string; dot: string };
const ESTILOS: Record<string, Estilo> = {
  Concluida: { card: 'border-emerald-200 bg-emerald-50/50', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  Positiva: { card: 'border-rose-300 bg-rose-50/60', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  'Em revisao': { card: 'border-amber-200 bg-amber-50/50', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  'Com pendencias': { card: 'border-amber-200 bg-amber-50/50', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  Processando: { card: 'border-sky-200 bg-sky-50/50', badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  'Em processamento': { card: 'border-sky-200 bg-sky-50/50', badge: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  Falhou: { card: 'border-red-300 bg-red-50', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  'Empresa extinta': { card: 'border-slate-400 bg-slate-100', badge: 'bg-slate-800 text-white', dot: 'bg-slate-300' },
};
const PADRAO: Estilo = { card: 'border-slate-200 bg-slate-50', badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };

function rotulo(s: string) {
  if (s === 'Em revisao') return 'Em conferência';
  if (s === 'Aguardando inicio') return 'Aguardando início';
  if (s === 'Concluida') return 'Concluída';
  if (s === 'Com pendencias') return 'Com pendências';
  return rotuloSituacao(s);
}

function dataBr(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function Icone({ tipo }: { tipo: GroupTipo }) {
  const c = 'flex size-10 shrink-0 items-center justify-center rounded-full';
  const svg = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      {d}
    </svg>
  );
  if (tipo === 'imovel')
    return <div className={`${c} bg-blue-100 text-blue-700`}>{svg(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>)}</div>;
  if (tipo === 'pj')
    return <div className={`${c} bg-violet-100 text-violet-700`}>{svg(<><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /></>)}</div>;
  return <div className={`${c} bg-teal-100 text-teal-700`}>{svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>)}</div>;
}

export default async function DiligenciaClienteR4({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await carregar(id);
  if (!d) notFound();
  const { rows, marca, dil } = d;
  const endereco = rows[0]?.endereco || (dil.titulo as string) || '';
  const total = rows.length;
  const concluidas = rows.filter((r) => r.situacao === 'Concluida').length;
  const alertas = rows.filter((r) => SITUACOES_ATENCAO.has(r.situacao)).length;
  const pct = total ? Math.round((concluidas / total) * 100) : 0;
  const grupos = agrupar(rows, endereco);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            {marca.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca.logo_url} alt={marca.nome} className="h-12 w-auto max-w-[180px] object-contain" />
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{marca.nome} — Diligência imobiliária</p>
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900 sm:text-3xl">{endereco}</h1>
        </header>

        {total === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">As certidões ainda estão sendo preparadas. Volte em instantes.</p>
        ) : (
          <>
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-slate-600">Progresso geral</h2>
                <span className="text-sm font-semibold text-slate-900">{concluidas} de {total}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{pct}% das certidões concluídas</span>
                {alertas > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
                    <span className="size-1.5 rounded-full bg-rose-500" />
                    {alertas} {alertas === 1 ? 'item requer' : 'itens requerem'} atenção
                  </span>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Documentos por titular</h2>
              {grupos.map((g) => {
                const concl = g.rows.filter((r) => r.situacao === 'Concluida').length;
                const atencao = g.rows.filter((r) => SITUACOES_ATENCAO.has(r.situacao)).length;
                return (
                  <details key={g.key} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 hover:bg-slate-50 sm:px-6">
                      <Icone tipo={g.tipo} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-slate-900">{g.titulo}</p>
                          {atencao > 0 && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                              {atencao} {atencao === 1 ? 'alerta' : 'alertas'}
                            </span>
                          )}
                        </div>
                        {g.subtitulo && <p className="truncate text-xs text-slate-500">{g.subtitulo}</p>}
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{concl}/{g.rows.length}</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </summary>
                    <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-5">
                      {g.rows.map((r) => {
                        const e = ESTILOS[r.situacao] ?? PADRAO;
                        return (
                          <div key={r.certidao_id} className={`flex flex-col gap-2 rounded-lg border p-3 ${e.card}`}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug text-slate-900">{r.certidao ?? r.tipo}</p>
                              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${e.badge}`}>
                                <span className={`size-1.5 rounded-full ${e.dot}`} />
                                {rotulo(r.situacao)}
                              </span>
                            </div>
                            {r.observacao_ia && SITUACOES_ATENCAO.has(r.situacao) && (
                              <p className="text-xs leading-snug text-slate-700">
                                <span className="font-semibold">⚠ Observação: </span>
                                {r.observacao_ia}
                              </p>
                            )}
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                              <span>{r.data_emissao ? `Emitida em ${dataBr(r.data_emissao)}` : ' '}</span>
                              {r.link_documento && (
                                <a
                                  href={`/api/r4/arquivo/${id}/${r.certidao_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 font-medium text-blue-600 hover:underline"
                                >
                                  Abrir documento →
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </section>
          </>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">{marca.nome}</footer>
      </main>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: 'Diligência' };
  const { data } = await r4Admin().from('diligencias').select('titulo,unidade_id').eq('id', id).maybeSingle();
  if (!data) return { title: 'Diligência' };
  const m = await marcaDaUnidade(data.unidade_id as string);
  return { title: { absolute: `${data.titulo || 'Diligência'} — ${m.nome}` } };
}
