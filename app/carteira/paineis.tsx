'use client';

// 18/11: Carteira — blocos interativos da página do imóvel: checklist, agenda e avaliação.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { agendar, concluirAtividade, marcarChecklist, salvarAvaliacao, type Res } from './actions';
import { AGENDA, CHECKLIST, CLASSES, CRITERIOS, rotuloTipo } from '@/lib/carteira-tipos';

const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500';
const fmt = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function useAcao() {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [res, setRes] = useState<Res | null>(null);
  const rodar = (f: () => Promise<Res>, depois?: () => void) => {
    setRes(null);
    start(async () => {
      const r = await f();
      setRes(r);
      if (r.ok) { depois?.(); router.refresh(); }
    });
  };
  return { pend, res, rodar, setRes };
}

export function Checklist({ imovelId, feitos }: { imovelId: number; feitos: Record<string, { em: string; link: string | null }> }) {
  const { pend, res, rodar } = useAcao();
  const [abrir, setAbrir] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const n = CHECKLIST.filter((c) => feitos[c.k]).length;
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Checklist de comercialização</h2>
        <span className="text-sm font-semibold text-slate-600">{n}/{CHECKLIST.length}</span>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {CHECKLIST.map((c) => {
          const f = feitos[c.k];
          return (
            <li key={c.k} className="py-2">
              <div className="flex items-start gap-3">
                <button type="button" disabled={pend} aria-pressed={!!f}
                  onClick={() => (f ? rodar(() => marcarChecklist(imovelId, c.k, false, '', '')) : (setAbrir(abrir === c.k ? null : c.k), setLink('')))}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${f ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white text-transparent'}`}>
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${f ? 'text-slate-500 line-through decoration-slate-300' : 'font-medium text-slate-800'}`}>{c.t}</p>
                  {f ? (
                    <p className="text-xs text-slate-500">
                      feito em {new Date(f.em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      {f.link && <> · <a href={f.link} target="_blank" rel="noreferrer" className="text-blue-700 underline">abrir</a></>}
                    </p>
                  ) : c.dica ? <p className="text-xs text-slate-400">{c.dica}</p> : null}
                  {abrir === c.k && !f && (
                    <div className="mt-2 flex gap-2">
                      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="link (opcional): anúncio, post, vídeo" className={campo + ' mt-0'} />
                      <button type="button" disabled={pend} onClick={() => rodar(() => marcarChecklist(imovelId, c.k, true, link, ''), () => setAbrir(null))}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Feito</button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {res && !res.ok && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>}
    </section>
  );
}

export type AtivView = { id: number; tipo: string; quando: string | null; feito_em: string | null; nota: string | null };

export function Agenda({ imovelId, proximas, hoje }: { imovelId: number; proximas: AtivView[]; hoje: string }) {
  const { pend, res, rodar } = useAcao();
  const [tipo, setTipo] = useState('visita');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('10:00');
  const [nota, setNota] = useState('');
  const [jaFeito, setJaFeito] = useState(false);
  const limpar = () => { setData(''); setNota(''); setJaFeito(false); };
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Agenda do imóvel</h2>
      {proximas.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nada agendado.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {proximas.map((a) => {
            const passou = !!a.quando && a.quando < new Date().toISOString();
            return (
              <li key={a.id} className={`rounded-lg border px-3 py-2 ${passou ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{rotuloTipo(a.tipo)}</p>
                    <p className="text-xs text-slate-500">{a.quando ? fmt(a.quando) : ''}{a.nota ? ` · ${a.nota}` : ''}{passou ? ' · já passou: foi feito?' : ''}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" disabled={pend} onClick={() => rodar(() => concluirAtividade(a.id, 'feito', ''))} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">Feito</button>
                    <button type="button" disabled={pend} onClick={() => rodar(() => concluirAtividade(a.id, 'cancelar', ''))} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50">Cancelar</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">{jaFeito ? 'Registrar atividade feita' : 'Agendar atividade'}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_0.8fr]">
          <label className="col-span-2 text-xs font-semibold text-slate-600 sm:col-span-1">Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
              {AGENDA.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Dia
            <input type="date" value={data} min={jaFeito ? undefined : hoje} max={jaFeito ? hoje : undefined} onChange={(e) => setData(e.target.value)} className={campo} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Hora
            <input type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} className={campo} />
          </label>
        </div>
        <label className="mt-2 block text-xs font-semibold text-slate-600">{tipo === 'outro' ? 'O que é?' : 'Anotação (opcional)'}
          <input value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder={tipo === 'visita' ? 'ex.: cliente Ana, veio pelo Zap' : ''} className={campo} />
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={jaFeito} onChange={(e) => { setJaFeito(e.target.checked); setData(''); }} /> já aconteceu
          </label>
          <button type="button" disabled={pend || !data} onClick={() => rodar(() => agendar(imovelId, tipo, data, hora, nota, jaFeito), limpar)}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Salvando…' : jaFeito ? 'Registrar' : 'Agendar'}
          </button>
        </div>
      </div>
      {res && (res.ok ? res.msg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p> : <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>)}
    </section>
  );
}

export function Avaliacao({ imovelId, classe, notas, obs }: { imovelId: number; classe: string | null; notas: Record<string, number>; obs: string }) {
  const { pend, res, rodar } = useAcao();
  const [cl, setCl] = useState(classe ?? '');
  const [nt, setNt] = useState<Record<string, number>>(notas ?? {});
  const [ob, setOb] = useState(obs ?? '');
  const media = (() => { const v = Object.values(nt).filter((x) => x > 0); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).replace('.', ',') : null; })();
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Classificação e avaliação</h2>
        {media && <span className="text-sm font-semibold text-slate-600">média {media}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CLASSES.map((c) => (
          <button key={c.k} type="button" onClick={() => setCl(cl === c.k ? '' : c.k)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${cl === c.k ? c.cor + ' ring-2 ring-slate-400' : 'border border-slate-300 bg-white text-slate-600'}`}>{c.t}</button>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {CRITERIOS.map((c) => (
          <li key={c.k} className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-700">{c.t}</span>
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} de 5`} onClick={() => setNt({ ...nt, [c.k]: nt[c.k] === n ? 0 : n })}
                  className={`text-lg leading-none ${n <= (nt[c.k] ?? 0) ? 'text-amber-500' : 'text-slate-300'}`}>★</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <label className="mt-3 block text-xs font-semibold text-slate-600">Observações
        <textarea value={ob} maxLength={1000} rows={2} onChange={(e) => setOb(e.target.value)} placeholder="ex.: proprietário aceita negociar 5%; precisa pintura" className={campo} />
      </label>
      <button type="button" disabled={pend} onClick={() => rodar(() => salvarAvaliacao(imovelId, cl, nt, ob))}
        className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{pend ? 'Salvando…' : 'Salvar avaliação'}</button>
      {res && (res.ok ? <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p> : <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>)}
    </section>
  );
}
