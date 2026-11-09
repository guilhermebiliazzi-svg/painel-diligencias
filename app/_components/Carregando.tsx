// 09/11: aparece na hora em que se clica para abrir uma tela, enquanto os dados carregam
// (antes a tela parada dava a impressão de que o clique não tinha funcionado).
export default function Carregando() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden />
        Carregando…
      </div>
      <div className="mt-6 space-y-4 animate-pulse" aria-hidden>
        <div className="h-7 w-56 rounded-lg bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white" />)}
        </div>
        <div className="h-64 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </main>
  );
}
