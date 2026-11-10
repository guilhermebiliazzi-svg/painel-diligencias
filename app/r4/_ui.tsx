// rquatro — peças visuais compartilhadas (marca provisória, cabeçalho).
import Link from 'next/link';

export function Marca({ tamanho = 'md' }: { tamanho?: 'md' | 'lg' }) {
  const t = tamanho === 'lg' ? 'text-3xl' : 'text-xl';
  return (
    <span className={`${t} font-extrabold tracking-tight text-[#0F1B2D]`}>
      r<span className="text-[#C8102E]">quatro</span>
    </span>
  );
}

export function Cabecalho({
  base,
  unidade,
  nome,
  superadmin,
}: {
  base: string;
  unidade: string | null;
  nome: string | null;
  superadmin: boolean;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={`${base}/`} aria-label="Início">
          <Marca />
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm font-medium text-slate-600">
          <Link href={`${base}/`} className="hover:text-slate-900">Início</Link>
          {superadmin && (
            <Link href={`${base}/unidades`} className="hover:text-slate-900">Unidades</Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
          <span className="hidden sm:inline">
            {nome || ''}
            {unidade ? <span className="text-slate-400"> · {unidade}</span> : null}
          </span>
          <form action={`${base}/sair`} method="post">
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
