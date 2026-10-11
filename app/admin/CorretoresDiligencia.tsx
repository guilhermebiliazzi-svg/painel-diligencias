'use client';

// app/admin/CorretoresDiligencia.tsx
// Botão "Corretores" no cabeçalho da diligência: quem enxerga esta diligência em
// "Minhas diligências". Entram sozinhos quem criou a diligência e quem está no
// split da comissão (Dados do negócio); aqui dá para incluir ou tirar à mão.

import { useState, useTransition } from 'react';
import {
  listarCorretoresDiligencia,
  ligarCorretor,
  desligarCorretor,
  type CorretorLigado,
  type CorretorOpcao,
} from './corretores-actions';

export function CorretoresDiligencia({ diligenciaId }: { diligenciaId: string }) {
  const [open, setOpen] = useState(false);
  const [ligados, setLigados] = useState<CorretorLigado[]>([]);
  const [opcoes, setOpcoes] = useState<CorretorOpcao[]>([]);
  const [escolhido, setEscolhido] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pending, startTransition] = useTransition();

  async function recarregar() {
    setCarregando(true);
    const r = await listarCorretoresDiligencia(diligenciaId);
    setCarregando(false);
    if (!r.ok) {
      setErro(r.erro || 'erro ao carregar');
      return;
    }
    setErro(null);
    setLigados(r.ligados);
    setOpcoes(r.opcoes);
  }

  function abrir() {
    setOpen(true);
    setEscolhido('');
    recarregar();
  }

  function incluir() {
    const id = Number(escolhido);
    if (!id) return;
    startTransition(async () => {
      const r = await ligarCorretor(diligenciaId, id);
      if (!r.ok) setErro(r.erro || 'erro ao incluir');
      setEscolhido('');
      await recarregar();
    });
  }

  function tirar(id: number) {
    startTransition(async () => {
      const r = await desligarCorretor(diligenciaId, id);
      if (!r.ok) setErro(r.erro || 'erro ao tirar');
      await recarregar();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        title="Corretores que enxergam esta diligência em 'Minhas diligências'"
      >
        👥 Corretores
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Corretores desta diligência</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              Quem está aqui vê a diligência em “Minhas diligências” (perfil Corretor). Entram sozinhos quem criou a
              diligência e quem está no split da comissão.
            </p>

            {carregando && !ligados.length ? (
              <p className="py-4 text-center text-xs text-slate-500">Carregando…</p>
            ) : ligados.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">Nenhum corretor ligado ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {ligados.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-1.5">
                    <span className="min-w-0 text-sm text-slate-800">
                      {c.nome}
                      {c.origem && <span className="ml-2 text-[11px] text-slate-500">{c.origem}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => tirar(c.id)}
                      disabled={pending}
                      className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Tirar
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <select
                value={escolhido}
                onChange={(e) => setEscolhido(e.target.value)}
                disabled={pending}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Incluir corretor…</option>
                {opcoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={incluir}
                disabled={pending || !escolhido}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Incluir
              </button>
            </div>

            {erro && <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
          </div>
        </div>
      )}
    </>
  );
}
