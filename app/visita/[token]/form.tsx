'use client';

import { useState, useTransition } from 'react';
import { registrarVisita, type ResVisita } from './actions';

export type ImovelOpc = { id: string; rotulo: string };

export default function FormVisita({ token, imoveis }: { token: string; imoveis: ImovelOpc[] }) {
  const [imovel, setImovel] = useState(imoveis[0]?.id ?? '');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [res, setRes] = useState<ResVisita | null>(null);
  const [pend, start] = useTransition();
  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
  if (res?.ok) return <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p>;
  return (
    <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); setRes(null); start(async () => setRes(await registrarVisita(token, imovel, data, hora))); }}>
      <label className="block text-sm text-slate-700">Imóvel
        <select className={campo} value={imovel} onChange={(e) => setImovel(e.target.value)}>
          {imoveis.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-700">Dia
          <input type="date" required className={campo} value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="block text-sm text-slate-700">Hora
          <input type="time" required step={900} className={campo} value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
      </div>
      <button type="submit" disabled={pend || !imovel || !data || !hora} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {pend ? 'Registrando…' : 'Registrar visita'}
      </button>
      {res && !res.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>}
    </form>
  );
}
