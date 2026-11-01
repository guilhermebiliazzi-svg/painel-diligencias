'use client';

// Registro de presença: data, quem conduziu e os participantes (corretores cadastrados).
import { useMemo, useState } from 'react';
import { registrarPresenca } from '../actions';

type Opcao = { id: number; nome: string };

export default function Presenca({
  oficinaId, slug, hoje, corretores, monitores, escolherMonitor, jaNoDia,
}: {
  oficinaId: number; slug: string; hoje: string; corretores: Opcao[];
  monitores: Opcao[]; escolherMonitor: boolean; jaNoDia: Record<string, number[]>;
}) {
  const [busca, setBusca] = useState('');
  const [data, setData] = useState(hoje);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const ja = useMemo(() => new Set(jaNoDia[data] ?? []), [jaNoDia, data]);

  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return corretores.filter((c) => !q || norm(c.nome).includes(q));
  }, [busca, corretores]);

  function alternar(id: number) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <form action={registrarPresenca} className="space-y-4">
      <input type="hidden" name="oficina_id" value={oficinaId} />
      <input type="hidden" name="slug" value={slug} />
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="corretor" value={id} />
      ))}

      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500">Data da oficina</span>
          <input
            type="date"
            name="data"
            value={data}
            max={hoje}
            onChange={(e) => setData(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>
        {escolherMonitor && (
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-500">Quem conduziu</span>
            <select name="monitor_id" defaultValue={monitores[0]?.id ?? ''} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {monitores.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
              <option value="">Outro / não informado</option>
            </select>
          </label>
        )}
      </div>

      <div>
        <span className="block text-xs font-medium text-slate-500">Participantes</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar corretor pelo nome"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {lista.map((c) => {
            const registrado = ja.has(c.id);
            const on = marcados.has(c.id);
            return (
              <li key={c.id}>
                <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${registrado ? 'cursor-default text-slate-400' : 'hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    checked={registrado || on}
                    disabled={registrado}
                    onChange={() => alternar(c.id)}
                    className="size-4"
                  />
                  <span className="flex-1">{c.nome}</span>
                  {registrado && <span className="text-xs">já registrado nesta data</span>}
                </label>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nenhum corretor com esse nome.</li>}
        </ul>
      </div>

      <button
        type="submit"
        disabled={marcados.size === 0}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Registrar presença{marcados.size ? ` (${marcados.size})` : ''}
      </button>
    </form>
  );
}
