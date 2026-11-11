import { redirect } from 'next/navigation';
import { Cabecalho } from '../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { CONTA_DRIVE_MOTOR } from '@/lib/r4/motor';
import { FormularioPasta } from './formulario';
import { LogoUnidade } from '../_logo';

export const metadata = { title: 'Minha unidade' };
export const dynamic = 'force-dynamic';

export default async function MinhaUnidadeR4() {
  const { usuario, base } = await exigirR4({ papel: 'admin' });
  if (usuario.papel === 'superadmin') redirect(`${base}/unidades`);

  const { data: un } = await r4Admin()
    .from('unidades')
    .select('nome,pasta_drive_id,logo_url')
    .eq('id', usuario.unidade_id)
    .maybeSingle();
  const pasta = (un?.pasta_drive_id as string | null) ?? null;

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} logo={usuario.unidade?.logo_url ?? null} nome={usuario.nome} superadmin={false} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Minha unidade</h1>
        <p className="mt-1 text-sm text-slate-600">{un?.nome}</p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold">Logo da unidade</h2>
          <p className="mt-2 text-sm text-slate-600">
            O logo sai no topo do painel, no link que você compartilha com o cliente e na capa do PDF das certidões. Use PNG
            (de preferência com fundo transparente) ou JPG, até 2 MB.
          </p>
          <LogoUnidade atual={(un?.logo_url as string | null) ?? null} />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold">Pasta do Google Drive</h2>
            {pasta ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">configurada</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">não configurada</span>
            )}
            {pasta && (
              <a
                href={`https://drive.google.com/drive/folders/${pasta}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-xs font-semibold text-[#0F1B2D] underline"
              >
                Abrir pasta ↗
              </a>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            As diligências da sua unidade e os PDFs das certidões são salvos nessa pasta, uma subpasta por imóvel.
          </p>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>No Google Drive da sua unidade, crie uma pasta (por exemplo, &quot;Diligências rquatro&quot;).</li>
            <li>
              Clique com o botão direito na pasta → <b>Compartilhar</b> → adicione <b>{CONTA_DRIVE_MOTOR}</b> como{' '}
              <b>Editor</b>.
            </li>
            <li>Abra a pasta, copie o endereço da barra do navegador e cole abaixo.</li>
          </ol>
          <FormularioPasta atual={pasta} />
          <p className="mt-3 text-xs text-slate-500">
            Ao salvar, o sistema confere se consegue criar arquivos na pasta. Se você usa um Drive compartilhado da empresa, os
            arquivos ficam no espaço dele.
          </p>
        </section>
      </main>
    </>
  );
}
