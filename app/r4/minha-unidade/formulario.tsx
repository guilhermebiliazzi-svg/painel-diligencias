'use client';

import { useActionState } from 'react';
import { salvarMinhaPasta } from './actions';

export function FormularioPasta({ atual }: { atual: string | null }) {
  const [r, acao, enviando] = useActionState(salvarMinhaPasta, null);
  return (
    <form action={acao} className="mt-4">
      <label className="block text-sm font-medium text-slate-700">
        Link da pasta
        <input
          name="pasta_drive"
          required
          defaultValue={atual ? `https://drive.google.com/drive/folders/${atual}` : ''}
          placeholder="https://drive.google.com/drive/folders/…"
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </label>
      <button
        disabled={enviando}
        className="mt-3 rounded-lg bg-[#0F1B2D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-60"
      >
        {enviando ? 'Conferindo o acesso…' : atual ? 'Trocar pasta' : 'Conferir e salvar'}
      </button>
      {r && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${r.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {r.msg}
        </p>
      )}
    </form>
  );
}
