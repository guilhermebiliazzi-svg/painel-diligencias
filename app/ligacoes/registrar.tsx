'use client';

// Registrar uma ligação: resultado, próximo contato (sugerido pelo resultado) e anotação.
import { useState } from 'react';
import { registrarLigacao } from './actions';
import { RESULTADOS, somarDias, type Resultado } from '@/lib/ligacoes';

export default function Registrar({ id, hoje }: { id: number; hoje: string }) {
  const [res, setRes] = useState<Resultado | null>(null);
  const [prox, setProx] = useState('');

  function escolher(r: Resultado) {
    setRes(r);
    const dias = RESULTADOS.find((x) => x.chave === r)?.dias;
    setProx(dias == null ? '' : somarDias(hoje, dias));
  }

  return (
    <form action={registrarLigacao} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="resultado" value={res ?? ''} />
      <div className="flex flex-wrap gap-1.5">
        {RESULTADOS.map((r) => (
          <button
            key={r.chave}
            type="button"
            onClick={() => escolher(r.chave)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              res === r.chave ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {r.rotulo}
          </button>
        ))}
      </div>
      {res && (
        <>
          <label className="block text-sm">
            <span className="block text-xs font-medium text-slate-500">Próximo contato {res === 'v1_marcada' || res === 'nao_ligar' ? '(opcional)' : ''}</span>
            <input
              type="date"
              name="proximo_contato"
              value={prox}
              min={hoje}
              onChange={(e) => setProx(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </label>
          <textarea
            name="nota"
            rows={2}
            placeholder="Anotação (o que conversaram, melhor horário, quem decide...)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-800">
            Registrar ligação
          </button>
        </>
      )}
    </form>
  );
}
