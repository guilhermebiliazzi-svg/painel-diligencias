import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cabecalho } from '../../_ui';
import { exigirR4, r4Admin } from '@/lib/r4/supabase';
import { certidoesDoMotor, emitidaPeloSistema, registrarCobranca, type CertidaoMotor } from '@/lib/r4/motor';
import { agrupar, categoriasFor, preencherCategorias, rotuloSituacao } from '@/lib/diligencia-ordem';

export const metadata = { title: 'Diligência' };
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COR: Record<string, string> = {
  Concluida: 'bg-emerald-100 text-emerald-800',
  Positiva: 'bg-rose-100 text-rose-800',
  'Com pendencias': 'bg-amber-100 text-amber-800',
  'Em revisao': 'bg-amber-100 text-amber-800',
  Falhou: 'bg-red-100 text-red-700',
};

function rotulo(c: CertidaoMotor) {
  if (c.situacao === 'Em revisao') return 'Em conferência';
  if (c.situacao === 'Aguardando inicio' || c.situacao === 'Em processamento' || c.situacao === 'aguardando_origem') return 'Em andamento';
  return rotuloSituacao(c.situacao);
}

const dataBr = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null);

export default async function DiligenciaR4({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { usuario, base } = await exigirR4({ ferramenta: 'diligencia' });
  if (!UUID_RE.test(id)) notFound();
  const ehSuper = usuario.papel === 'superadmin';

  let q = r4Admin().from('diligencias').select('id,unidade_id,titulo,status,motor_id,erro,dados,criado_em').eq('id', id);
  if (!ehSuper) q = q.eq('unidade_id', usuario.unidade_id);
  const { data: dil } = await q.maybeSingle();
  if (!dil) notFound();

  const todas = dil.motor_id ? await certidoesDoMotor(dil.motor_id) : [];
  if (todas.length) await registrarCobranca({ id: dil.id, unidade_id: dil.unidade_id }, todas);
  // Certidões que o sistema emite; os documentos que a unidade junta (matrícula,
  // documentos pessoais, condomínio) aparecem numa lista à parte.
  const certidoes = todas.filter((c) => !c.manual);
  const documentos = todas.filter((c) => c.manual);
  const grupos = agrupar(certidoes, dil.titulo || '');
  const prontas = certidoes.filter(emitidaPeloSistema).length;
  const andamento = certidoes.filter((c) => !emitidaPeloSistema(c) && !['Falhou', 'Nao cadastrado', 'Empresa extinta'].includes(c.situacao)).length;
  const pasta = (dil.dados as { pasta_drive_id?: string } | null)?.pasta_drive_id;

  return (
    <>
      <Cabecalho base={base} unidade={usuario.unidade?.nome ?? null} nome={usuario.nome} superadmin={ehSuper} papel={usuario.papel} ferramentas={usuario.ferramentas} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link href={`${base}/diligencias`} className="text-sm text-slate-500 hover:text-slate-800">← Diligências</Link>
        {sp?.nova && dil.motor_id && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Diligência iniciada. As certidões vão ficando prontas ao longo das próximas horas; algumas dependem de resposta por e-mail dos tribunais.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{dil.titulo}</h1>
          {pasta && (
            <a href={`https://drive.google.com/drive/folders/${pasta}`} target="_blank" rel="noreferrer" className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
              Abrir pasta no Drive ↗
            </a>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Criada em {new Date(dil.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          {certidoes.length > 0 && ` · ${prontas} de ${certidoes.length} prontas${andamento ? ` · ${andamento} em andamento` : ''}`}
        </p>

        {dil.status === 'erro' && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não iniciada: {dil.erro}</p>
        )}
        {dil.motor_id && certidoes.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">As certidões ainda estão sendo criadas. Atualize a página em instantes.</p>
        )}

        <div className="mt-6 space-y-6">
          {grupos.map((g) => (
            <section key={g.key} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-base font-semibold">{g.titulo}</h2>
                {g.subtitulo && <span className="text-xs text-slate-500">{g.subtitulo}</span>}
              </div>
              {preencherCategorias(g.rows, categoriasFor(g.tipo)).map((cat) => (
                <div key={cat.titulo} className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat.titulo}</p>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {cat.rows.map((c) => (
                      <li key={c.certidao_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                        <span className="min-w-0 flex-1">{c.certidao}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR[c.situacao] || 'bg-slate-100 text-slate-700'}`}>
                          {rotulo(c)}
                        </span>
                        {dataBr(c.data_emissao) && <span className="text-xs text-slate-500">{dataBr(c.data_emissao)}</span>}
                        {c.drive_file_id ? (
                          <a href={`https://drive.google.com/file/d/${c.drive_file_id}/view`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#0F1B2D] underline">
                            PDF ↗
                          </a>
                        ) : (
                          <span className="w-8" />
                        )}
                        {c.observacao_ia && (c.situacao === 'Positiva' || c.situacao === 'Com pendencias') && (
                          <p className="w-full text-xs text-slate-600">{c.observacao_ia}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>

        {documentos.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold">Documentos a juntar pela unidade</h2>
            <p className="mt-1 text-xs text-slate-500">
              Não são emitidos pelo sistema nem cobrados. O envio desses documentos pelo rquatro vem numa próxima etapa.
            </p>
            <ul className="mt-3 divide-y divide-slate-100">
              {documentos.map((c) => (
                <li key={c.certidao_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {c.certidao}
                    {c.titular && c.tipo_documento !== 'imovel' ? <span className="text-slate-500"> — {c.titular}</span> : null}
                  </span>
                  {c.drive_file_id ? (
                    <a href={`https://drive.google.com/file/d/${c.drive_file_id}/view`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#0F1B2D] underline">
                      PDF ↗
                    </a>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">a juntar</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
