'use client';

// Referenciar a captação para um corretor de outra unidade REMAX (fora da nossa região).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { referenciarCaptacao, type Resultado } from '../../actions';

export default function ReferenciarCaptacao({ id }: { id: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState({ corretor_nome: '', corretor_whatsapp: '', unidade: '', email: '', regiao: '' });
  const [res, setRes] = useState<Resultado | null>(null);
  const [pend, start] = useTransition();
  const campo = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Referenciar para outra unidade REMAX</h2>
          <p className="text-xs text-slate-500">Imóvel fora da nossa região: a Eva pede o aceite ao corretor (25% da perna da indicação).</p>
        </div>
        {!aberto && (
          <button type="button" onClick={() => setAberto(true)} className="rounded-lg border border-violet-300 px-3 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-50">
            Referenciar
          </button>
        )}
      </div>
      {aberto && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className={campo} placeholder="Nome do corretor" value={d.corretor_nome} onChange={set('corretor_nome')} />
          <input className={campo} placeholder="WhatsApp (DDD + número)" inputMode="tel" value={d.corretor_whatsapp} onChange={set('corretor_whatsapp')} />
          <input className={campo} placeholder="Unidade REMAX" value={d.unidade} onChange={set('unidade')} />
          <input className={campo} placeholder="E-mail (opcional)" type="email" value={d.email} onChange={set('email')} />
          <input className={campo + ' sm:col-span-2'} placeholder="Cidade / região do imóvel (vai na mensagem)" value={d.regiao} onChange={set('regiao')} />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" disabled={pend}
              onClick={() => { setRes(null); start(async () => { const r = await referenciarCaptacao(id, d); setRes(r); if (r.ok) { setAberto(false); router.refresh(); } }); }}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
              {pend ? 'Enviando…' : 'Enviar convite ao corretor'}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}
      {res && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{res.ok ? res.msg : res.erro}</p>}
    </section>
  );
}
