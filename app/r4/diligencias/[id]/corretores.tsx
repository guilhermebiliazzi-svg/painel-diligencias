'use client';

// rquatro — responsável da unidade escolhe os corretores que podem ver a diligência.
// Quem cadastrou sempre vê; os demais corretores só veem se forem marcados aqui.
import { useState, useTransition } from 'react';
import { r4SalvarCorretores } from './acoes';

export function CorretoresDiligencia({
  diligenciaId,
  equipe,
  marcados,
  criadoPor,
}: {
  diligenciaId: string;
  equipe: { id: string; nome: string | null; email: string; ativo: boolean }[];
  marcados: string[];
  criadoPor: string | null;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(marcados));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [salvando, start] = useTransition();
  const mudou = sel.size !== marcados.length || marcados.some((m) => !sel.has(m));

  function alterna(id: string) {
    setMsg(null);
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (!equipe.length) {
    return <p className="text-xs text-slate-500">Nenhum corretor cadastrado na equipe da unidade.</p>;
  }

  return (
    <div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {equipe.map((c) => {
          const autor = c.id === criadoPor;
          return (
            <li key={c.id}>
              <label className={`inline-flex items-center gap-2 text-sm ${c.ativo ? 'text-slate-700' : 'text-slate-400'}`}>
                <input
                  type="checkbox"
                  checked={autor || sel.has(c.id)}
                  disabled={autor || salvando}
                  onChange={() => alterna(c.id)}
                  className="size-4 rounded border-slate-300"
                />
                {c.nome || c.email}
                {autor && <span className="text-xs text-slate-400">(cadastrou)</span>}
                {!c.ativo && <span className="text-xs">(desligado)</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!mudou || salvando}
          onClick={() =>
            start(async () => {
              const r = await r4SalvarCorretores(diligenciaId, [...sel]);
              setMsg({ ok: r.ok, t: r.msg });
            })
          }
          className="rounded-lg bg-[#0F1B2D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Salvar acesso'}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.t}</span>}
      </div>
    </div>
  );
}
