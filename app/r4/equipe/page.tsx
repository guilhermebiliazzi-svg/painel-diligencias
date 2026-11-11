import { redirect } from 'next/navigation';
import { Cabecalho } from '../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { alternarCorretor } from './actions';
import { AcessosCorretor, NovaSenhaCorretor, NovoCorretor } from './formularios';

export const metadata = { title: 'Equipe' };
export const dynamic = 'force-dynamic';

export default async function EquipeR4() {
  const { usuario, base } = await exigirR4({ papel: 'admin' });
  if (usuario.papel === 'superadmin') redirect(`${base}/unidades`);

  const adm = r4Admin();
  const [{ data: ferramentasTodas }, { data: pessoas }] = await Promise.all([
    adm.from('ferramentas').select('codigo,nome').eq('ativa', true).order('ordem'),
    adm.from('usuarios').select('id,nome,email,papel,ativo').eq('unidade_id', usuario.unidade_id).order('nome'),
  ]);
  // só as ferramentas que a unidade tem
  const ferramentas = (ferramentasTodas || []).filter((f) => usuario.ferramentas.includes(f.codigo));
  const ids = (pessoas || []).map((p) => p.id);
  const { data: acessos } = ids.length
    ? await adm.from('usuario_ferramentas').select('usuario_id,ferramenta').in('usuario_id', ids)
    : { data: [] as { usuario_id: string; ferramenta: string }[] };
  const de = (id: string) => (acessos || []).filter((a) => a.usuario_id === id).map((a) => a.ferramenta);

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} nome={usuario.nome} superadmin={false} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Equipe</h1>
        <p className="mt-1 text-sm text-slate-600">
          Cadastre os corretores da {usuario.unidade?.nome} e escolha o que cada um pode usar. Você, como responsável, tem acesso a todas as ferramentas da unidade.
        </p>

        <div className="mt-6"><NovoCorretor ferramentas={ferramentas} /></div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold">Pessoas com acesso</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {(pessoas || []).map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{p.nome || '—'}</span>
                  <span className="text-slate-500">{p.email}</span>
                  <span className="text-xs text-slate-400">{p.papel === 'admin' ? 'Responsável' : 'Corretor'}</span>
                  {!p.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">desligado</span>}
                  {p.papel === 'corretor' && (
                    <span className="ml-auto flex items-center gap-3">
                      <NovaSenhaCorretor usuarioId={p.id} />
                      <form action={alternarCorretor}>
                        <input type="hidden" name="usuario_id" value={p.id} />
                        <input type="hidden" name="ativo" value={String(p.ativo)} />
                        <button className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                          {p.ativo ? 'Desligar' : 'Religar'}
                        </button>
                      </form>
                    </span>
                  )}
                </div>
                {p.papel === 'corretor' ? (
                  <div className="mt-2">
                    <AcessosCorretor usuarioId={p.id} ferramentas={ferramentas} marcadas={de(p.id)} />
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Acesso a todas as ferramentas da unidade.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
