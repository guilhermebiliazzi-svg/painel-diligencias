// Check-out do dia do corretor em treinamento (link pessoal enviado pelo Max, sem login).
// Mostra as tarefas de hoje e as atrasadas. As que antes pediam print o próprio corretor marca;
// as demais (áudios, quizzes, fotos de campo, lotes de contatos) seguem pelo WhatsApp com o Max.
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hojeSP, diaSemanaDm, TOTAL_DIAS } from '../../treinamento/util';
import Lista, { type ItemCheckout } from './lista';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Check-out do dia — REMAX Ville', robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Tarefa = {
  id: number; dia: number; data_prevista: string; titulo: string; status: string; feedback: string | null; hora_inicio: string | null;
  onb_trilha: { ordem: number; checkout: boolean; comprovacao: string | null; quiz_tema: string | null; hora_inicio: string | null; conteudo_ref: string | null } | null;
};

function amanhaSeSexta(hoje: string): string | null {
  const d = new Date(hoje + 'T12:00:00Z');
  if (d.getUTCDay() !== 5) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sb = supabaseAdmin();
  const { data: n } = await sb.from('onb_novatos').select('id,nome,status').eq('id', id).maybeSingle();
  if (!n) notFound();
  const nov = n as { id: string; nome: string; status: string };

  const hoje = hojeSP();
  const sabado = amanhaSeSexta(hoje);
  const ate = sabado ?? hoje;
  const { data } = await sb.from('onb_tarefas')
    .select('id,dia,data_prevista,titulo,status,feedback,hora_inicio,onb_trilha(ordem,checkout,comprovacao,quiz_tema,hora_inicio,conteudo_ref)')
    .eq('novato_id', id)
    .lte('data_prevista', ate)
    .order('data_prevista')
    .order('dia');
  const todas = ((data ?? []) as unknown as Tarefa[]).filter((t) => t.onb_trilha);

  const feita = (s: string) => ['aprovada', 'dispensada', 'entregue'].includes(s);
  const item = (t: Tarefa): ItemCheckout => ({
    id: t.id,
    titulo: t.titulo,
    dia: t.dia,
    hora: (t.hora_inicio ?? t.onb_trilha?.hora_inicio ?? '').slice(0, 5),
    checkout: !!t.onb_trilha?.checkout,
    comprovacao: t.onb_trilha?.comprovacao ?? null,
    quiz: !!t.onb_trilha?.quiz_tema,
    link: t.onb_trilha?.conteudo_ref?.startsWith('http') ? t.onb_trilha.conteudo_ref : null,
    status: t.status,
    marcadaAqui: t.feedback === 'Check-out pelo painel',
  });
  const ordenar = (a: Tarefa, b: Tarefa) =>
    a.data_prevista.localeCompare(b.data_prevista) || a.dia - b.dia || (a.onb_trilha?.ordem ?? 0) - (b.onb_trilha?.ordem ?? 0);

  const deHoje = todas.filter((t) => t.data_prevista === hoje).sort(ordenar).map(item);
  const deSabado = sabado ? todas.filter((t) => t.data_prevista === sabado).sort(ordenar).map(item) : [];
  const anteriores = todas.filter((t) => t.data_prevista < hoje && !feita(t.status)).sort(ordenar).map(item);
  const total = todas.length;
  const concluidas = todas.filter((t) => feita(t.status)).length;
  const ativo = ['ativo', 'pausado'].includes(nov.status);
  const diaHoje = deHoje.length ? Math.max(...deHoje.map((t) => t.dia)) : null;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-xl px-4 py-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">REMAX Ville · Trilha com o Max</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Check-out de {nov.nome.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {diaSemanaDm(hoje)}{diaHoje ? ` · dia ${diaHoje} de ${TOTAL_DIAS}` : ''} · {concluidas} de {total} tarefas até hoje concluídas
        </p>

        {!ativo ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Sua trilha está encerrada. Qualquer dúvida, fale com o Max.</p>
        ) : (
          <>
            <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              Marque aqui o que você concluiu. Não precisa mandar print. O que tem áudio, foto de campo, lote de contatos ou quiz continua no WhatsApp com o Max.
            </p>
            <Lista novatoId={nov.id} grupos={[
              { titulo: 'Hoje', itens: deHoje },
              ...(deSabado.length ? [{ titulo: 'Amanhã (sábado, opcional)', itens: deSabado }] : []),
              ...(anteriores.length ? [{ titulo: 'Pendentes de dias anteriores', itens: anteriores }] : []),
            ]} />
          </>
        )}
      </main>
    </div>
  );
}
