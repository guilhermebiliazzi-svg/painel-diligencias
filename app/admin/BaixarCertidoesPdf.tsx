'use client';

// app/admin/BaixarCertidoesPdf.tsx
// Botão "Baixar certidões (PDF)" no cabeçalho da diligência: monta um PDF só com
// todas as certidões que já têm arquivo (capa-índice na ordem da tela) e baixa.
// Ver app/api/adm/diligencia-pdf/[id]/route.ts.

import { useState } from 'react';
import { btn } from './botoes';

type Resultado = {
  url: string;
  nome: string;
  incluidas: number;
  paginas: number;
  pendentes: string[];
  nao_incluidas: string[];
  tamanho_mb: number;
};

export function BaixarCertidoesPdf({ diligenciaId }: { diligenciaId: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    setRes(null);
    try {
      const r = await fetch(`/api/adm/diligencia-pdf/${diligenciaId}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Falha (HTTP ${r.status}).`);
      setRes(d as Resultado);
      // dispara o download
      const a = document.createElement('a');
      a.href = d.url;
      a.download = d.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  const faltam = res ? res.pendentes.length + res.nao_incluidas.length : 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={gerar}
        disabled={gerando}
        className={btn(gerando ? 'inativo' : 'azul')}
        title="Junta num PDF só todas as certidões que já têm arquivo, com um índice na primeira página"
      >
        {gerando ? 'Montando PDF…' : 'Baixar certidões (PDF)'}
      </button>
      {erro && <p className="mt-1 max-w-xs text-xs text-rose-700">{erro}</p>}
      {res && (
        <div className="mt-1 max-w-xs text-xs text-slate-600">
          <p>
            {res.incluidas} certidões · {res.paginas} páginas · {res.tamanho_mb} MB.{' '}
            <a href={res.url} download={res.nome} className="font-medium text-sky-700 hover:underline">
              Baixar de novo
            </a>
          </p>
          {faltam > 0 && (
            <details className="mt-0.5 text-amber-800">
              <summary className="cursor-pointer">
                {faltam} fora do arquivo
                {res.pendentes.length ? ` (${res.pendentes.length} sem arquivo)` : ''}
              </summary>
              <ul className="mt-1 list-disc pl-4">
                {res.pendentes.map((n) => (
                  <li key={'p' + n}>{n} — pendente</li>
                ))}
                {res.nao_incluidas.map((n) => (
                  <li key={'n' + n}>{n} — não incluída (abrir no card)</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
