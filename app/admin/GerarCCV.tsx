'use client';

// app/admin/GerarCCV.tsx
// Botão "Gerar CCV" no cabeçalho da diligência. Só habilita depois que o parecer
// está liberado (status 'aprovado'). Dispara o webhook gerar-ccv (fire-and-forget)
// e acompanha o resultado pelo /api/ccv-status.

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { gerarCCV } from './actions';

type CcvStatus = {
  id: string;
  status: string | null;
  docx_url: string | null;
  criado_em: string | null;
} | null;

export function GerarCCV({ diligenciaId }: { diligenciaId: string }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [ccv, setCcv] = useState<CcvStatus>(null);
  const [parecerAprovado, setParecerAprovado] = useState(false);
  const ccvIdInicial = useRef<string | null>(null);

  // Gate: o botão só habilita quando o parecer da diligência está 'aprovado'.
  const carregarParecer = useCallback(async () => {
    try {
      const r = await fetch(`/api/parecer-status/${diligenciaId}`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      setParecerAprovado((data.parecer?.status ?? null) === 'aprovado');
    } catch {
      /* silencioso */
    }
  }, [diligenciaId]);

  const carregarCcv = useCallback(async (): Promise<CcvStatus> => {
    try {
      const r = await fetch(`/api/ccv-status/${diligenciaId}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      const c = (data.ccv ?? null) as CcvStatus;
      setCcv(c);
      return c;
    } catch {
      return null;
    }
  }, [diligenciaId]);

  useEffect(() => {
    carregarParecer();
    carregarCcv();
  }, [carregarParecer, carregarCcv]);

  // Enquanto estiver gerando, consulta a cada 5s até surgir um CCV novo (ou 3 min).
  useEffect(() => {
    if (!gerando) return;
    const inicio = Date.now();
    const idInicial = ccvIdInicial.current;
    const timer = setInterval(async () => {
      const c = await carregarCcv();
      if ((c && c.id && c.id !== idInicial) || Date.now() - inicio > 180000) {
        setGerando(false);
        clearInterval(timer);
      }
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gerando]);

  function disparar() {
    if (!parecerAprovado) return;
    setErro(null);
    ccvIdInicial.current = ccv?.id ?? null;
    startTransition(async () => {
      try {
        await gerarCCV(diligenciaId);
        setGerando(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'erro ao disparar');
      }
    });
  }

  const ineditavel = pending || gerando;
  const desabilitado = ineditavel || !parecerAprovado;

  return (
    <div className="flex items-center gap-2">
      {ccv && (
        <a
          href={`/api/ccv-html/${diligenciaId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          title="Abrir CCV"
        >
          Ver CCV{ccv.status === 'aprovado' ? '' : ' (rascunho)'}
        </a>
      )}
      {ccv && (
        <a
          href={`/api/ccv-docx/${diligenciaId}`}
          className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
          title="Baixar o CCV em Word (.docx)"
        >
          Baixar .docx
        </a>
      )}
      <button
        type="button"
        onClick={disparar}
        disabled={desabilitado}
        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
          desabilitado
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
            : 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50'
        }`}
        title={
          parecerAprovado
            ? 'Gera o CCV a partir do parecer liberado e dos dados do negócio'
            : 'Libere o parecer (status aprovado) antes de gerar o CCV'
        }
      >
        {gerando ? 'Gerando…' : ccv ? '↻ Gerar CCV de novo' : '📄 Gerar CCV'}
      </button>
      {erro && <span className="text-xs text-rose-600">{erro}</span>}
    </div>
  );
}
