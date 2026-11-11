import { Cabecalho } from '../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { alternarUnidade } from './actions';
import { FerramentasUnidade, NovaUnidade, PastaDrive, RedefinirSenha } from './formularios';
import { CONTA_DRIVE_MOTOR } from '@/lib/r4/motor';
import { LogoUnidade } from '../_logo';

export const metadata = { title: 'Unidades' };
export const dynamic = 'force-dynamic';

const PAPEL: Record<string, string> = { admin: 'Responsável', corretor: 'Corretor', superadmin: 'Administração' };

export default async function UnidadesR4() {
  const { usuario, base } = await exigirR4({ papel: 'superadmin' });
  const adm = r4Admin();
  const [{ data: unidades }, { data: usuarios }, { data: ferramentas }, { data: liberadas }] = await Promise.all([
    adm.from('unidades').select('id,nome,cnpj,email_cobranca,ativa,criado_em,pasta_drive_id,logo_url').order('criado_em', { ascending: false }),
    adm.from('usuarios').select('id,nome,email,papel,ativo,unidade_id').order('nome'),
    adm.from('ferramentas').select('codigo,nome').eq('ativa', true).order('ordem'),
    adm.from('unidade_ferramentas').select('unidade_id,ferramenta'),
  ]);

  return (
    <>
      <Cabecalho base={base} unidade={null} nome={usuario.nome} superadmin />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Unidades</h1>
        <p className="mt-1 text-sm text-slate-600">Cada unidade só vê as próprias diligências. Desligar uma unidade bloqueia o acesso de todos dela.</p>
        <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Para liberar as diligências, a unidade cria uma pasta no Google Drive dela, compartilha como <b>Editor</b> com{' '}
          <b>{CONTA_DRIVE_MOTOR}</b> e cola o link em <b>Minha unidade</b> (ou manda para você colar aqui). Os PDFs ficam nessa pasta, separados por imóvel.
        </p>

        <div className="mt-6"><NovaUnidade ferramentas={ferramentas || []} /></div>

        <div className="mt-8 space-y-4">
          {(unidades || []).length === 0 && <p className="text-sm text-slate-500">Nenhuma unidade cadastrada.</p>}
          {(unidades || []).map((un) => {
            const pessoas = (usuarios || []).filter((x) => x.unidade_id === un.id);
            return (
              <section key={un.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-semibold">{un.nome}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${un.ativa ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {un.ativa ? 'ativa' : 'desligada'}
                  </span>
                  {un.cnpj && <span className="text-xs text-slate-500">CNPJ {un.cnpj}</span>}
                  <form action={alternarUnidade} className="ml-auto">
                    <input type="hidden" name="unidade_id" value={un.id} />
                    <input type="hidden" name="ativa" value={String(un.ativa)} />
                    <button className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50">
                      {un.ativa ? 'Desligar' : 'Religar'}
                    </button>
                  </form>
                </div>
                <PastaDrive unidadeId={un.id} atual={un.pasta_drive_id} />
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Logo da unidade</p>
                  <div className="mt-2"><LogoUnidade atual={un.logo_url} unidadeId={un.id} compacto /></div>
                </div>
                <FerramentasUnidade
                  unidadeId={un.id}
                  ferramentas={ferramentas || []}
                  marcadas={(liberadas || []).filter((l) => l.unidade_id === un.id).map((l) => l.ferramenta)}
                />
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {pessoas.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className="font-medium">{p.nome || '—'}</span>
                      <span className="text-slate-500">{p.email}</span>
                      <span className="text-xs text-slate-400">{PAPEL[p.papel] || p.papel}{p.ativo ? '' : ' · inativo'}</span>
                      <span className="ml-auto"><RedefinirSenha usuarioId={p.id} /></span>
                    </li>
                  ))}
                  {pessoas.length === 0 && <li className="py-2 text-slate-500">Sem usuários.</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
