'use client';

// Botão do card do novato: reenvia o contrato de associação pela Clicksign.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reenviarContrato } from './actions';

export default function Reenviar({ id, nome }: { id: string; nome: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Reenviar o contrato de ${nome} pela Clicksign? Ele(a) e quem assina com ele(a) recebem um novo pedido de assinatura.`)) return;
          setMsg(null);
          start(async () => {
            const r = await reenviarContrato(id);
            setMsg(r.ok ? 'Contrato reenviado. Acompanhe o andamento aqui no card.' : r.erro || 'Não consegui reenviar.');
            router.refresh();
          });
        }}
        className="rounded-lg bg-blue-700 px-3 py-1.5 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {pending ? 'Reenviando…' : 'Reenviar contrato'}
      </button>
      {msg && <span className="text-slate-600">{msg}</span>}
    </div>
  );
}
