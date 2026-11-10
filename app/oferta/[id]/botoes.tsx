'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { responderOferta } from '../actions';

export default function Botoes({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; texto: string } | null>(null);
  async function responder(r: 'sim' | 'nao') { setOcupado(true); try { const x = await responderOferta(id, r); setRes(x); if (x.ok) router.refresh(); } finally { setOcupado(false); } }
  if (res) return <p className={`mt-6 whitespace-pre-line rounded-xl p-4 text-sm ${res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{res.texto}</p>;
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <button onClick={() => responder('sim')} disabled={ocupado} className="rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">Sim, assumo o lead</button>
      <button onClick={() => responder('nao')} disabled={ocupado} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Não posso agora</button>
    </div>
  );
}
