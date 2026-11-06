// Oficinas da loja. Todo corretor vê as suas (presenças, checklist de aplicação e
// material); o monitor gerencia a sua oficina; o administrador vê todas, as
// presenças esquecidas e o mapa por corretor.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  acessoOficinas, diaMonitor, nomeCurto, dataLonga, hojeSP, proximaData, semPresenca, progressoCorretores,
  type Oficina, type Monitor, type Material, type CheckItem,
} from '@/lib/oficinas';
import { marcarAplicacao } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Oficinas — REMAX Ville' };

const ERRO: Record<string, string> = {
  gravar: 'Não consegui gravar. Tente de novo.',
  'sem-presenca': 'Esse checklist abre depois que a sua presença na oficina for registrada.',
};
const CARD = 'rounded-2xl border border-slate-200 p-5 shadow-sm';

export default async function OficinasPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const sp = await searchParams;
  const a = await acessoOficinas();
  const sb = supabaseAdmin();
  const hoje = hojeSP();
  const [ofi, mon, pre, mat, its] = await Promise.all([
    sb.from('onb_oficinas').select('id,slug,nome,ordem').eq('ativa', true).order('ordem'),
    sb.from('onb_oficina_monitores').select('id,oficina_id,corretor_id,dia_semana,periodo'),
    sb.from('onb_oficina_presencas').select('oficina_id,data,corretor_id').order('data', { ascending: false }).limit(5000),
    sb.from('onb_oficina_materiais').select('id,oficina_id,publico,titulo,url').eq('publico', 'participante').order('id'),
    sb.from('onb_oficina_check_itens').select('id,oficina_id,publico,texto,ordem').eq('publico', 'participante').eq('ativo', true).order('ordem'),
  ]);
  const erro = ofi.error?.message || mon.error?.message || pre.error?.message || its.error?.message;

  const todas = (ofi.data ?? []) as Oficina[];
  const gerencio = todas.filter((o) => a.admin || a.minhas.includes(Number(o.id)));
  const monitores = (mon.data ?? []) as Monitor[];
  const presencas = (pre.data ?? []) as { oficina_id: number; data: string; corretor_id: number }[];
  const materiais = (mat.data ?? []) as Material[];
  const itens = (its.data ?? []) as CheckItem[];
  const ids = [...new Set(monitores.map((m) => Number(m.corretor_id)))];
  const nomes = new Map<number, string>();
  if (ids.length) {
    const { data } = await sb.from('corretores_associados').select('id,nome').in('id', ids);
    for (const c of (data ?? []) as { id: number; nome: string }[]) nomes.set(Number(c.id), nomeCurto(c.nome));
  }
  const doMon = (id: number) => monitores.filter((m) => Number(m.oficina_id) === id);
  const meu = a.meuId ? (await progressoCorretores([a.meuId])).get(a.meuId) : undefined;
  const feitas = meu ? todas.filter((o) => meu.presencas.has(Number(o.id))).length : 0;
  const pendentes = semPresenca(
    monitores.filter((m) => gerencio.some((o) => Number(o.id) === Number(m.oficina_id))),
    presencas,
    hoje,
  );
  const nomeOf = new Map(todas.map((o) => [Number(o.id), o]));

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Oficinas da loja</h1>
          {a.admin && (
            <Link href="/oficinas/mapa" className="text-sm font-medium text-blue-700 hover:underline">Mapa por corretor →</Link>
          )}
        </div>

        {erro && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Não consegui ler as oficinas ({erro}). {a.admin ? 'Rode o sql/2026-11_oficinas.sql no Supabase.' : 'Fale com o administrador.'}
          </p>
        )}
        {sp.erro && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{ERRO[sp.erro] ?? 'Algo deu errado.'}</p>}

        {/* Presenças esquecidas */}
        {pendentes.length > 0 && (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Encontros sem presença registrada</h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {pendentes.map((p) => {
                const o = nomeOf.get(p.oficina_id);
                return (
                  <li key={`${p.oficina_id}-${p.data}`}>
                    <Link href={`/oficinas/${o?.slug}`} className="font-medium underline-offset-2 hover:underline">{o?.nome}</Link>
                    {' · '}{dataLonga(p.data)}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-amber-800">Se a oficina não aconteceu nesse dia, ignore.</p>
          </section>
        )}

        {/* Minhas oficinas (como participante) */}
        {meu && (
          <section id="minhas" style={{ backgroundColor: '#ffffff' }} className={`${CARD} mt-6`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Minhas oficinas</h2>
              <span className={`text-sm font-medium ${feitas === todas.length && todas.length ? 'text-emerald-700' : 'text-slate-500'}`}>
                {feitas} de {todas.length} feitas
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              A presença é registrada pelo monitor. Depois de cada oficina, marque aqui o que você aplicou. Passar por todas é requisito para ser padrinho.
            </p>
            <ul className="mt-4 divide-y divide-slate-100">
              {todas.map((o) => {
                const datas = meu.presencas.get(Number(o.id)) ?? [];
                const prox = proximaData(doMon(Number(o.id)), hoje);
                const slot = doMon(Number(o.id)).find((m) => prox && m.dia_semana === new Date(prox + 'T12:00:00Z').getUTCDay());
                const meus = itens.filter((i) => Number(i.oficina_id) === Number(o.id));
                const mats = materiais.filter((m) => Number(m.oficina_id) === Number(o.id));
                return (
                  <li key={o.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{o.ordem}. {o.nome}</p>
                      {datas.length ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          feita em {dataLonga(datas[0])}{datas.length > 1 ? ` (+${datas.length - 1})` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {prox ? `próxima: ${dataLonga(prox)}${slot?.periodo ? ` à ${slot.periodo === 'manha' ? 'manhã' : 'tarde'}` : ''}` : 'data a definir'}
                        </span>
                      )}
                    </div>
                    {datas.length > 0 && meus.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {meus.map((i) => {
                          const on = meu.marcados.has(Number(i.id));
                          return (
                            <li key={i.id}>
                              <form action={marcarAplicacao}>
                                <input type="hidden" name="item_id" value={i.id} />
                                <button type="submit" className="flex items-start gap-2 text-left text-sm text-slate-700 hover:text-slate-900">
                                  <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                                    {on ? '✓' : ''}
                                  </span>
                                  <span className={on ? 'text-slate-500 line-through' : ''}>{i.texto}</span>
                                </button>
                              </form>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {mats.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {mats.map((m) => (
                          <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{m.titulo}</a>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Oficinas que a pessoa gerencia */}
        {gerencio.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">{a.admin ? 'Todas as oficinas' : 'Oficinas que você conduz'}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {gerencio.map((o) => {
                const ms = doMon(Number(o.id));
                const pres = presencas.filter((p) => Number(p.oficina_id) === Number(o.id));
                const encontros = new Set(pres.map((p) => p.data));
                const pessoas = new Set(pres.map((p) => Number(p.corretor_id)));
                const ultima = pres[0]?.data;
                return (
                  <Link
                    key={o.id}
                    href={`/oficinas/${o.slug}`}
                    style={{ backgroundColor: '#ffffff' }}
                    className="group rounded-2xl border border-slate-200 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Oficina {o.ordem}</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{o.nome}</h3>
                    <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
                      {ms.length === 0 && <li className="text-slate-400">Sem monitor definido</li>}
                      {ms
                        .sort((x, y) => (x.dia_semana ?? 9) - (y.dia_semana ?? 9))
                        .map((m) => (
                          <li key={m.id}>
                            <span className={Number(m.corretor_id) === a.meuId ? 'font-semibold text-slate-900' : ''}>
                              {nomes.get(Number(m.corretor_id)) ?? `#${m.corretor_id}`}
                            </span>{' '}
                            · {diaMonitor(m)}
                          </li>
                        ))}
                    </ul>
                    <p className="mt-3 text-xs text-slate-500">
                      {encontros.size} encontro{encontros.size === 1 ? '' : 's'} · {pessoas.size} participante{pessoas.size === 1 ? '' : 's'}
                      {ultima ? ` · último em ${dataLonga(ultima)}` : ''}
                    </p>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
