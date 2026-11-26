// 20/11: estudos de mercado aguardando aprovação do Guilherme. Estudo gerado por corretor (painel ou Eva)
// nasce "aguardando"; o aviso chega no WhatsApp com o link para cá. Aprovar ou pedir correção avisa o corretor.
import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Acoes from './acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aprovar estudos — REMAX Ville' };

type Pedido = {
  id: string; email: string | null; criado_em: string; lead_id: string | null; nome_arquivo: string | null; origem: string | null;
  aprovacao: string; aprovacao_obs: string | null; aprovacao_por: string | null; aprovacao_em: string | null;
};
type Lead = { id: string; nome: string | null; imovel_anuncio_endereco: string | null; corretor_phone: string | null };
type Cor = { nome: string; email: string | null; phone: string | null };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const CAMPOS = 'id,email,criado_em,lead_id,aprovacao,aprovacao_obs,aprovacao_por,aprovacao_em,nome_arquivo:payload->>nome_arquivo,origem:payload->>origem';
const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await exigirAdmin();
  const { id: foco } = await searchParams;
  const sb = supabaseAdmin();
  const desde = new Date(Date.now() - 14 * 864e5).toISOString();
  const [{ data: ag }, { data: dec }, { data: cors }] = await Promise.all([
    sb.from('painel_estudo_pedidos').select(CAMPOS).eq('aprovacao', 'aguardando').order('criado_em').limit(100),
    sb.from('painel_estudo_pedidos').select(CAMPOS).in('aprovacao', ['aprovado', 'correcao']).not('aprovacao_por', 'like', 'automático%').gte('aprovacao_em', desde).order('aprovacao_em', { ascending: false }).limit(40),
    sb.from('corretores_associados').select('nome,email,phone'),
  ]);
  const aguardando = (ag ?? []) as Pedido[];
  const decididos = (dec ?? []) as Pedido[];
  const ids = [...new Set([...aguardando, ...decididos].map((p) => p.lead_id).filter(Boolean))] as string[];
  const { data: ls } = ids.length ? await sb.from('sdr_leads').select('id,nome,imovel_anuncio_endereco,corretor_phone').in('id', ids) : { data: [] };
  const leads = new Map(((ls ?? []) as Lead[]).map((l) => [l.id, l]));
  const corretores = (cors ?? []) as Cor[];
  const corretorDe = (p: Pedido) => {
    const l = p.lead_id ? leads.get(p.lead_id) : undefined;
    const c = corretores.find((x) => p.email && x.email && x.email.toLowerCase() === p.email.toLowerCase())
      ?? corretores.find((x) => l?.corretor_phone && fim8(x.phone) === fim8(l.corretor_phone));
    return c ? c.nome.split(' - ')[0] : (p.email || '—');
  };
  const enderecoDe = (p: Pedido) => {
    const l = p.lead_id ? leads.get(p.lead_id) : undefined;
    return l?.imovel_anuncio_endereco?.trim() || (p.nome_arquivo || 'Estudo de mercado').replace(/\.pptx$/i, '').replace(/_/g, ' ');
  };

  const Cartao = ({ p, aberto }: { p: Pedido; aberto: boolean }) => {
    const l = p.lead_id ? leads.get(p.lead_id) : undefined;
    return (
      <article id={'e' + p.id} className={'rounded-2xl border bg-white p-4 ' + (p.id === foco ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200')}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="min-w-0 break-words text-base font-semibold text-slate-900">{enderecoDe(p)}</h2>
          <span className="text-xs tabular-nums text-slate-500">{fmt.format(new Date(p.criado_em))}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {corretorDe(p)}{p.origem === 'eva' ? ' · pela Eva' : ' · pelo painel'}{l?.nome ? ' · proprietário: ' + l.nome : ''}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {/* 26/11: abrir no navegador (Office Online ou Google), sem baixar; baixar continua ao lado */}
          <a href={'/api/estudo/arquivo?ver=office&id=' + p.id} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">Abrir no Office</a>
          <a href={'/api/estudo/arquivo?ver=google&id=' + p.id} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">Abrir no Google</a>
          <a href={'/api/estudo/arquivo?id=' + p.id} className="text-blue-700 underline">Baixar</a>
          {p.lead_id && <Link href={'/sdr/lead/' + p.lead_id} className="text-blue-700 underline">Abrir o lead</Link>}
        </p>
        {aberto ? (
          <div className="mt-3 border-t border-slate-100 pt-3"><Acoes id={p.id} /></div>
        ) : (
          <p className={'mt-3 border-t border-slate-100 pt-3 text-sm ' + (p.aprovacao === 'aprovado' ? 'text-emerald-700' : 'text-amber-800')}>
            {p.aprovacao === 'aprovado' ? 'Aprovado' : 'Correção pedida'}{p.aprovacao_em ? ' em ' + fmt.format(new Date(p.aprovacao_em)) : ''}
            {p.aprovacao_obs ? <>: “{p.aprovacao_obs}”</> : null}
          </p>
        )}
      </article>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/estudo" className="text-sm text-slate-500 hover:text-slate-800">← Estudo de mercado</Link>
        <h1 className="text-2xl font-semibold text-slate-900">Aprovar estudos</h1>
        <p className="text-sm text-slate-600">
          Estudos gerados pelos corretores esperam a sua liberação antes da V2. Baixe, confira e aprove, ou peça a correção:
          o corretor recebe a decisão no WhatsApp. Correção feita, ele gera de novo e o estudo volta para cá.
        </p>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Aguardando ({aguardando.length})</h2>
          {aguardando.length ? aguardando.map((p) => <Cartao key={p.id} p={p} aberto />) : (
            <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Nenhum estudo esperando aprovação.</p>
          )}
        </section>
        {decididos.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Decididos nos últimos 14 dias</h2>
            {decididos.map((p) => <Cartao key={p.id} p={p} aberto={false} />)}
          </section>
        )}
      </div>
    </main>
  );
}
