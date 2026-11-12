import Link from 'next/link';
import { Cabecalho } from '../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { resumoDoMotor } from '@/lib/r4/motor';
import { diligenciasLiberadas } from '@/lib/r4/diligencia';
import { r4Arquivar, r4Desarquivar } from './actions';

export const metadata = { title: 'Diligências' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { t: string; c: string }> = {
  enviando: { t: 'Iniciando', c: 'bg-slate-100 text-slate-700' },
  em_andamento: { t: 'Em andamento', c: 'bg-sky-100 text-sky-800' },
  erro: { t: 'Não iniciada', c: 'bg-red-100 text-red-700' },
};

export default async function DiligenciasR4({ searchParams }: { searchParams: Promise<{ arq?: string }> }) {
  const { usuario, base } = await exigirR4({ ferramenta: 'diligencia' });
  const arquivadas = (await searchParams)?.arq === '1';
  // arquivar/desarquivar: só o responsável da unidade (igual ao painel da Ville)
  const podeArquivar = usuario.papel === 'admin' || usuario.papel === 'superadmin';
  const ehSuper = usuario.papel === 'superadmin';
  const adm = r4Admin();
  let q = adm
    .from('diligencias')
    .select('id,titulo,status,motor_id,erro,criado_em,unidade_id,arquivada_em,unidades(nome)')
    .order('criado_em', { ascending: false })
    .limit(200);
  if (!ehSuper) q = q.eq('unidade_id', usuario.unidade_id);
  q = arquivadas ? q.not('arquivada_em', 'is', null) : q.is('arquivada_em', null);
  // corretor: só as que ele cadastrou e as que o responsável liberou para ele
  if (usuario.papel === 'corretor') {
    const liberadas = await diligenciasLiberadas(usuario.id);
    q = liberadas.length ? q.or(`criado_por.eq.${usuario.id},id.in.(${liberadas.join(',')})`) : q.eq('criado_por', usuario.id);
  }
  const { data } = await q;
  const lista = data || [];
  const resumo = await resumoDoMotor(lista.map((d) => d.motor_id).filter(Boolean) as string[]);

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} logo={usuario.unidade?.logo_url ?? null} nome={usuario.nome} superadmin={ehSuper} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Diligências</h1>
          <Link href={`${base}/diligencias/nova`} className="ml-auto rounded-lg bg-[#0C2749] px-4 py-2 text-sm font-semibold text-white hover:bg-[#000E35]">
            + Nova diligência
          </Link>
        </div>

        <div className="mt-4 flex gap-1 border-b border-slate-200 text-sm">
          <Link
            href={`${base}/diligencias`}
            className={`-mb-px border-b-2 px-3 py-2 font-semibold ${!arquivadas ? 'border-[#0C2749] text-[#0C2749]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Ativas
          </Link>
          <Link
            href={`${base}/diligencias?arq=1`}
            className={`-mb-px border-b-2 px-3 py-2 font-semibold ${arquivadas ? 'border-[#0C2749] text-[#0C2749]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            Arquivadas
          </Link>
        </div>

        {lista.length === 0 ? (
          <p className="mt-8 text-sm text-slate-500">{arquivadas ? 'Nenhuma diligência arquivada.' : 'Nenhuma diligência ainda.'}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {lista.map((d) => {
              const r = d.motor_id ? resumo.get(d.motor_id) : undefined;
              const st = STATUS[d.status] || { t: d.status, c: 'bg-slate-100 text-slate-700' };
              const pct = r && r.total ? Math.round((r.prontas / r.total) * 100) : 0;
              const un = (Array.isArray(d.unidades) ? d.unidades[0] : d.unidades) as { nome?: string } | null;
              return (
                <li key={d.id}>
                  <Link href={`${base}/diligencias/${d.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold">{d.titulo || 'Sem endereço'}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.c}`}>
                        {d.status === 'em_andamento' && r && r.andamento === 0 ? 'Concluída' : st.t}
                      </span>
                      {r && r.atencao > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{r.atencao} com atenção</span>
                      )}
                      <span className="ml-auto text-xs text-slate-500">
                        {ehSuper && un?.nome ? `${un.nome} · ` : ''}
                        {new Date(d.criado_em).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {r ? (
                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {r.prontas} de {r.total} certidões prontas{r.andamento ? ` · ${r.andamento} em andamento` : ''}
                        </p>
                      </div>
                    ) : d.erro ? (
                      <p className="mt-2 text-xs text-red-700">{d.erro}</p>
                    ) : null}
                  </Link>
                  {podeArquivar && (
                    <form action={arquivadas ? r4Desarquivar : r4Arquivar} className="mt-1 flex justify-end pr-2">
                      <input type="hidden" name="diligencia_id" value={d.id} />
                      <button className="text-xs font-semibold text-slate-500 underline hover:text-slate-800">
                        {arquivadas ? '↩ Desarquivar' : 'Arquivar'}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
