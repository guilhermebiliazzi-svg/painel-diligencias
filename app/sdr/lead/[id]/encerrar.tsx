'use client';

// 06/11: Encerrar lead que já está com corretor — motivo por toque, com confirmação.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { encerrar, type Resultado } from '../../actions';

const MOTIVOS: [string, string][] = [
  ['nao_responde', 'Não responde'],
  ['desistiu', 'Desistiu'],
  ['vendido', 'Imóvel vendido/alugado'],
  ['fora_perfil', 'Fora do perfil'],
];

export default function Encerrar({ id }: { id: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [res, setRes] = useState<Resultado | null>(null);
  const [pend, start] = useTransition();

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">
        Encerrar lead
      </button>
    );
  }
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Encerrar lead</h2>
      <p className="mt-1 text-xs text-slate-500">Sai do funil ativo e a Eva para de cobrar o corretor e o cliente. O corretor não recebe aviso.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {MOTIVOS.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setMotivo(k)}
            className={'rounded-xl border px-3 py-2 text-sm font-semibold ' + (motivo === k ? 'border-red-600 bg-red-50 text-red-800' : 'border-slate-300 text-slate-700')}>
            {t}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={pend} onClick={() => { setAberto(false); setMotivo(''); setRes(null); }}
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-40">
          Cancelar
        </button>
        <button type="button" disabled={pend || !motivo}
          onClick={() => { setRes(null); start(async () => { const r = await encerrar(id, motivo); setRes(r); if (r.ok) router.refresh(); }); }}
          className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
          {pend ? 'Encerrando…' : 'Confirmar'}
        </button>
      </div>
      {res && <p className={'mt-2 text-sm ' + (res.ok ? 'text-emerald-700' : 'text-red-700')}>{res.ok ? res.msg : res.erro}</p>}
    </section>
  );
}
