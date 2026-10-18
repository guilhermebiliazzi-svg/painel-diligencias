// app/admin/EmitirCobranca.tsx
// Botão que abre a tela de emissão de cobrança da comissão (WF-A2 no n8n).
// A tela é servida pelo n8n e recebe o diligencia_id por query string.
'use client';

import { btn } from './botoes';

type Props = {
  diligenciaId: string;
  /** true = ambiente de testes (sandbox). Troque para false quando for para produção. */
  sandbox?: boolean;
};

const N8N_BASE = 'https://villejds.app.n8n.cloud/webhook';

export function EmitirCobranca({ diligenciaId, sandbox = true }: Props) {
  const path = sandbox ? 'asaas-cobranca-sbx' : 'asaas-cobranca';
  const url = `${N8N_BASE}/${path}?diligencia_id=${encodeURIComponent(diligenciaId)}`;

  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
      title="Abre a tela para emitir a cobrança da comissão com split entre os intermediadores"
      className={btn('vermelho')}
    >
      Emitir cobrança{sandbox ? ' (teste)' : ''}
    </button>
  );
}
