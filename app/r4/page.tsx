import Link from 'next/link';
import { Cabecalho } from './_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';

export const metadata = { title: 'Início' };
export const dynamic = 'force-dynamic';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function InicioR4({ searchParams }: { searchParams: Promise<{ ok?: string; sem?: string }> }) {
  const { usuario, base } = await exigirR4();
  const sp = await searchParams;
  const adm = r4Admin();
  const ehSuper = usuario.papel === 'superadmin';
  const temDiligencia = usuario.ferramentas.includes('diligencia');

  // uso do mês corrente (da unidade, ou de todas para o superadmin)
  const hoje = new Date();
  const competencia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  let qUso = adm.from('uso_mensal').select('unidade_id,certidoes,valor').eq('competencia', competencia);
  if (!ehSuper) qUso = qUso.eq('unidade_id', usuario.unidade_id);
  const { data: uso } = await qUso;
  const certidoes = (uso || []).reduce((a, r) => a + Number(r.certidoes || 0), 0);
  const valor = (uso || []).reduce((a, r) => a + Number(r.valor || 0), 0);

  let qDil = adm.from('diligencias').select('id', { count: 'exact', head: true });
  if (!ehSuper) qDil = qDil.eq('unidade_id', usuario.unidade_id);
  const { count: totalDil } = await qDil;

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} nome={usuario.nome} superadmin={ehSuper} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {sp?.ok === 'senha' && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Senha salva.</p>
        )}
        {sp?.sem === 'ferramenta' && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Seu acesso não inclui essa ferramenta. Fale com o responsável da sua unidade.
          </p>
        )}
        <h1 className="text-2xl font-semibold">Olá{usuario.nome ? `, ${usuario.nome.split(' ')[0]}` : ''}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {ehSuper ? 'Administração do rquatro — todas as unidades.' : usuario.unidade?.nome}
        </p>

        {!temDiligencia && !ehSuper && (
          <p className="mt-6 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            Você ainda não tem ferramentas liberadas. Fale com o responsável da sua unidade.
          </p>
        )}
        {temDiligencia && (
        <>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Diligências</p>
            <p className="mt-2 text-3xl font-bold">{totalDil ?? 0}</p>
            <p className="mt-1 text-sm text-slate-500">
              <Link href={`${base}/diligencias`} className="font-semibold text-[#0F1B2D] underline">Ver todas</Link>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Certidões no mês</p>
            <p className="mt-2 text-3xl font-bold">{certidoes}</p>
            <p className="mt-1 text-sm text-slate-500">Emitidas pelo sistema em {hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valor do mês</p>
            <p className="mt-2 text-3xl font-bold">{brl(valor)}</p>
            <p className="mt-1 text-sm text-slate-500">R$ 2,00 por certidão emitida pelo sistema.</p>
          </div>
        </div>

        </>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {temDiligencia && (
          <Link
            href={`${base}/diligencias/nova`}
            className="inline-flex rounded-lg bg-[#C8102E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a50d26]"
          >
            + Nova diligência
          </Link>
          )}
          {usuario.papel === 'admin' && (
            <Link
              href={`${base}/equipe`}
              className="inline-flex rounded-lg bg-[#0F1B2D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2c45]"
            >
              Equipe
            </Link>
          )}
        {ehSuper && (
            <Link
              href={`${base}/unidades`}
              className="inline-flex rounded-lg bg-[#0F1B2D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2c45]"
            >
              Gerenciar unidades
            </Link>
        )}
        </div>
      </main>
    </>
  );
}
