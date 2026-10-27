// Corretores de fora com quem a Eva falou (27/10): quem escreveu por conta própria (sdr_contatos_profissionais),
// quem chegou pelo Órulo (orulo_sessoes) e quem recebeu consulta de disponibilidade (sdr_imoveis_lead).
// Cada linha leva à conversa completa, onde dá para responder pela Eva.
import Link from 'next/link';
import { exigirSdrGestao } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Corretores de fora — SDR REMAX Ville' };

const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const telFmt = (t: string) => { const d = t.replace(/\D/g, '').replace(/^55/, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : t; };
const fim8 = (t: string) => t.replace(/\D/g, '').slice(-8);

type Linha = { tel: string; nome: string | null; origens: Set<string>; ultimo: number; primeira: string | null; imovel: string | null };

export default async function CorretoresDeFora() {
  await exigirSdrGestao();
  const sb = supabaseAdmin();
  const desde = new Date(Date.now() - 60 * 864e5).toISOString();
  const [{ data: prof }, { data: oru }, { data: cons }, { data: cors }] = await Promise.all([
    sb.from('sdr_contatos_profissionais').select('telefone,nome,primeira_msg,imovel_codigo,criado_em,ultimo_em').order('ultimo_em', { ascending: false }).limit(300),
    sb.from('orulo_sessoes').select('phone,nome_parceiro,ultimo_codigo,criado_em,atualizado_em').order('atualizado_em', { ascending: false }).limit(300),
    sb.from('sdr_imoveis_lead').select('parceiro_telefone,parceiro_nome,ref,endereco,created_at,parceiro_origem').not('parceiro_telefone', 'is', null).gte('created_at', desde).order('created_at', { ascending: false }).limit(600),
    sb.from('corretores_associados').select('phone'),
  ]);
  const daVille = new Set(((cors ?? []) as { phone: string | null }[]).map((c) => fim8(c.phone || '')).filter(Boolean));
  const m = new Map<string, Linha>();
  const add = (tel: string, nome: string | null, origem: string, quando: string | null, primeira: string | null, imovel: string | null) => {
    const k = fim8(tel); if (k.length < 8 || daVille.has(k)) return;
    const t = quando ? new Date(quando).getTime() : 0;
    const l = m.get(k) ?? { tel, nome: null, origens: new Set<string>(), ultimo: 0, primeira: null, imovel: null };
    l.nome = l.nome || nome; l.origens.add(origem); l.primeira = l.primeira || primeira; l.imovel = l.imovel || imovel;
    if (t > l.ultimo) l.ultimo = t;
    m.set(k, l);
  };
  for (const p of (prof ?? []) as { telefone: string; nome: string | null; primeira_msg: string | null; imovel_codigo: string | null; ultimo_em: string | null; criado_em: string }[])
    add(p.telefone, p.nome, 'escreveu para a Eva', p.ultimo_em || p.criado_em, p.primeira_msg, p.imovel_codigo);
  for (const o of (oru ?? []) as { phone: string; nome_parceiro: string | null; ultimo_codigo: string | null; atualizado_em: string | null; criado_em: string }[])
    add(o.phone, o.nome_parceiro, 'Órulo', o.atualizado_em || o.criado_em, null, o.ultimo_codigo);
  for (const c of (cons ?? []) as { parceiro_telefone: string; parceiro_nome: string | null; ref: string | null; endereco: string | null; created_at: string; parceiro_origem: string | null }[]) {
    if (['ville', 'proprietario', 'pulado'].includes(c.parceiro_origem ?? '')) continue;
    add(c.parceiro_telefone, c.parceiro_nome, 'consulta de disponibilidade', c.created_at, null, c.endereco || c.ref);
  }
  const linhas = [...m.values()].sort((a, b) => b.ultimo - a.ultimo);

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/sdr" className="text-sm text-blue-700 underline">← Funil do SDR</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Corretores de fora</h1>
        <p className="mt-1 text-sm text-slate-600">Corretores de outras imobiliárias e unidades com quem a Eva falou. Abra a conversa para ler tudo e responder pela Eva.</p>
        <section style={{ backgroundColor: '#ffffff' }} className="mt-6 rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">{linhas.length} corretores</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {linhas.map((l) => (
              <li key={l.tel} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-slate-900">{l.nome || 'Corretor(a)'}</span>
                  <span className="text-slate-600"> · {telFmt(l.tel)}{l.ultimo ? ' · ' + fmt.format(new Date(l.ultimo)) : ''}</span>
                  <p className="text-xs text-slate-500">{[...l.origens].join(' · ')}{l.imovel ? ' · imóvel: ' + l.imovel : ''}</p>
                  {l.primeira && <p className="mt-0.5 break-words text-xs text-slate-600">“{l.primeira.slice(0, 200)}”</p>}
                </div>
                <Link href={'/sdr/conversa/' + l.tel.replace(/\D/g, '')} className="rounded-lg border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">Conversa e responder</Link>
              </li>
            ))}
            {!linhas.length && <li className="py-2 text-sm text-slate-500">Nenhum corretor de fora ainda.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}
