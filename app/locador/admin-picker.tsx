"use client";

import { useMemo, useState } from "react";

export type LocOpc = { id: number; nome: string | null; email: string | null };

// Seletor de locador para o admin (acesso universal ao portal).
export default function AdminPicker({ locadores }: { locadores: LocOpc[] }) {
  const [q, setQ] = useState("");
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return locadores;
    return locadores.filter(
      (l) => (l.nome || "").toLowerCase().includes(t) || (l.email || "").toLowerCase().includes(t)
    );
  }, [q, locadores]);

  return (
    <div style={{ backgroundColor: "#f8fafc" }} className="min-h-screen">
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Ville Jardins · Modo admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Portal do locador — escolha um locador</h1>
          <p className="mt-1 text-sm text-slate-600">Você está como administrador. Selecione um locador para ver o portal dele.</p>
        </header>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500"
        />

        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filtrados.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Nenhum locador encontrado.</p>
          ) : (
            filtrados.map((l) => (
              <a
                key={l.id}
                href={`/locador?locador=${l.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{l.nome || `Locador #${l.id}`}</p>
                  {l.email && <p className="text-xs text-slate-500">{l.email}</p>}
                </div>
                <span className="shrink-0 text-sm font-medium text-blue-600">Abrir →</span>
              </a>
            ))
          )}
        </div>

        <a href="/" className="mt-6 inline-block text-sm font-medium text-slate-500 hover:text-slate-900">← Voltar ao painel</a>
      </main>
    </div>
  );
}
