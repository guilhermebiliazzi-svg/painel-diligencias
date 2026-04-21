// Mostrado quando o UUID na URL é inválido ou não existe no banco.
// Mensagem propositalmente vaga pra não vazar "essa diligência existe mas
// você não tem acesso" vs "essa diligência não existe".

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        RE/MAX Ville
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-900">
        Diligência não encontrada
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        O link que você acessou não é válido. Verifique se copiou o endereço
        completo ou entre em contato com seu corretor para receber o link
        correto.
      </p>
    </main>
  );
}
