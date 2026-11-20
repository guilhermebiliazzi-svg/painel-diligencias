'use client';

// 20/11: botões Aprovar / Pedir correção de um estudo aguardando aprovação.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decidir, type Decisao } from './actions';

export default function Acoes({ id }: { id: string }) {
  const router = useRouter();
  const [corrigir, setCorrigir] = useState(false);
  const [obs, setObs] = useState('');
  const [res, setRes] = useState<Decisao | null>(null);
  const [pend, start] = useTransition();

  const enviar = (acao: 'aprovado' | 'correcao') => start(async () => {
    const r = await decidir(id, acao, acao === 'correcao' ? obs : '');
    setRes(r);
    if (r.ok) router.refresh();
  });

  if (res?.ok) {
    return <p className="text-sm font-semibold text-emerald-700">Feito. {res.aviso || 'O corretor foi avisado pelo WhatsApp.'}</p>;
  }
  return (
    <div className="grid gap-2">
      {!corrigir ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pend} onClick={() => enviar('aprovado')}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pend ? 'Gravando…' : 'Aprovar'}
          </button>
          <button type="button" disabled={pend} onClick={() => setCorrigir(true)}
            className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50">
            Pedir correção
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="text-xs font-semibold text-slate-600" htmlFor={'obs-' + id}>O que o corretor precisa corrigir</label>
          <textarea id={'obs-' + id} value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={700}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Ex.: tire a amostra da Rua X, é cobertura; confira a área útil." />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pend || !obs.trim()} onClick={() => enviar('correcao')}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {pend ? 'Enviando…' : 'Enviar correção ao corretor'}
            </button>
            <button type="button" disabled={pend} onClick={() => { setCorrigir(false); setRes(null); }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {res && !res.ok && <p className="text-sm text-red-700" role="alert">{res.erro}</p>}
    </div>
  );
}
