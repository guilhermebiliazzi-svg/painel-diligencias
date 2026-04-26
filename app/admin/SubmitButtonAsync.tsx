'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  title?: string;
};

/**
 * Botao submit que detecta automaticamente o estado de pending da action
 * pai (quando esta dentro de um <form action={...}> da React 19).
 *
 * Enquanto a action roda:
 * - Botao fica desabilitado (nao da pra clicar de novo)
 * - Texto troca pra pendingLabel (ex: "Disparando...")
 * - Visual fica cinza (opacity reduzida)
 */
export function SubmitButtonAsync({
  children,
  pendingLabel = 'Disparando...',
  className = '',
  title,
}: Props) {
  const { pending } = useFormStatus();

  const baseCls = pending
    ? 'cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
    : '';

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className={`${className} ${baseCls}`.trim()}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
