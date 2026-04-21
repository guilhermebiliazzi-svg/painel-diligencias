// Página raiz. Ninguém deve chegar aqui em produção — os clientes acessam
// direto /d/<uuid>. Mas se chegarem, que seja uma landing mínima e digna.

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        RE/MAX Ville
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">
        Painel de Diligências
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Acesse pelo link específico da sua diligência, enviado pelo seu
        corretor.
      </p>
    </main>
  );
}
