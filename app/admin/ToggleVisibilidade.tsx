'use client';

import { useTransition } from 'react';
import {
  toggleCardOculto,
  togglePessoaOculta,
} from './actions';

type ToggleCardProps = {
  certidao_id: string;
  diligencia_id: string;
  oculto: boolean;
  /** action (padrão: a do painel da Ville) */
  acao?: (certidao_id: string, diligencia_id: string, novoOculto: boolean) => Promise<void>;
};

export function ToggleCardVisivel({ certidao_id, diligencia_id, oculto, acao = toggleCardOculto }: ToggleCardProps) {
  const [pending, startTransition] = useTransition();
  const visivel = !oculto;

  return (
    <label
      className={`inline-flex items-center gap-1 text-xs ${
        pending ? 'text-slate-400' : visivel ? 'text-slate-600' : 'text-slate-400'
      }`}
      title="Mostrar este card no painel cliente"
    >
      <input
        type="checkbox"
        checked={visivel}
        disabled={pending}
        onChange={(e) => {
          const novoOculto = !e.target.checked;
          startTransition(() => {
            acao(certidao_id, diligencia_id, novoOculto);
          });
        }}
        className="size-3.5 rounded border-slate-300"
      />
      Mostrar
    </label>
  );
}

type TogglePessoaProps = {
  diligencia_id: string;
  documento_normalizado: string;
  oculta: boolean;
  acao?: (diligencia_id: string, documento_normalizado: string, novoOculto: boolean) => Promise<void>;
};

export function TogglePessoaVisivel({
  diligencia_id,
  documento_normalizado,
  oculta,
  acao = togglePessoaOculta,
}: TogglePessoaProps) {
  const [pending, startTransition] = useTransition();
  const visivel = !oculta;

  return (
    <label
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        pending ? 'text-slate-400' : visivel ? 'text-emerald-700' : 'text-slate-400'
      }`}
      title="Mostrar esta pessoa (e todos seus cards) no painel cliente"
    >
      <input
        type="checkbox"
        checked={visivel}
        disabled={pending}
        onChange={(e) => {
          const novoOculto = !e.target.checked;
          startTransition(() => {
            acao(diligencia_id, documento_normalizado, novoOculto);
          });
        }}
        className="size-3.5 rounded border-slate-300"
      />
      Mostrar na diligência
    </label>
  );
}
