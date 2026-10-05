// Tela de UM lead do SDR — aberta pelo link do cartão no WhatsApp.
// Decisão por toque (fila / segurar / descartar), sem texto livre.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Decisao, { type CorretorOpc } from '../../decisao';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lead — SDR REMAX Ville' };

type Lead = {
  id: string; nome: string | null; telefone: string; status: string; origem: string; fonte: string | null;
  intencao: string | null; tipologia: string | null; bairros: string[] | null; valor_max: number | null;
  imovel_anuncio_ref: string | null; imovel_anuncio_url: string | null; imovel_anuncio_endereco: string | null;
  imovel_anuncio_valor: number | null; imovel_anuncio_tipo: string | null; temperatura: string | null; resumo: string | null;
  fila_corretores: string[] | null; corretor_phone: string | null; created_at: string; cartao_enviado_em: string | null;
  motivo_arquivamento: string | null;
};
type Msg = { id: string; created_at: string; direcao: string; interlocutor: string; telefone: string | null; template: string | null; conteudo: string | null };

const STATUS: Record<string, { t: string; c: string }> = {
  aguardando_guilherme: { t: 'Esperando você', c: 'bg-amber-100 text-amber-800' },
  em_cascata: { t: 'Ofertando aos corretores', c: 'bg-blue-100 text-blue-800' },
  atribuido: { t: 'Com corretor', c: 'bg-emerald-100 text-emerald-800' },
  direto: { t: 'Direto ao gestor', c: 'bg-emerald-100 text-emerald-800' },
  visita_agendada: { t: 'Visita agendada', c: 'bg-emerald-100 text-emerald-800' },
  arquivado: { t: 'Arquivado', c: 'bg-slate-200 text-slate-700' },
  encerrado: { t: 'Encerrado', c: 'bg-slate-200 text-slate-700' },
  aguardando_cliente: { t: 'Esperando o cliente', c: 'bg-slate-100 text-slate-700' },
  em_qualificacao: { t: 'Em qualificação', c: 'bg-slate-100 text-slate-700' },
  qualificado: { t: 'Qualificado', c: 'bg-slate-100 text-slate-700' },
};
const INTENCAO: Record<string, string> = { compra: 'Compra', aluguel: 'Aluguel', venda: 'Venda (proprietário)' };
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const brl = (v: number | null) => (v == null ? null : 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 break-words text-slate-900">{v}</dd>
    </div>
  );
}

export default async function LeadSdr({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = supabaseAdmin();

  const [{ data: lead }, { data: msgs }, { data: cors }, { data: outros }] = await Promise.all([
    sb.from('sdr_leads').select('*').eq('id', id).maybeSingle(),
    sb.from('sdr_mensagens').select('id,created_at,direcao,interlocutor,telefone,template,conteudo').eq('lead_id', id).order('created_at', { ascending: false }).limit(20),
    sb.from('corretores_associados').select('phone,nome,apelido,foto_url').eq('status', 'ativo').not('phone', 'is', null).order('nome'),
    sb.from('sdr_leads').select('id,nome,imovel_anuncio_endereco,bairros').eq('status', 'aguardando_guilherme').neq('id', id).gte('updated_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('cartao_enviado_em', { ascending: false }).limit(10),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  const corretores = (cors ?? []) as CorretorOpc[];
  const porPhone = new Map(corretores.map((c) => [c.phone, c]));
  const nomeCor = (p: string) => { const c = porPhone.get(p); return c ? (c.apelido?.trim() || c.nome.split(' ')[0]) : telFmt(p); };
  const st = STATUS[l.status] ?? { t: l.status, c: 'bg-slate-100 text-slate-700' };
  const aberto = ['aguardando_guilherme', 'em_cascata'].includes(l.status) && !l.corretor_phone;
  const fila = l.fila_corretores ?? [];
  const wa = 'https://wa.me/' + l.telefone.replace(/\D/g, '');

  return (
    <main style={{ backgroundColor: '#f8fafc' }} className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/sdr" className="text-sm text-slate-500">← Funil do SDR</Link>

        <header style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{l.nome || 'Cliente sem nome'}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.c}`}>{st.t}</span>
          </div>
          <dl className="mt-3 divide-y divide-slate-100">
            <Linha k="Telefone" v={<a href={wa} target="_blank" className="text-blue-700 underline">{telFmt(l.telefone)}</a>} />
            <Linha k="Quer" v={[l.intencao ? INTENCAO[l.intencao] ?? l.intencao : null, l.tipologia, (l.bairros ?? []).join(', ')].filter(Boolean).join(' · ')} />
            <Linha k="Imóvel" v={l.imovel_anuncio_endereco ? (
              <>
                {l.imovel_anuncio_endereco}
                {l.imovel_anuncio_valor ? ' · ' + brl(l.imovel_anuncio_valor) : ''}
                {l.imovel_anuncio_url && <> · <a href={l.imovel_anuncio_url} target="_blank" className="text-blue-700 underline">anúncio</a></>}
              </>
            ) : null} />
            <Linha k="Até" v={brl(l.valor_max)} />
            <Linha k="Origem" v={[l.fonte, l.temperatura].filter(Boolean).join(' · ')} />
            <Linha k="Resumo" v={l.resumo} />
            <Linha k="Corretor" v={l.corretor_phone ? nomeCor(l.corretor_phone) : null} />
            <Linha k="Fila" v={fila.length ? fila.map(nomeCor).join(' → ') : null} />
            <Linha k="Arquivado" v={l.status === 'arquivado' ? l.motivo_arquivamento : null} />
            <Linha k="Entrou" v={fmt.format(new Date(l.created_at))} />
          </dl>
        </header>

        <Decisao
          modo="lead" id={l.id} corretores={corretores} filaAtual={fila}
          podeOfertar={aberto} podeSegurar={aberto} emCascata={l.status === 'em_cascata'}
          podeDescartar={!['atribuido', 'visita_agendada', 'encerrado', 'arquivado'].includes(l.status)}
        />

        {!aberto && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Este lead não está esperando decisão sua agora ({st.t.toLowerCase()}).
          </p>
        )}

        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Últimos acontecimentos</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {((msgs ?? []) as Msg[]).map((m) => (
              <li key={m.id} className="py-2 text-sm">
                <p className="text-xs text-slate-500">
                  {fmt.format(new Date(m.created_at))} · {m.direcao === 'in' ? 'de' : 'para'} {m.interlocutor}
                  {m.interlocutor === 'corretor' && m.telefone ? ' ' + nomeCor(m.telefone) : ''}
                </p>
                <p className="mt-0.5 whitespace-pre-line break-words text-slate-800">
                  {m.template === 'comando_fila' ? 'Fila: ' + String(m.conteudo ?? '').split(',').filter(Boolean).map(nomeCor).join(' → ') : String(m.conteudo ?? '').slice(0, 400)}
                </p>
              </li>
            ))}
            {!(msgs ?? []).length && <li className="py-2 text-sm text-slate-400">Sem registros.</li>}
          </ul>
        </section>

        {!!(outros ?? []).length && (
          <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Outros esperando você</h2>
            <ul className="mt-2 space-y-1">
              {(outros as { id: string; nome: string | null; imovel_anuncio_endereco: string | null; bairros: string[] | null }[]).map((o) => (
                <li key={o.id}>
                  <Link href={'/sdr/lead/' + o.id} className="text-sm text-blue-700 underline">
                    {o.nome || 'Cliente'}{o.imovel_anuncio_endereco ? ' — ' + o.imovel_anuncio_endereco : (o.bairros ?? []).length ? ' — ' + (o.bairros ?? []).join(', ') : ''}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
