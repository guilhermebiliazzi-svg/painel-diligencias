// Tela de UMA captação da landing (Anuncie na REMAX) — link do aviso no WhatsApp.
// Se o lead já foi criado (fila escolhida), vai direto para a tela do lead.
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { leadDaCaptacao } from '@/app/sdr/lead-captacao';
import Decisao, { type CorretorOpc } from '../../decisao';
import ReferenciarCaptacao from './referenciar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Captação — SDR REMAX Ville' };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };

export default async function CaptacaoSdr({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = supabaseAdmin();
  const { data: c } = await sb.from('captacao_leads').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const tel = String(c.telefone ?? '').replace(/\D/g, '');
  const tel55 = tel.length <= 11 ? '55' + tel : tel;
  if (tel) {
    const leadId = await leadDaCaptacao(tel55, c.criado_em);
    if (leadId) redirect('/sdr/lead/' + leadId);
  }
  const { data: cors } = await sb.from('corretores_associados').select('phone,nome,apelido,foto_url').eq('status', 'ativo').not('phone', 'is', null).order('nome');
  const quer = /^alug/i.test(String(c.intencao ?? '')) ? 'Alugar' : 'Vender';

  return (
    <main style={{ backgroundColor: '#f8fafc' }} className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/sdr" className="text-sm text-slate-500">← Funil do SDR</Link>
        <header style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{c.nome || 'Proprietário'}</h1>
            {c.referenciado_em ? (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">Captação · referenciada</span>
            ) : c.descartado_em ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Captação · descartada</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Captação · esperando você</span>
            )}
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            {tel && <div className="flex gap-3"><dt className="w-24 text-slate-500">Telefone</dt><dd><a href={'https://wa.me/' + tel55} target="_blank" className="text-blue-700 underline">{telFmt(tel55)}</a></dd></div>}
            <div className="flex gap-3"><dt className="w-24 text-slate-500">Quer</dt><dd className="text-slate-900">{[quer, c.tipo, c.bairro].filter(Boolean).join(' · ')}</dd></div>
            {c.endereco && <div className="flex gap-3"><dt className="w-24 text-slate-500">Endereço</dt><dd className="text-slate-900">{c.endereco}</dd></div>}
            <div className="flex gap-3"><dt className="w-24 text-slate-500">Entrou</dt><dd className="text-slate-900">{fmt.format(new Date(c.criado_em))}</dd></div>
          </dl>
        </header>
        {c.referenciado_em ? (
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">Referenciada em {fmt.format(new Date(c.referenciado_em))}. O aceite e o e-mail seguem pela Eva; acompanhe em Referenciamentos.</p>
        ) : c.descartado_em ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Descartada em {fmt.format(new Date(c.descartado_em))}.</p>
        ) : tel ? (
          <>
            <Decisao modo="captacao" id={c.id} corretores={(cors ?? []) as CorretorOpc[]} filaAtual={[]}
              podeOfertar podeSegurar={false} podeDescartar emCascata={false} />
            <ReferenciarCaptacao id={c.id} />
          </>
        ) : (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">Esta captação não tem telefone (foi só um clique no WhatsApp).</p>
        )}
      </div>
    </main>
  );
}
