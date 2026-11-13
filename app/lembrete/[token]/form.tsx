'use client';

import { useState, useTransition } from 'react';
import { definirLembrete, type ResLembrete } from './actions';

const PRAZOS: [string, number][] = [['15 dias', 15], ['1 mês', 30], ['2 meses', 60], ['3 meses', 90]];
const isoSP = (dias: number) => new Date(Date.now() + dias * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);

export default function FormLembrete({ token }: { token: string }) {
  const [data, setData] = useState('');
  const [motivo, setMotivo] = useState('');
  const [res, setRes] = useState<ResLembrete | null>(null);
  const [pend, start] = useTransition();
  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
  if (res?.ok) return <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p>;
  return (
    <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); setRes(null); start(async () => setRes(await definirLembrete(token, data, motivo))); }}>
      <div className="flex flex-wrap gap-2">
        {PRAZOS.map(([r, d]) => (
          <button key={r} type="button" onClick={() => setData(isoSP(d))}
            className={`rounded-full border px-3 py-1.5 text-sm ${data === isoSP(d) ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700'}`}>{r}</button>
        ))}
      </div>
      <label className="block text-sm text-slate-700">Ou escolha a data
        <input type="date" required min={isoSP(1)} className={campo} value={data} onChange={(e) => setData(e.target.value)} />
      </label>
      <label className="block text-sm text-slate-700">Motivo <span className="text-slate-400">(opcional)</span>
        <input className={campo} maxLength={300} placeholder="Ex.: cliente pausou a busca até março" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      <button type="submit" disabled={pend || !data} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {pend ? 'Salvando…' : 'Marcar lembrete'}
      </button>
      {res && !res.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>}
    </form>
  );
}
