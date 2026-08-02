// Home do painel interno. Exige login (Supabase) + perfil ativo. Mostra só
// os cards que a pessoa tem permissão de ver. Admin vê também "Usuários".

import Link from 'next/link';
import { exigirPerfil } from '@/lib/perfil';
import { logoutAction } from './actions';
import { getNav, type ItemNav, type IconeNav, type Cor } from '@/lib/nav';

export const metadata = { title: 'Painel interno — RE/MAX Ville' };

const COR_CHIP: Record<Cor, string> = {
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
};

function Icone({ nome }: { nome: IconeNav }) {
  const common = {
    xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const, className: 'size-6',
  };
  switch (nome) {
    case 'diligencias':
      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="m9 15 2 2 4-4" /></svg>);
    case 'cobrancas':
      return (<svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>);
    case 'repasse':
      return (<svg {...common}><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>);
    case 'notas':
      return (<svg {...common}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /></svg>);
    case 'usuarios':
      return (<svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>);
    case 'mais':
      return (<svg {...common}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
  }
}

function CardConteudo({ icone, cor, titulo, descricao, disponivel }: {
  icone: IconeNav; cor: Cor; titulo: string; descricao: string; disponivel: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between">
        <span className={`flex size-12 items-center justify-center rounded-xl ${COR_CHIP[cor]}`}>
          <Icone nome={icone} />
        </span>
        {disponivel ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">definir URL</span>
        )}
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{titulo}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{descricao}</p>
    </>
  );
}

const BASE = 'group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition';
const HOVER = 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md';

function CardTela({ item }: { item: ItemNav }) {
  const conteudo = <CardConteudo icone={item.icone} cor={item.cor} titulo={item.titulo} descricao={item.descricao} disponivel={item.disponivel} />;
  if (!item.disponivel) {
    return <div style={{ backgroundColor: '#ffffff' }} className={`${BASE} cursor-default opacity-70`} title="Defina a URL desta tela nas variáveis de ambiente">{conteudo}</div>;
  }
  if (item.externo) {
    return <a href={item.href} style={{ backgroundColor: '#ffffff' }} className={`${BASE} ${HOVER}`}>{conteudo}</a>;
  }
  return <Link href={item.href} style={{ backgroundColor: '#ffffff' }} className={`${BASE} ${HOVER}`}>{conteudo}</Link>;
}

export default async function Home() {
  const perfil = await exigirPerfil();
  const itens = getNav().filter((i) => perfil.is_admin || perfil[i.permKey]);
  const nome = (perfil.nome?.trim() || perfil.email).split(' ')[0];

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">RE/MAX Ville — Painel interno</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Olá, {nome}</h1>
            <p className="mt-1 text-sm text-slate-600">Escolha uma área para continuar.</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              Sair
            </button>
          </form>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((item) => (<CardTela key={item.chave} item={item} />))}

          {perfil.is_admin && (
            <Link href="/usuarios" style={{ backgroundColor: '#ffffff' }} className={`${BASE} ${HOVER}`}>
              <CardConteudo icone="usuarios" cor="slate" titulo="Usuários" descricao="Convidar pessoas, ativar/desativar e definir permissões." disponivel />
            </Link>
          )}

          {itens.length === 0 && !perfil.is_admin && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Você ainda não tem nenhuma área liberada. Fale com o administrador.
            </div>
          )}
        </section>

        <footer className="mt-10 text-center text-xs text-slate-400">
          RE/MAX Ville — Jardins/Itaim, São Paulo · {perfil.email}
        </footer>
      </main>
    </div>
  );
}
