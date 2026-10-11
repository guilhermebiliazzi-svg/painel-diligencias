'use client';

// Ao abrir a lista, consulta no Clicksign o andamento dos contratos ainda em
// aberto (só os que não foram consultados nos últimos minutos) e recarrega.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { atualizarStatus } from './actions';

export default function AtualizarStatus({ envelopes }: { envelopes: string[] }) {
  const router = useRouter();
  const [fazendo, setFazendo] = useState(envelopes.length > 0);
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || !envelopes.length) return;
    feito.current = true;
    atualizarStatus(envelopes)
      .then((r) => {
        if (r.mudou) router.refresh();
      })
      .finally(() => setFazendo(false));
  }, [envelopes, router]);
  if (!fazendo) return null;
  return <p className="mb-3 text-xs text-slate-500">Consultando o andamento no Clicksign…</p>;
}
