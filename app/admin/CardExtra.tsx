'use client';

import { useState, useRef, useTransition } from 'react';
import { criarCertidaoExtra, excluirCertidaoExtra } from './actions';

type CardExtraNovoProps = {
  diligencia_id: string;
  pasta_id: string;
  /** Pessoa dona do card. Vazio/null para cards de imovel. */
  documento_normalizado?: string | null;
  titular?: string | null;
};

/**
 * Botao "+ Adicionar documento" que abre um modal pra criar card extra.
 * Renderizado como o ULTIMO item do grid de cards do grupo.
 */
export function CardExtraNovo({
  diligencia_id,
  pasta_id,
  documento_normalizado,
  titular,
}: CardExtraNovoProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function fechar() {
    if (pending) return;
    setOpen(false);
    setErro(null);
    setArquivoNome(null);
    formRef.current?.reset();
  }

  function submeter(fd: FormData) {
    setErro(null);
    fd.set('diligencia_id', diligencia_id);
    fd.set('pasta_id', pasta_id);
    fd.set('documento_normalizado', documento_normalizado ?? '');
    fd.set('titular', titular ?? '');
    startTransition(async () => {
      try {
        await criarCertidaoExtra(fd);
        fechar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'erro desconhecido');
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[100px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white/50 p-3 text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-700"
        title="Adicionar documento avulso a este grupo"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-xs font-medium">Adicionar documento</span>
      </button>

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
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Adicionar documento
                </h2>
                {titular && (
                  <p className="text-xs text-slate-500">{titular}</p>
                )}
              </div>
              <button
                type="button"
                onClick={fechar}
                disabled={pending}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form
              ref={formRef}
              action={submeter}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Descrição do documento
                </label>
                <input
                  type="text"
                  name="descricao"
                  required
                  maxLength={120}
                  disabled={pending}
                  placeholder="Ex.: Comprovante de residência"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Arquivo PDF
                </label>
                <input
                  type="file"
                  name="arquivo"
                  required
                  accept="application/pdf,.pdf"
                  disabled={pending}
                  onChange={(e) => setArquivoNome(e.target.files?.[0]?.name ?? null)}
                  className="block w-full text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
                />
                {arquivoNome && (
                  <p className="mt-1 truncate text-[11px] text-slate-500">
                    {arquivoNome}
                  </p>
                )}
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
                    pending
                      ? 'cursor-not-allowed bg-slate-400'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {pending ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Botao pequeno de excluir card extra (X). Pede confirmacao via window.confirm.
 */
export function ExcluirCardExtra({
  certidao_id,
  diligencia_id,
}: {
  certidao_id: string;
  diligencia_id: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Excluir este documento extra? O PDF do Drive não será removido.')) return;
        startTransition(async () => {
          await excluirCertidaoExtra(certidao_id, diligencia_id);
        });
      }}
      title="Excluir card extra (apenas o card; o PDF do Drive permanece)"
      className={`rounded-md border px-2 py-1 text-xs font-medium ${
        pending
          ? 'cursor-not-allowed border-slate-200 text-slate-400'
          : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
      }`}
    >
      {pending ? 'Excluindo...' : '✕ Excluir card'}
    </button>
  );
}
