'use client';

// app/admin/GerarParecer.tsx
// Botão "Gerar parecer" no cabeçalho da diligência. Coleta apenas os compradores
// (pode haver mais de um) e o valor do negócio — o detalhamento de pagamento entra
// só na fase do CCV. Dispara o workflow B (fire-and-forget) e acompanha o resultado
// pelo /api/parecer-status.

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

type Comprador = { nome: string; cpf: string };

export function GerarParecer({ diligenciaId }: { diligenciaId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [parecer, setParecer] = useState<ParecerStatus>(null);

  const [compradores, setCompradores] = useState<Comprador[]>([{ nome: '', cpf: '' }]);
  const [valor, setValor] = useState('');

  const baseLinkRef = useRef<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!gerando) return;
    const inicio = Date.now();
    const timer = setInterval(async () => {
      const p = await carregar();
      if ((p && p.pdf_url && p.pdf_url !== baseLinkRef.current) || Date.now() - inicio > 180000) {
        setGerando(false);
        clearInterval(timer);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [gerando, carregar]);

  function fechar() {
    if (pending) return;
    setOpen(false);
    setErro(null);
  }

  function setComprador(i: number, campo: keyof Comprador, v: string) {
    setCompradores((cs) => cs.map((c, idx) => (idx === i ? { ...c, [campo]: v } : c)));
  }
  function addComprador() {
    setCompradores((cs) => [...cs, { nome: '', cpf: '' }]);
  }
  function removerComprador(i: number) {
    setCompradores((cs) => (cs.length <= 1 ? cs : cs.filter((_, idx) => idx !== i)));
  }

  function submeter() {
    setErro(null);
    const limpos = compradores
      .map((c) => ({ nome: c.nome.trim(), cpf: c.cpf.trim() }))
      .filter((c) => c.nome);
    if (limpos.length === 0) {
      setErro('Informe ao menos um comprador.');
      return;
    }
    if (!valor.trim()) {
      setErro('Informe o valor do negócio.');
      return;
    }
    baseLinkRef.current = parecer?.pdf_url ?? null;
    const fd = new FormData();
    fd.set('diligencia_id', diligenciaId);
    fd.set('compradores', JSON.stringify(limpos));
    fd.set('preco', valor);
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
          title="Gera o parecer de diligência a partir das certidões, dos compradores e do valor do negócio"
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
              ℹ Aqui entram só os compradores e o valor. O detalhamento do pagamento
              (parcelas, comissão, prazos) é coletado depois, na geração do CCV.
            </p>

            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">Compradores</label>
                  <button
                    type="button"
                    onClick={addComprador}
                    disabled={pending}
                    className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                  >
                    + adicionar comprador
                  </button>
                </div>
                <div className="space-y-2">
                  {compradores.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={c.nome}
                        onChange={(e) => setComprador(i, 'nome', e.target.value)}
                        disabled={pending}
                        placeholder="Nome completo"
                        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                      />
                      <input
                        type="text"
                        value={c.cpf}
                        onChange={(e) => setComprador(i, 'cpf', e.target.value)}
                        disabled={pending}
                        placeholder="CPF"
                        className="w-32 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                      />
                      {compradores.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerComprador(i)}
                          disabled={pending}
                          title="Remover comprador"
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Valor do negócio (R$)</label>
                <input
                  type="number"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  min={0}
                  step={1}
                  disabled={pending}
                  placeholder="460000"
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
                  type="button"
                  onClick={submeter}
                  disabled={pending}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
                    pending ? 'cursor-not-allowed bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {pending ? 'Disparando…' : 'Gerar parecer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
