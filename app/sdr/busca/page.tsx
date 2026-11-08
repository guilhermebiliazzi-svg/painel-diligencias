// 03/11: busca de pessoas por nome ou telefone — leads, contatos da Eva, captação, recrutamento,
// referenciamentos, corretores e qualquer número que tenha escrito para a Eva (public.sdr_busca).
import Link from 'next/link';
import { exigirSdrGestao } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Buscar cliente — SDR REMAX Ville' };

type Achado = {
  tel: string; nome: string | null; fonte: string; detalhe: string | null; status: string | null;
  quando: string | null; lead_id: string | null; cap_id: string | null; ult_msg: string | null;
};
type Pessoa = { tel: string; nomes: string[]; fontes: Set<string>; itens: Achado[]; ult: string | null };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };
const STATUS: Record<string, string> = {
  qualificando: 'em qualificação', qualificado: 'qualificado', aguardando_guilherme: 'esperando você', em_cascata: 'oferta aos corretores',
  atribuido: 'com corretor', direto: 'direto ao corretor', visita_agendada: 'visita agendada', arquivado: 'arquivado', encerrado: 'encerrado',
  aguardando_aceite: 'aguardando aceite', aceito_aguardando_email: 'aceito', email_enviado: 'aceito', recusado: 'recusado', cancelada: 'cancelado',
};
const COR: Record<string, string> = {
  lead: 'bg-blue-100 text-blue-800', contato: 'bg-slate-100 text-slate-700', captacao: 'bg-amber-100 text-amber-800',
  recrutamento: 'bg-violet-100 text-violet-800', referenciamento: 'bg-emerald-100 text-emerald-800',
  'corretor de fora': 'bg-orange-100 text-orange-800', 'corretor da Ville': 'bg-sky-100 text-sky-800', conversa: 'bg-slate-100 text-slate-600',
};
const ROTULO: Record<string, string> = { captacao: 'captação' };

export default async function BuscaSdr({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await exigirSdrGestao();
  const q = String((await searchParams).q ?? '').trim().slice(0, 80);
  const dig = q.replace(/\D/g, '');
  const valida = dig.length >= 4 || /[A-Za-zÀ-ÿ]{2,}/.test(q);

  let pessoas: Pessoa[] = [];
  let erro: string | null = null;
  if (q && valida) {
    const { data, error } = await supabaseAdmin().rpc('sdr_busca', { p_q: q });
    if (error) erro = error.message;
    const porTel = new Map<string, Pessoa>();
    for (const a of ((data ?? []) as Achado[])) {
      const k = a.tel.replace(/\D/g, '').slice(-8);
      let p = porTel.get(k);
      if (!p) { p = { tel: a.tel, nomes: [], fontes: new Set(), itens: [], ult: null }; porTel.set(k, p); }
      const nome = (a.nome ?? '').replace(/\s+/g, ' ').trim();
      if (nome && !p.nomes.some((n) => n.toLowerCase() === nome.toLowerCase())) p.nomes.push(nome);
      p.fontes.add(a.fonte);
      if (a.fonte !== 'conversa') p.itens.push(a);
      const t = a.ult_msg ?? a.quando;
      if (t && (!p.ult || t > p.ult)) p.ult = t;
      if (a.tel.replace(/\D/g, '').length > p.tel.replace(/\D/g, '').length) p.tel = a.tel;
    }
    pessoas = [...porTel.values()].sort((a, b) => (b.ult ?? '').localeCompare(a.ult ?? ''));
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/sdr" className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">← Funil do SDR</Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Buscar cliente</h1>
        <p className="mt-1 text-sm text-slate-600">Por nome ou telefone. Encontra leads, contatos da Eva, captação, recrutamento, referenciamentos e qualquer número que escreveu para a Eva.</p>

        <form action="/sdr/busca" method="get" className="mt-5 flex gap-2">
          <input name="q" defaultValue={q} autoFocus placeholder="Ex.: Debora ou 11 98181-2474"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none" />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Buscar</button>
        </form>

        {q && !valida && <p className="mt-4 text-sm text-slate-600">Digite pelo menos 2 letras do nome ou 4 dígitos do telefone.</p>}
        {erro && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui buscar: {erro}</div>}
        {q && valida && !erro && (
          <p className="mt-4 text-sm text-slate-500">{pessoas.length ? `${pessoas.length} pessoa${pessoas.length > 1 ? 's' : ''} encontrada${pessoas.length > 1 ? 's' : ''}` : 'Ninguém encontrado.'}</p>
        )}

        <ul className="mt-3 space-y-3">
          {pessoas.map((p) => {
            const lead = p.itens.find((i) => i.fonte === 'lead' && i.lead_id) ?? p.itens.find((i) => i.lead_id);
            const cap = p.itens.find((i) => i.cap_id);
            return (
              <li key={p.tel} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{p.nomes[0] ?? 'Sem nome'}{p.nomes.length > 1 && <span className="font-normal text-slate-500"> · {p.nomes.slice(1, 3).join(' · ')}</span>}</div>
                    {/* 08/11: lead que chegou sem telefone (ex.: só e-mail) não tem conversa no WhatsApp */}
                    <div className="text-sm text-slate-600">{p.tel.startsWith('sem-telefone') ? 'sem telefone' : telFmt(p.tel)}{p.ult && <> · última atividade {fmt.format(new Date(p.ult))}</>}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...p.fontes].map((f) => <span key={f} className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR[f] ?? 'bg-slate-100 text-slate-700'}`}>{ROTULO[f] ?? f}</span>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!p.tel.startsWith('sem-telefone') && <Link href={`/sdr/conversa/${p.tel.replace(/\D/g, '')}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">Conversa</Link>}
                    {lead?.lead_id && <Link href={`/sdr/lead/${lead.lead_id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Lead</Link>}
                    {cap?.cap_id && <Link href={`/sdr/captacao/${cap.cap_id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Captação</Link>}
                  </div>
                </div>
                {p.itens.some((i) => i.detalhe || i.status) && (
                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    {p.itens.filter((i) => i.fonte !== 'contato' && (i.detalhe || i.status)).slice(0, 4).map((i, n) => (
                      <li key={n}><span className="font-medium text-slate-700">{ROTULO[i.fonte] ?? i.fonte}:</span> {[i.detalhe, i.status ? (STATUS[i.status] ?? i.status) : null].filter(Boolean).join(' · ')}{i.quando && <> · {fmt.format(new Date(i.quando))}</>}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
