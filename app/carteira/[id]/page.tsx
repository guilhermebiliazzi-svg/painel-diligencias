// 18/11: Carteira — página do imóvel: contrato de representação (iList), checklist de comercialização,
// agenda, classificação/avaliação e linha do tempo (atividades + leads do funil para este imóvel).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acessoCarteira, COLS_IMOVEL, enderecoCurto, hojeSP, brl, dataBR, type Atividade, type ImovelCarteira } from '@/lib/carteira';
import { CHECKLIST_K, rotuloTipo, situacaoContrato } from '@/lib/carteira-tipos';
import { Agenda, Avaliacao, Checklist, type AtivView } from '../paineis';

export const metadata = { title: 'Imóvel da carteira — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

const fmtDia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso));
const fmtHora = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const ST_LEAD: Record<string, string> = {
  direto: 'enviado ao corretor', atribuido: 'com corretor', em_qualificacao: 'em qualificação', qualificado: 'qualificado',
  aguardando_cliente: 'aguardando cliente', arquivado: 'arquivado', encerrado: 'encerrado', visita: 'visita',
};

export default async function ImovelCarteiraPage({ params }: { params: Promise<{ id: string }> }) {
  const { gestao, eu } = await acessoCarteira();
  const { id: idTxt } = await params;
  const id = Number(idTxt);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sb = supabaseAdmin();
  const { data } = await sb.from('carteira_imoveis').select(COLS_IMOVEL).eq('id', id).maybeSingle();
  const im = data as ImovelCarteira | null;
  if (!im || (!gestao && (!eu || im.corretor_id !== eu.id))) notFound();

  const hoje = hojeSP();
  const [{ data: ats }, { data: leads }, { data: ft }, { data: cor }] = await Promise.all([
    sb.from('carteira_atividades').select('id,imovel_id,tipo,titulo,quando,feito_em,nota,link,criado_por,criado_em,cancelado_em').eq('imovel_id', id).order('criado_em', { ascending: false }).limit(500),
    im.ilist_listing_id
      ? sb.from('sdr_leads').select('id,nome,status,created_at,fonte').eq('imovel_anuncio_ref', im.ilist_listing_id).order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
    im.ilist_listing_id
      ? sb.from('feed_imoveis_site').select('url,imagem').like('url', `%${im.ilist_listing_id.replace('-', '')}`).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    im.corretor_id ? sb.from('corretores_associados').select('nome').eq('id', im.corretor_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const atividades = (ats ?? []) as Atividade[];
  const vivas = atividades.filter((a) => !a.cancelado_em);
  const feitos: Record<string, { em: string; link: string | null }> = {};
  for (const a of vivas) if (a.feito_em && CHECKLIST_K.has(a.tipo) && !feitos[a.tipo]) feitos[a.tipo] = { em: a.feito_em, link: a.link };
  const proximas: AtivView[] = vivas.filter((a) => !a.feito_em && a.quando).sort((x, y) => String(x.quando).localeCompare(String(y.quando)))
    .map((a) => ({ id: a.id, tipo: a.tipo, quando: a.quando, feito_em: a.feito_em, nota: a.nota }));

  type Ev = { em: string; t: string; d?: string; cor: string; href?: string };
  const evs: Ev[] = [];
  for (const a of atividades) {
    if (a.cancelado_em) { if (a.quando) evs.push({ em: a.cancelado_em, t: `${rotuloTipo(a.tipo)} cancelada`, d: a.nota ?? undefined, cor: 'bg-slate-300' }); continue; }
    if (a.feito_em) evs.push({ em: a.feito_em, t: rotuloTipo(a.tipo), d: [a.nota, a.criado_por?.split('@')[0]].filter(Boolean).join(' · ') || undefined, cor: 'bg-emerald-500', href: a.link ?? undefined });
    else if (a.quando) evs.push({ em: a.criado_em, t: `${rotuloTipo(a.tipo)} agendada para ${fmtDia(a.quando)} ${fmtHora(a.quando)}`, d: a.nota ?? undefined, cor: 'bg-blue-500' });
  }
  for (const l of (leads ?? []) as { id: string; nome: string | null; status: string; created_at: string; fonte: string | null }[]) {
    evs.push({ em: l.created_at, t: `Lead: ${(l.nome || 'cliente').split(' ')[0]}`, d: [l.fonte, ST_LEAD[l.status] ?? l.status].filter(Boolean).join(' · '), cor: 'bg-violet-500', href: `/sdr/lead/${l.id}` });
  }
  if (im.contrato_inicio) evs.push({ em: im.contrato_inicio + 'T12:00:00Z', t: `Contrato de representação${im.contrato_tipo ? ' ' + im.contrato_tipo : ''} (início)`, cor: 'bg-amber-500' });
  evs.sort((a, b) => b.em.localeCompare(a.em));

  const s = situacaoContrato(im.contrato_fim, hoje);
  const foto = ft as { url: string; imagem: string | null } | null;
  const nomeCor = String((cor as { nome?: string } | null)?.nome ?? im.ilist_agent_nome ?? '').split(' - ')[0];

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/carteira" className="text-sm text-slate-500 hover:text-slate-800">← Carteira</Link>

        <section style={{ backgroundColor: '#ffffff' }} className="mt-3 flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 shadow-sm sm:flex-row">
          <div className="h-40 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-32 sm:w-48">
            {foto?.imagem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.imagem} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cor}`}>{s.t}</span>
              {im.contrato_tipo && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">{im.contrato_tipo === 'exclusivo' ? 'Exclusivo' : 'Aberto'}</span>}
              <span className="text-xs text-slate-400">{im.ilist_listing_id}</span>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{enderecoCurto(im) || im.titulo}</h1>
            <p className="text-sm text-slate-600">{[im.bairro, im.area_m2 ? `${Math.round(im.area_m2)} m²` : '', im.dorms ? `${im.dorms} dorm.` : ''].filter(Boolean).join(' · ')}</p>
            {im.titulo && <p className="mt-1 text-sm italic text-slate-500">{im.titulo}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">Valor</dt><dd className="font-semibold text-slate-900">{brl(im.valor)}</dd></div>
              <div><dt className="text-xs text-slate-500">Comissão</dt><dd className="font-semibold text-slate-900">{im.comissao != null ? `${im.comissao}%` : '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Contrato</dt><dd className="font-semibold text-slate-900">{dataBR(im.contrato_inicio)} a {dataBR(im.contrato_fim)}</dd></div>
              <div><dt className="text-xs text-slate-500">Corretor</dt><dd className="font-semibold text-slate-900">{nomeCor || '—'}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              {im.tem_contrato_doc === false ? 'Sem o contrato anexado no iList. ' : ''}
              Dados do iList{im.sincronizado_em ? `, atualizados em ${fmtDia(im.sincronizado_em)}` : ''}.
              {foto?.url && <> · <a href={foto.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">ver no site</a></>}
            </p>
            {s.k !== 'ok' && s.k !== 'sem' && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${s.k === 'vencido' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                {s.k === 'vencido' ? 'O contrato de representação venceu. Renove com o proprietário e atualize a data no iList.' : 'O contrato está perto de vencer: agende a conversa de renovação.'}
              </p>
            )}
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Agenda imovelId={im.id} proximas={proximas} hoje={hoje} />
            <Checklist imovelId={im.id} feitos={feitos} />
          </div>
          <div className="space-y-4">
            <Avaliacao imovelId={im.id} classe={im.classificacao} notas={(im.avaliacao ?? {}) as Record<string, number>} obs={im.nota ?? ''} />
            <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Linha do tempo</h2>
              {evs.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nada registrado ainda.</p> : (
                <ol className="mt-3 space-y-3">
                  {evs.slice(0, 60).map((e, k) => (
                    <li key={k} className="flex gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.cor}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">
                          {e.href ? <a href={e.href} target={e.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="hover:underline">{e.t}</a> : e.t}
                        </p>
                        <p className="text-xs text-slate-500">{fmtDia(e.em)}{e.d ? ` · ${e.d}` : ''}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
