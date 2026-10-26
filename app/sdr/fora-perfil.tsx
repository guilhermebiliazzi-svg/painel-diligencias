'use client';

// Botão "Arquivar" de um contato fora do perfil (lista do funil e tela do lead).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { arquivarForaPerfil, type Resultado } from './actions';

export default function ArquivarForaPerfil({ id }: { id: string }) {
  const router = useRouter();
  const [res, setRes] = useState<Resultado | null>(null);
  const [pend, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={pend}
        onClick={() => { setRes(null); start(async () => { const r = await arquivarForaPerfil(id); setRes(r); if (r.ok) router.refresh(); }); }}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {pend ? 'Arquivando…' : 'Arquivar'}
      </button>
      {res && !res.ok && <span className="text-xs text-red-700">{res.erro}</span>}
    </span>
  );
}
