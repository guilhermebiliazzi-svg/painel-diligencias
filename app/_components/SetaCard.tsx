'use client';

// 09/11: seta do card da tela inicial. Enquanto a tela abre, vira um círculo girando
// e o card ganha contorno azul, para mostrar que o clique deu certo.
import { useLinkStatus } from 'next/link';

export default function SetaCard() {
  const { pending } = useLinkStatus();
  return (
    <span className="relative flex size-5 items-center justify-center">
      {pending ? (
        <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" role="status" aria-label="Abrindo" />
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
      )}
    </span>
  );
}
