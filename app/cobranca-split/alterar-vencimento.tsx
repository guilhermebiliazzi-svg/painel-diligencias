'use client';

// Botão "Alterar vencimento" do histórico (cobranças pendentes ou vencidas).
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { alterarVencimento } from './actions';

function hoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export default function AlterarVencimento({ paymentId, atual }: { paymentId: string; atual: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(atual && atual >= hoje() ? atual : hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-1 block text-xs text-slate-500 underline hover:text-slate-800">
        alterar vencimento
      </button>
    );
  }
  return (
    <div className="mt-1.5 w-44">
      <input
        type="date"
        value={data}
        min={hoje()}
        onChange={(e) => setData(e.target.value)}
        disabled={pending}
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <div className="mt-1 flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setErro(null);
            start(async () => {
              const r = await alterarVencimento(paymentId, data);
              if (!r.ok) {
                setErro(r.mensagem || 'Não deu certo.');
                return;
              }
              if (r.aviso) {
                // alterou no Asaas mas não gravou no painel: mantém o aviso à vista
                setErro(r.aviso);
                router.refresh();
                return;
              }
              setAberto(false);
              router.refresh();
            });
          }}
          className="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" disabled={pending} onClick={() => setAberto(false)} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600">
          Cancelar
        </button>
      </div>
      {erro && <p className="mt-1 text-xs text-rose-700">{erro}</p>}
    </div>
  );
}
