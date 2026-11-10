// 09/11: tela aberta pela notificação de lead novo. Mostra a oferta (sem nome e telefone do cliente) e
// deixa o corretor responder SIM/NÃO aqui, como no WhatsApp.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirPerfil, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Botoes from './botoes';

export const metadata = { title: 'Lead novo — REMAX Ville' };
const f8 = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '').slice(-8);
const passou = (s: string) => new Date(s).getTime() < Date.now();
const hora = (s: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(s));

export default async function Oferta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const perfil = await exigirPerfil();
  const cor = await corretorDaPessoa(perfil.email);
  const sb = supabaseAdmin();
  const { data: atr } = await sb.from('sdr_atribuicoes').select('id,lead_id,corretor_phone,resposta,oferecido_em,prazo_em').eq('id', id).maybeSingle();
  if (!atr) notFound();
  const dono = !!cor?.phone && f8(cor.phone) === f8(atr.corretor_phone);
  if (!dono && !perfil.is_admin) notFound();
  const desde = new Date(new Date(atr.oferecido_em ?? 0).getTime() - 120e3).toISOString();
  const { data: msg } = await sb.from('sdr_mensagens').select('conteudo').eq('lead_id', atr.lead_id).eq('direcao', 'out')
    .like('telefone', '%' + f8(atr.corretor_phone)).gte('created_at', desde).order('created_at', { ascending: true }).limit(1).maybeSingle();
  const texto = String(msg?.conteudo ?? '').replace(/^\[ERRO[^\]]*\]\s*/, '').replace(/\s*Responda SIM ou NÃO.*$/i, '').trim();
  const vencida = !atr.resposta && !!atr.prazo_em && passou(atr.prazo_em);
  const aberta = !atr.resposta && !vencida;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-xl px-4 py-8">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-slate-500">← Painel interno</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Lead novo para você</h1>
        <p className="mt-1 text-sm text-slate-500">Oferecido às {atr.oferecido_em ? hora(atr.oferecido_em) : '—'}{atr.prazo_em ? ` · responda até ${hora(atr.prazo_em)}` : ''}</p>
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-base leading-relaxed text-slate-800 shadow-sm">
          {texto || 'Lead da REMAX Ville.'}
        </div>
        {aberta && dono && <Botoes id={atr.id} />}
        {aberta && !dono && <p className="mt-6 text-sm text-slate-500">Aguardando a resposta do corretor.</p>}
        {atr.resposta === 'sim' && <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Lead assumido. Os dados do cliente estão no seu WhatsApp.</p>}
        {atr.resposta && atr.resposta !== 'sim' && <p className="mt-6 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">Esta oferta já foi encerrada.</p>}
        {vencida && <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">O prazo de 15 minutos acabou e o lead foi para o próximo corretor.</p>}
      </main>
    </div>
  );
}
