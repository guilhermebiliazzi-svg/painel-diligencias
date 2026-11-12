'use client';

// rquatro — botão de envio de formulário que mostra que está trabalhando:
// fica desabilitado, troca o texto e gira um indicador enquanto o servidor responde
// (login e troca de senha levam alguns segundos e antes pareciam travados).
import { useFormStatus } from 'react-dom';

export function BotaoEnviar({ children, carregando }: { children: React.ReactNode; carregando: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F1B2D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2c45] disabled:cursor-wait disabled:opacity-80"
    >
      {pending && (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending ? carregando : children}
    </button>
  );
}
