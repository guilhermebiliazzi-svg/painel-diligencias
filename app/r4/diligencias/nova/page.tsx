import Link from 'next/link';
import { Cabecalho } from '../../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { FormularioNova } from './formulario';

export const metadata = { title: 'Nova diligência' };
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function NovaDiligenciaR4() {
  const { usuario, base } = await exigirR4({ ferramenta: 'diligencia' });
  const ehSuper = usuario.papel === 'superadmin';

  let unidades: { id: string; nome: string }[] | null = null;
  let semPasta = false;
  // responsável escolhe, já no cadastro, os corretores que podem ver a diligência
  let equipe: { id: string; nome: string | null; email: string }[] | null = null;
  if (usuario.papel === 'admin') {
    const { data } = await r4Admin()
      .from('usuarios')
      .select('id,nome,email')
      .eq('unidade_id', usuario.unidade_id)
      .eq('papel', 'corretor')
      .eq('ativo', true)
      .order('nome');
    equipe = (data || []) as { id: string; nome: string | null; email: string }[];
  }
  if (ehSuper) {
    const { data } = await r4Admin().from('unidades').select('id,nome,pasta_drive_id').eq('ativa', true).order('nome');
    unidades = (data || []).filter((u) => u.pasta_drive_id).map((u) => ({ id: u.id, nome: u.nome }));
  } else {
    const { data } = await r4Admin().from('unidades').select('pasta_drive_id').eq('id', usuario.unidade_id).maybeSingle();
    semPasta = !data?.pasta_drive_id;
  }

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} logo={usuario.unidade?.logo_url ?? null} nome={usuario.nome} superadmin={ehSuper} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href={`${base}/diligencias`} className="text-sm text-slate-500 hover:text-slate-800">← Diligências</Link>
        <h1 className="mt-2 text-2xl font-semibold">Nova diligência</h1>
        <p className="mt-1 text-sm text-slate-600">
          O sistema emite as certidões dos proprietários e do imóvel e salva os PDFs na pasta do Google Drive da sua unidade.
        </p>
        <div className="mt-6">
          {semPasta || (unidades && unidades.length === 0) ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              A pasta do Google Drive da unidade ainda não foi configurada.{' '}
              {usuario.papel === 'admin' ? (
                <Link href={`${base}/minha-unidade`} className="font-semibold underline">Configurar em Minha unidade</Link>
              ) : ehSuper ? (
                <Link href={`${base}/unidades`} className="font-semibold underline">Configurar em Unidades</Link>
              ) : (
                'Peça ao responsável da sua unidade para configurar.'
              )}
            </p>
          ) : (
            <FormularioNova unidades={unidades} base={base} equipe={equipe} />
          )}
        </div>
      </main>
    </>
  );
}
