// Uma oficina: registrar presença, encontros registrados (com o checklist do
// monitor), material de apoio e (só admin) os monitores.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  acessoOficinas, podeOficina, diaMonitor, nomeCurto, dataLonga, hojeSP, DIAS,
  type Oficina, type Monitor, type Material, type CheckItem,
} from '@/lib/oficinas';
import { removerPresenca, salvarMaterial, removerMaterial, salvarMonitor, removerMonitor, salvarChecklistEncontro } from '../actions';
import Presenca from './presenca';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Oficina — REMAX Ville' };

type SP = { ok?: string; erro?: string; n?: string };
type Linha = { id: number; data: string; corretor_id: number; monitor_id: number | null };

const OK: Record<string, string> = {
  presenca: 'Presença registrada.',
  material: 'Material adicionado.',
  monitor: 'Monitor salvo.',
  checklist: 'Checklist do encontro salvo.',
  removido: 'Removido.',
};
const ERRO: Record<string, string> = {
  data: 'Escolha uma data válida (hoje ou antes).',
  ninguem: 'Marque pelo menos um participante.',
  material: 'Preencha o título e um link que comece com http.',
  monitor: 'Escolha o corretor.',
  gravar: 'Não consegui gravar. Tente de novo.',
};

const CARD = 'rounded-2xl border border-slate-200 p-5 shadow-sm';
const BTN_X = 'rounded px-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700';

export default async function OficinaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await acessoOficinas();
  const sb = supabaseAdmin();

  const { data: o } = await sb.from('onb_oficinas').select('id,slug,nome,ordem').eq('slug', slug).maybeSingle();
  if (!o) notFound();
  const of = o as Oficina;
  if (!podeOficina(a, Number(of.id))) redirect('/sem-acesso');

  const [mon, pre, mat, cor, its, mar] = await Promise.all([
    sb.from('onb_oficina_monitores').select('id,oficina_id,corretor_id,dia_semana,periodo').eq('oficina_id', of.id),
    sb.from('onb_oficina_presencas').select('id,data,corretor_id,monitor_id').eq('oficina_id', of.id).order('data', { ascending: false }).limit(2000),
    sb.from('onb_oficina_materiais').select('id,oficina_id,publico,titulo,url').eq('oficina_id', of.id).order('id'),
    sb.from('corretores_associados').select('id,nome,status').order('nome'),
    sb.from('onb_oficina_check_itens').select('id,oficina_id,publico,texto,ordem').eq('oficina_id', of.id).eq('publico', 'monitor').eq('ativo', true).order('ordem'),
    sb.from('onb_oficina_check_marcas').select('item_id,data').eq('oficina_id', of.id).not('data', 'is', null).limit(5000),
  ]);
  const checklist = (its.data ?? []) as CheckItem[];
  const marcasDia = new Map<string, Set<number>>();
  for (const m of (mar.data ?? []) as { item_id: number; data: string }[]) {
    marcasDia.set(m.data, (marcasDia.get(m.data) ?? new Set()).add(Number(m.item_id)));
  }

  const monitores = ((mon.data ?? []) as Monitor[]).sort((x, y) => (x.dia_semana ?? 9) - (y.dia_semana ?? 9));
  const presencas = (pre.data ?? []) as Linha[];
  const materiais = (mat.data ?? []) as Material[];
  const todos = (cor.data ?? []) as { id: number; nome: string | null; status: string | null }[];
  const nome = new Map(todos.map((c) => [Number(c.id), nomeCurto(c.nome)]));
  const ativos = todos
    .filter((c) => (c.status ?? 'ativo') === 'ativo')
    .map((c) => ({ id: Number(c.id), nome: nomeCurto(c.nome) }))
    .filter((c) => c.nome)
    .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));

  // Encontros: agrupa por data
  const porData = new Map<string, Linha[]>();
  for (const p of presencas) porData.set(p.data, [...(porData.get(p.data) ?? []), p]);
  const jaNoDia: Record<string, number[]> = {};
  for (const [d, ls] of porData) jaNoDia[d] = ls.map((l) => Number(l.corretor_id));

  const ocultos = (
    <>
      <input type="hidden" name="oficina_id" value={of.id} />
      <input type="hidden" name="slug" value={of.slug} />
    </>
  );
  const msgOk = sp.ok && OK[sp.ok] ? (sp.ok === 'presenca' && sp.n ? `Presença registrada para ${sp.n} participante${sp.n === '1' ? '' : 's'}.` : OK[sp.ok]) : null;
  const msgErro = sp.erro ? ERRO[sp.erro] ?? 'Algo deu errado.' : null;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/oficinas" className="text-sm text-slate-500 hover:text-slate-800">← Oficinas</Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Oficina {of.ordem}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{of.nome}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {monitores.length
            ? monitores.map((m) => `${nome.get(Number(m.corretor_id)) ?? '#' + m.corretor_id} (${diaMonitor(m)})`).join(' · ')
            : 'Sem monitor definido'}
        </p>

        {msgOk && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msgOk}</p>}
        {msgErro && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{msgErro}</p>}

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Presença */}
          <section style={{ backgroundColor: '#ffffff' }} className={`${CARD} lg:col-span-3`}>
            <h2 className="text-base font-semibold text-slate-900">Registrar presença</h2>
            <p className="mb-4 mt-0.5 text-xs text-slate-500">Marque os corretores que participaram da oficina na data.</p>
            <Presenca
              oficinaId={Number(of.id)}
              slug={of.slug}
              hoje={hojeSP()}
              corretores={ativos}
              escolherMonitor={a.admin}
              monitores={monitores.map((m) => ({ id: Number(m.corretor_id), nome: nome.get(Number(m.corretor_id)) ?? `#${m.corretor_id}` }))}
              jaNoDia={jaNoDia}
            />
          </section>

          {/* Material */}
          <section style={{ backgroundColor: '#ffffff' }} className={`${CARD} lg:col-span-2`}>
            <h2 className="text-base font-semibold text-slate-900">Material de apoio</h2>
            {(['monitor', 'participante'] as const).map((pub) => {
              const itens = materiais.filter((m) => m.publico === pub);
              return (
                <div key={pub} className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {pub === 'monitor' ? 'Para o monitor' : 'Para os participantes'}
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {itens.length === 0 && <li className="text-sm text-slate-400">Nenhum material ainda.</li>}
                    {itens.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-blue-700 underline-offset-2 hover:underline">
                          {m.titulo}
                        </a>
                        <form action={removerMaterial}>
                          {ocultos}
                          <input type="hidden" name="id" value={m.id} />
                          <button type="submit" className={BTN_X} title="Remover">×</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">+ Adicionar material</summary>
              <form action={salvarMaterial} className="mt-3 space-y-2">
                {ocultos}
                <input name="titulo" placeholder="Título (ex.: Slides da oficina)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                <input name="url" type="url" placeholder="Link (Google Drive, YouTube, PDF...)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                <select name="publico" defaultValue="participante" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="participante">Para os participantes</option>
                  <option value="monitor">Para o monitor</option>
                </select>
                <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900">Adicionar</button>
              </form>
            </details>
          </section>
        </div>

        {/* Encontros */}
        <section style={{ backgroundColor: '#ffffff' }} className={`${CARD} mt-6`}>
          <h2 className="text-base font-semibold text-slate-900">Encontros registrados</h2>
          {porData.size === 0 && <p className="mt-2 text-sm text-slate-500">Nenhuma presença registrada ainda.</p>}
          <ul className="mt-3 divide-y divide-slate-100">
            {[...porData.entries()].slice(0, 30).map(([d, ls]) => {
              const conduziu = [...new Set(ls.map((l) => l.monitor_id).filter((x): x is number => !!x))]
                .map((id) => nome.get(Number(id)) ?? `#${id}`)
                .join(', ');
              return (
                <li key={d} className="py-3">
                  <p className="text-sm font-medium text-slate-900">
                    {dataLonga(d)} · {ls.length} participante{ls.length === 1 ? '' : 's'}
                    {conduziu && <span className="font-normal text-slate-500"> · conduzida por {conduziu}</span>}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ls
                      .map((l) => ({ ...l, n: nome.get(Number(l.corretor_id)) ?? `#${l.corretor_id}` }))
                      .sort((x, y) => x.n.localeCompare(y.n, 'pt-BR'))
                      .map((l) => (
                        <form key={l.id} action={removerPresenca} className="flex items-center rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-xs text-slate-700">
                          {ocultos}
                          <input type="hidden" name="id" value={l.id} />
                          {l.n}
                          <button type="submit" className={`${BTN_X} ml-0.5`} title="Remover presença">×</button>
                        </form>
                      ))}
                  </div>
                  {checklist.length > 0 && (() => {
                    const feitos = marcasDia.get(d) ?? new Set<number>();
                    const n = checklist.filter((c) => feitos.has(Number(c.id))).length;
                    const ok = n === checklist.length;
                    return (
                      <details className="mt-2" open={!ok && d === porData.keys().next().value}>
                        <summary className={`cursor-pointer text-xs font-medium ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                          Checklist do encontro: {n}/{checklist.length}{ok ? ' ✓' : ''}
                        </summary>
                        <form action={salvarChecklistEncontro} className="mt-2 space-y-1.5">
                          {ocultos}
                          <input type="hidden" name="data" value={d} />
                          {checklist.map((c) => (
                            <label key={c.id} className="flex items-start gap-2 text-sm text-slate-700">
                              <input type="checkbox" name="item" value={c.id} defaultChecked={feitos.has(Number(c.id))} className="mt-0.5 size-4" />
                              <span>{c.texto}</span>
                            </label>
                          ))}
                          <button type="submit" className="mt-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">
                            Salvar checklist
                          </button>
                        </form>
                      </details>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Monitores (admin) */}
        {a.admin && (
          <section style={{ backgroundColor: '#ffffff' }} className={`${CARD} mt-6`}>
            <h2 className="text-base font-semibold text-slate-900">Monitores</h2>
            <p className="mt-0.5 text-xs text-slate-500">Cada monitor acessa só a sua oficina, entrando no painel com o e-mail do cadastro de corretor.</p>
            <ul className="mt-3 divide-y divide-slate-100">
              {monitores.length === 0 && <li className="py-2 text-sm text-slate-500">Nenhum monitor.</li>}
              {monitores.map((m) => (
                <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="flex-1">
                    <span className="font-medium text-slate-900">{nome.get(Number(m.corretor_id)) ?? `#${m.corretor_id}`}</span>
                    <span className="text-slate-500"> · {diaMonitor(m)}</span>
                  </span>
                  <form action={removerMonitor}>
                    {ocultos}
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className={BTN_X} title="Remover monitor">×</button>
                  </form>
                </li>
              ))}
            </ul>
            <form action={salvarMonitor} className="mt-4 flex flex-wrap items-end gap-2">
              {ocultos}
              <label className="text-sm">
                <span className="block text-xs font-medium text-slate-500">Corretor</span>
                <select name="corretor_id" required className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Escolha…</option>
                  {ativos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-slate-500">Dia</span>
                <select name="dia_semana" defaultValue="" className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">A definir</option>
                  {DIAS.slice(1).map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-slate-500">Período</span>
                <select name="periodo" defaultValue="" className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">—</option>
                  <option value="manha">manhã</option>
                  <option value="tarde">tarde</option>
                </select>
              </label>
              <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900">
                Salvar monitor
              </button>
            </form>
            <p className="mt-2 text-xs text-slate-500">Para mudar o dia de um monitor, salve de novo o mesmo corretor com o novo dia.</p>
          </section>
        )}
      </main>
    </div>
  );
}
