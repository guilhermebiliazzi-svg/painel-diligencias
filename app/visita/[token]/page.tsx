// Link do botão "Visita agendada" (acompanhamento do lead pela Eva): o corretor escolhe o imóvel,
// o dia e a hora. Público (sem login), mas só funciona com o token de uso único, válido por 7 dias.
import { supabaseAdmin } from '@/lib/supabase/admin';
import FormVisita, { type ImovelOpc } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Registrar visita — REMAX Ville', robots: { index: false, follow: false } };

function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">{children}</section>
    </main>
  );
}

export default async function VisitaLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return <Caixa><p className="text-sm text-slate-700">Link inválido.</p></Caixa>;
  const sb = supabaseAdmin();
  const { data: link } = await sb.from('sdr_visita_links').select('lead_id,usado_em,expira_em').eq('token', token).maybeSingle();
  const lk = link as { lead_id: string; usado_em: string | null; expira_em: string } | null;
  if (!lk) return <Caixa><p className="text-sm text-slate-700">Link inválido.</p></Caixa>;
  if (lk.usado_em) return <Caixa><p className="text-sm text-slate-700">Esta visita já foi registrada por este link. Para remarcar, toque de novo em &quot;Visita agendada&quot; na próxima mensagem da Eva.</p></Caixa>;
  if (new Date(lk.expira_em).getTime() < Date.now()) return <Caixa><p className="text-sm text-slate-700">Este link expirou. Toque de novo em &quot;Visita agendada&quot; na próxima mensagem da Eva.</p></Caixa>;
  const [{ data: lead }, { data: ims }] = await Promise.all([
    sb.from('sdr_leads').select('nome,status').eq('id', lk.lead_id).maybeSingle(),
    sb.from('sdr_imoveis_lead').select('id,ref,endereco,valor,do_anuncio,aprovado_cliente').eq('lead_id', lk.lead_id).order('created_at'),
  ]);
  const l = lead as { nome: string | null; status: string } | null;
  if (!l || ['arquivado', 'encerrado'].includes(l.status)) return <Caixa><p className="text-sm text-slate-700">Este lead já foi encerrado.</p></Caixa>;
  const brl = (v: number | null) => (v ? ' · R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '');
  const imoveis: ImovelOpc[] = ((ims ?? []) as { id: string; ref: string | null; endereco: string | null; valor: number | null; do_anuncio: boolean | null; aprovado_cliente: boolean | null }[])
    .filter((i) => i.do_anuncio || i.aprovado_cliente !== false)
    .map((i) => ({ id: i.id, rotulo: (i.endereco || i.ref || 'Imóvel') + brl(i.valor) + (i.ref ? ' (ref. ' + i.ref + ')' : '') + (i.do_anuncio ? ' · anúncio' : '') }));
  const nome = (l.nome || 'cliente').split(' ')[0];
  return (
    <Caixa>
      <h1 className="text-lg font-semibold text-slate-900">Registrar visita de {nome}</h1>
      <p className="mt-1 text-sm text-slate-600">Ao salvar, a Eva confirma com o cliente, coloca na sua agenda e lembra na véspera.</p>
      {imoveis.length ? <FormVisita token={token} imoveis={imoveis} /> : (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Este lead não tem imóvel cadastrado. Fale com o Guilherme para incluir o imóvel da visita.</p>
      )}
    </Caixa>
  );
}
