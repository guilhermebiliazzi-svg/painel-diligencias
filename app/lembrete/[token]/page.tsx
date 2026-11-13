// 13/11: link do botão "Lembrar mais tarde" (acompanhamento do lead pela Eva): o corretor escolhe quando quer
// ser lembrado. Pausa sem mensagem ao cliente. Público (sem login), só com o token de uso único, válido por 7 dias.
import { supabaseAdmin } from '@/lib/supabase/admin';
import FormLembrete from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lembrar mais tarde — REMAX Ville', robots: { index: false, follow: false } };

function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">{children}</section>
    </main>
  );
}

export default async function LembreteLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Caixa><p className="text-sm text-slate-700">Link inválido.</p></Caixa>;
  const sb = supabaseAdmin();
  const { data: lk } = await sb.from('sdr_lembretes').select('lead_id,definido_em,lembrar_em,token_expira_em,cancelado_em').eq('token', token).maybeSingle();
  const l = lk as { lead_id: string; definido_em: string | null; lembrar_em: string | null; token_expira_em: string; cancelado_em: string | null } | null;
  if (!l || l.cancelado_em) return <Caixa><p className="text-sm text-slate-700">Link inválido.</p></Caixa>;
  const dia = (s: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(s));
  if (l.definido_em && l.lembrar_em) return <Caixa><p className="text-sm text-slate-700">Lembrete já marcado para {dia(l.lembrar_em)}. Para mudar, toque de novo em &quot;Lembrar mais tarde&quot; na próxima mensagem da Eva.</p></Caixa>;
  if (new Date(l.token_expira_em).getTime() < Date.now()) return <Caixa><p className="text-sm text-slate-700">Este link expirou. Toque de novo em &quot;Lembrar mais tarde&quot; na próxima mensagem da Eva.</p></Caixa>;
  const { data: lead } = await sb.from('sdr_leads').select('nome,status').eq('id', l.lead_id).maybeSingle();
  const ld = lead as { nome: string | null; status: string } | null;
  if (!ld || ['arquivado', 'encerrado'].includes(ld.status)) return <Caixa><p className="text-sm text-slate-700">Este lead já foi encerrado.</p></Caixa>;
  const nome = (ld.nome || 'cliente').split(' ')[0];
  return (
    <Caixa>
      <h1 className="text-lg font-semibold text-slate-900">Lembrar de {nome} mais tarde</h1>
      <p className="mt-1 text-sm text-slate-600">O lead continua com você. Até a data, a Eva não manda nada ao cliente nem te cobra. Na data, ela te lembra às 9h.</p>
      <FormLembrete token={token} />
    </Caixa>
  );
}
