'use client';

// app/admin/GerarParecer.tsx
// Botão "Gerar parecer" no cabeçalho da diligência. Abre um formulário com os
// dados do negócio (comprador, preço, forma de pagamento), dispara o workflow B
// (fire-and-forget) e acompanha o resultado pelo /api/parecer-status.

import { useState, useEffect, useRef, useTransition, useCallback } from 'react';
import { gerarParecer } from './actions';

type ParecerStatus = {
  id: string;
  veredito: string | null;
  modo: string | null;
  status: string | null;
  pdf_url: string | null;
  criado_em: string | null;
} | null;

export function GerarParecer({ diligenciaId }: { diligenciaId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [parecer, setParecer] = useState<ParecerStatus>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const carregar = useCallback(async (): Promise<ParecerStatus> => {
    try {
      const r = await fetch(`/api/parecer-status/${diligenciaId}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json();
      const p = (data.parecer ?? null) as ParecerStatus;
      setParecer(p);
      return p;
    } catch {
      return null;
    }
  }, [diligenciaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Enquanto estiver gerando, consulta a cada 5s até surgir um parecer NOVO (ou 3 min).
  // Detecta o término pelo id (cada geração cria uma linha nova) — o pdf_url agora é
  // estável (/api/parecer-html/<id>), então não serve mais como sinal de término.
  useEffect(() => {
    if (!gerando) return;
    const inicio = Date.now();
    const idInicial = parecer?.id ?? null;
    const timer = setInterval(async () => {
      const p = await carregar();
      if ((p && p.id && p.id !== idInicial) || Date.now() - inicio > 180000) {
        setGerando(false);
        clearInterval(timer);
      }
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gerando]);

  function fechar() {
    if (pending) return;
    setOpen(false);
    setErro(null);
    formRef.current?.reset();
  }

  function submeter(fd: FormData) {
    setErro(null);
    fd.set('diligencia_id', diligenciaId);
    startTransition(async () => {
      try {
        await gerarParecer(fd);
        setOpen(false);
        setGerando(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'erro ao disparar');
      }
    });
  }

  const ineditavel = pending || gerando;

  return (
    <>
      <div className="flex items-center gap-2">
        {parecer?.pdf_url && (
          <a
            href={parecer.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
            title={parecer.veredito ? `Veredito: ${parecer.veredito}` : 'Abrir parecer'}
          >
            Ver parecer{parecer.status === 'aprovado' ? '' : ' (rascunho)'}
          </a>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={ineditavel}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
            ineditavel
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'border-blue-300 bg-white text-blue-700 hover:bg-blue-50'
          }`}
          title="Gera o parecer de diligência a partir das certidões e dos dados do negócio"
        >
          {gerando ? 'Gerando…' : parecer ? '↻ Gerar de novo' : '⚖ Gerar parecer'}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={fechar}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Gerar parecer de diligência</h2>
              <button
                type="button"
                onClick={fechar}
                disabled={pending}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              ℹ O parecer é gerado a partir das certidões já levantadas. Os campos abaixo
              completam os dados do negócio. O resultado sai como rascunho, para sua revisão.
            </p>

            <form ref={formRef} action={submeter} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Comprador</label>
                <input
                  type="text"
                  name="comprador_nome"
                  required
                  maxLength={160}
                  disabled={pending}
                  placeholder="Nome completo do comprador"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">CPF do comprador</label>
                  <input
                    type="text"
                    name="comprador_cpf"
                    maxLength={20}
                    disabled={pending}
                    placeholder="000.000.000-00"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Preço (R$)</label>
                  <input
                    type="number"
                    name="preco"
                    required
                    min={0}
                    step={1}
                    disabled={pending}
                    placeholder="460000"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Forma de pagamento</label>
                <input
                  type="text"
                  name="forma_pagamento"
                  maxLength={160}
                  disabled={pending}
                  placeholder="Ex.: financiamento bancário com alienação fiduciária"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Qualificação do comprador <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  name="comprador_qualificacao"
                  maxLength={200}
                  disabled={pending}
                  placeholder="Ex.: brasileiro, casado, comunhão parcial"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                />
              </div>

              {erro && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {erro}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={fechar}
                  disabled={pending}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
                    pending ? 'cursor-not-allowed bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {pending ? 'Disparando…' : 'Gerar parecer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
