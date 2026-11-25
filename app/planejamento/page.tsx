// 25/11/2026: página pública (sem login) para o corretor escolher o grupo do planejamento 2027.
// O link vai no WhatsApp; a identificação é pelo WhatsApp do cadastro de corretores.
import { GRUPOS, LOCAL, grupoAberto } from '@/lib/planejamento';
import Agendar from './agendar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planejamento 2027 — REMAX Ville', robots: { index: false, follow: false } };

export default function Planejamento() {
  const grupos = GRUPOS.map((g) => ({ n: g.n, rotulo: g.rotulo, aberto: grupoAberto(g) }));
  const algumAberto = grupos.some((g) => g.aberto);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <section style={{ backgroundColor: '#ffffff' }} className="mx-auto max-w-md rounded-2xl border border-slate-200 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#003DA5]">REMAX Ville</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Planejamento 2027</h1>
        <p className="mt-2 text-sm text-slate-600">
          Encontro de 1 hora com o Guilherme para montar o seu planejamento de 2027. Presencial, na {LOCAL}.
          Escolha um dos grupos; você recebe um lembrete no WhatsApp na véspera.
        </p>
        {algumAberto ? <Agendar grupos={grupos} /> : (
          <p className="mt-5 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Os encontros já aconteceram. Obrigado!</p>
        )}
      </section>
    </main>
  );
}
