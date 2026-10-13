'use client';

// Resgatar um lead referenciado que não teve aceite (ou foi recusado): cancela o pedido
// pendente e devolve o lead para "esperando você".
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resgatarReferenciamento, type Resultado } from '../../actions';

export default function Resgatar({ id, pendente }: { id: string; pendente: boolean }) {
  const router = useRouter();
  const [confirma, setConfirma] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [pend, start] = useTransition();
  const rotulo = pendente ? 'Cancelar referenciamento e trazer o lead de volta' : 'Trazer o lead de volta';

  return (
    <div className="mt-3 space-y-2">
      {!confirma ? (
        <button type="button" onClick={() => setConfirma(true)}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-50">
          {rotulo}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{pendente ? 'O pedido de aceite ao corretor de fora é cancelado e o lead volta para "esperando você".' : 'O lead volta para "esperando você".'} Confirma?</span>
          <button type="button" disabled={pend}
            onClick={() => { setRes(null); start(async () => { const r = await resgatarReferenciamento(id); setRes(r); if (r.ok) { setConfirma(false); router.refresh(); } }); }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            {pend ? 'Resgatando…' : 'Sim, resgatar'}
          </button>
          <button type="button" disabled={pend} onClick={() => setConfirma(false)} className="rounded-lg px-3 py-1.5 text-amber-900 hover:bg-amber-100">Não</button>
        </div>
      )}
      {res && <p className={'text-sm ' + (res.ok ? 'text-emerald-700' : 'text-red-700')}>{res.ok ? res.msg : res.erro}</p>}
    </div>
  );
}
