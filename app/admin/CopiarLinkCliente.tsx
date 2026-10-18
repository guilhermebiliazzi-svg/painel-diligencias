'use client';

import { btn } from './botoes';
import { useState } from 'react';

type Props = {
  diligencia_id: string;
  /** Base URL do painel cliente. Default: https://painel.villejardins.com.br */
  baseUrl?: string;
};

/**
 * Botao "Compartilhar link" que copia a URL publica do painel cliente
 * pra area de transferencia. Mostra "Copiado!" por 2s ao clicar.
 */
export function CopiarLinkCliente({
  diligencia_id,
  baseUrl = 'https://painel.villejardins.com.br',
}: Props) {
  const [estado, setEstado] = useState<'idle' | 'ok' | 'erro'>('idle');
  const url = `${baseUrl}/d/${diligencia_id}`;

  async function copiar() {
    try {
      // Tenta clipboard API moderna
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback antigo
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setEstado('ok');
      setTimeout(() => setEstado('idle'), 2000);
    } catch {
      setEstado('erro');
      setTimeout(() => setEstado('idle'), 2500);
    }
  }

  const cls =
    estado === 'ok' ? btn('ok') : estado === 'erro' ? btn('erro') : btn('neutro');

  const label =
    estado === 'ok'
      ? '✓ Link copiado'
      : estado === 'erro'
        ? 'Falha ao copiar'
        : 'Compartilhar link';

  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copia o link público do painel do cliente: ${url}`}
      className={cls}
    >
      {label}
    </button>
  );
}
