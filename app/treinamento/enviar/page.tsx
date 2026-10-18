// Treinamento de novatos — mensagem pelo Max para um ou vários corretores
// (em treinamento ou que já passaram pela trilha). Só admin.
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import EnviarMensagem, { type Destinatario } from '../EnviarMensagem';
import { inicioJanela } from '../util';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mensagem pelo Max — Treinamento — REMAX Ville' };

export default async function EnviarPage() {
  await exigirTela('treinamento');
  const sb = supabaseAdmin();
  const desde = inicioJanela();
  const [nov, rec] = await Promise.all([
    sb.from('onb_novatos').select('id,nome,phone,status').order('nome'),
    sb.from('onb_mensagens').select('phone').eq('direcao', 'in').gte('criado_em', desde).limit(2000),
  ]);
  if (nov.error) throw new Error(nov.error.message);
  const abertas = new Set(((rec.data ?? []) as { phone: string }[]).map((m) => m.phone));
  const destinatarios: Destinatario[] = ((nov.data ?? []) as { id: string; nome: string; phone: string; status: string }[])
    .map((n) => ({ id: n.id, nome: n.nome, status: n.status, janela: abertas.has(n.phone) }));

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/treinamento" className="text-sm text-slate-500 hover:text-slate-800">← Treinamento de novatos</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Mensagem pelo Max</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sai do WhatsApp do Max (11) 5192-8192 para cada corretor escolhido, um a um. Se o corretor responder, quem responde é o Max.
        </p>
        <section style={{ backgroundColor: '#ffffff' }} className="mt-6 rounded-2xl border border-slate-200 p-5 shadow-sm">
          {destinatarios.length === 0
            ? <p className="text-sm text-slate-500">Nenhum corretor cadastrado na trilha.</p>
            : <EnviarMensagem destinatarios={destinatarios} multiplo />}
        </section>
      </main>
    </div>
  );
}
