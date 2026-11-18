// 18/11: Minha carteira — imóveis de venda representados por cada corretor (vindos do iList, todo dia às
// 6h40), com o prazo do contrato, o checklist de comercialização, a próxima atividade e os leads do imóvel.
// O corretor vê os dele; a gestão vê todos e filtra por corretor.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acessoCarteira, COLS_IMOVEL, enderecoCurto, hojeSP, brl, dataBR, type ImovelCarteira } from '@/lib/carteira';
import { CHECKLIST, CHECKLIST_K, CLASSES, rotuloTipo, situacaoContrato } from '@/lib/carteira-tipos';

export const metadata = { title: 'Carteira — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

type SP = { cor?: string; sit?: string; tipo?: string; q?: string };
// fora do componente (regra de pureza do React): instantes relativos a agora
const haDias = (d: number) => new Date(Date.now() - d * 864e5).toISOString();
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtQuando = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default async function Carteira({ searchParams }: { searchParams: Promise<SP> }) {
  const { gestao, eu } = await acessoCarteira();
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const hoje = hojeSP();

  const { data: cors } = await sb.from('corretores_associados').select('id,nome,status').order('nome');
  const corretores = ((cors ?? []) as { id: number; nome: string; status: string | null }[]).map((c) => ({ id: c.id, nome: String(c.nome).split(' - ')[0] }));
  const corSel = gestao ? Number(sp.cor) || null : eu?.id ?? -1;

  let q = sb.from('carteira_imoveis').select(COLS_IMOVEL).eq('ativo', true).eq('transacao', 'venda').order('contrato_fim', { ascending: true, nullsFirst: false }).limit(1000);
  if (corSel) q = q.eq('corretor_id', corSel);
  const { data } = await q;
  let imoveis = (data ?? []) as ImovelCarteira[];

  const ids = imoveis.map((i) => i.id);
  const mls = imoveis.map((i) => i.ilist_listing_id).filter(Boolean) as string[];
  const [{ data: ats }, { data: leads }, { data: fotos }] = await Promise.all([
    ids.length ? sb.from('carteira_atividades').select('imovel_id,tipo,quando,feito_em').in('imovel_id', ids).is('cancelado_em', null).limit(20000) : Promise.resolve({ data: [] }),
    mls.length ? sb.from('sdr_leads').select('imovel_anuncio_ref,created_at').in('imovel_anuncio_ref', mls).gte('created_at', haDias(90)).limit(5000) : Promise.resolve({ data: [] }),
    sb.from('feed_imoveis_site').select('url,imagem').like('url', '%601241%').limit(3000),
  ]);
  const feitos = new Map<number, Set<string>>();
  const prox = new Map<number, { tipo: string; quando: string }>();
  for (const a of (ats ?? []) as { imovel_id: number; tipo: string; quando: string | null; feito_em: string | null }[]) {
    if (a.feito_em && CHECKLIST_K.has(a.tipo)) (feitos.get(a.imovel_id) ?? feitos.set(a.imovel_id, new Set()).get(a.imovel_id)!).add(a.tipo);
    if (!a.feito_em && a.quando && a.quando >= haDias(1)) {
      const p = prox.get(a.imovel_id);
      if (!p || a.quando < p.quando) prox.set(a.imovel_id, { tipo: a.tipo, quando: a.quando });
    }
  }
  const nLeads = new Map<string, number>();
  for (const l of (leads ?? []) as { imovel_anuncio_ref: string }[]) nLeads.set(l.imovel_anuncio_ref, (nLeads.get(l.imovel_anuncio_ref) ?? 0) + 1);
  const foto = new Map<string, { url: string; imagem: string | null }>();
  for (const f of (fotos ?? []) as { url: string; imagem: string | null }[]) {
    const m = f.url.match(/(601241\d{3})(\d+)(?:[/?#]|$)/);
    if (m) foto.set(`${m[1]}-${m[2]}`, f);
  }

  // indicadores (antes dos filtros de situação/tipo/busca)
  const sit = (i: ImovelCarteira) => situacaoContrato(i.contrato_fim, hoje);
  const kpi = {
    total: imoveis.length,
    exclusivos: imoveis.filter((i) => i.contrato_tipo === 'exclusivo').length,
    vencidos: imoveis.filter((i) => sit(i).k === 'vencido').length,
    vencem: imoveis.filter((i) => sit(i).k === 'vence').length,
    checklist: imoveis.length ? Math.round((imoveis.reduce((s, i) => s + (feitos.get(i.id)?.size ?? 0), 0) / (imoveis.length * CHECKLIST.length)) * 100) : 0,
  };

  if (sp.sit && ['vencido', 'vence', 'ok'].includes(sp.sit)) imoveis = imoveis.filter((i) => sit(i).k === sp.sit);
  if (sp.tipo === 'exclusivo' || sp.tipo === 'aberto') imoveis = imoveis.filter((i) => i.contrato_tipo === sp.tipo);
  const busca = sem(String(sp.q ?? '').trim());
  if (busca) imoveis = imoveis.filter((i) => sem([i.ilist_listing_id, i.titulo, i.logradouro, i.numero, i.bairro, i.ilist_agent_nome].join(' ')).includes(busca));

  const nomeCor = (id: number | null) => corretores.find((c) => c.id === id)?.nome ?? '—';
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const m = { ...sp, ...patch };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, String(v));
    const s = p.toString();
    return '/carteira' + (s ? '?' + s : '');
  };
  const chip = (ativo: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${ativo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">{gestao && !corSel ? 'Carteira da equipe' : 'Minha carteira'}</h1>
        <p className="mt-1 text-sm text-slate-600">Imóveis de venda com contrato de representação, vindos do iList (atualizados todo dia de manhã).</p>

        {!gestao && !eu && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Seu usuário não está ligado a um cadastro de corretor. Fale com o administrador.</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi rotulo="Imóveis" valor={kpi.total} />
          <Kpi rotulo="Exclusivos" valor={kpi.exclusivos} />
          <Kpi rotulo="Contrato vencido" valor={kpi.vencidos} alerta={kpi.vencidos > 0} />
          <Kpi rotulo="Vencem em 60 dias" valor={kpi.vencem} />
          <Kpi rotulo="Checklist feito" valor={kpi.checklist + '%'} />
        </div>

        <form className="mt-5 flex flex-wrap items-center gap-2" action="/carteira">
          {gestao && (
            <select name="cor" defaultValue={corSel ?? ''} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="">Todos os corretores</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar código, rua, bairro…" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
          {sp.sit && <input type="hidden" name="sit" value={sp.sit} />}
          {sp.tipo && <input type="hidden" name="tipo" value={sp.tipo} />}
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">Filtrar</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={link({ sit: undefined })} className={chip(!sp.sit)}>Todos</Link>
          <Link href={link({ sit: 'vencido' })} className={chip(sp.sit === 'vencido')}>Contrato vencido</Link>
          <Link href={link({ sit: 'vence' })} className={chip(sp.sit === 'vence')}>Vence em 60 dias</Link>
          <Link href={link({ sit: 'ok' })} className={chip(sp.sit === 'ok')}>Em vigor</Link>
          <span className="mx-1 w-px bg-slate-200" />
          <Link href={link({ tipo: sp.tipo === 'exclusivo' ? undefined : 'exclusivo' })} className={chip(sp.tipo === 'exclusivo')}>Exclusivos</Link>
          <Link href={link({ tipo: sp.tipo === 'aberto' ? undefined : 'aberto' })} className={chip(sp.tipo === 'aberto')}>Abertos</Link>
        </div>

        <ul className="mt-5 space-y-3">
          {imoveis.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhum imóvel com esses filtros.</li>}
          {imoveis.map((i) => {
            const s = sit(i);
            const f = feitos.get(i.id)?.size ?? 0;
            const pr = prox.get(i.id);
            const cl = CLASSES.find((c) => c.k === i.classificacao);
            const ft = i.ilist_listing_id ? foto.get(i.ilist_listing_id) : undefined;
            const nl = i.ilist_listing_id ? nLeads.get(i.ilist_listing_id) ?? 0 : 0;
            return (
              <li key={i.id}>
                <Link href={`/carteira/${i.id}`} style={{ backgroundColor: '#ffffff' }} className="flex gap-3 rounded-xl border border-slate-200 p-3 shadow-sm hover:border-slate-400">
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-24 sm:w-32">
                    {ft?.imagem && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ft.imagem} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cor}`}>{s.t}</span>
                      {i.contrato_tipo && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">{i.contrato_tipo === 'exclusivo' ? 'Exclusivo' : 'Aberto'}</span>}
                      {cl && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cl.cor}`}>{cl.k}</span>}
                      <span className="text-xs text-slate-400">{i.ilist_listing_id}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{enderecoCurto(i) || i.titulo || 'Imóvel'}</p>
                    <p className="text-xs text-slate-500">
                      {[i.bairro, i.area_m2 ? `${Math.round(i.area_m2)} m²` : '', i.dorms ? `${i.dorms} dorm.` : '', brl(i.valor)].filter(Boolean).join(' · ')}
                      {gestao && !corSel ? ` · ${nomeCor(i.corretor_id)}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                          <span className="block h-full bg-emerald-500" style={{ width: `${Math.round((f / CHECKLIST.length) * 100)}%` }} />
                        </span>
                        checklist {f}/{CHECKLIST.length}
                      </span>
                      <span>contrato até {dataBR(i.contrato_fim)}</span>
                      {pr && <span className="font-semibold text-slate-800">próx.: {rotuloTipo(pr.tipo)} · {fmtQuando(pr.quando)}</span>}
                      {nl > 0 && <span>{nl} {nl === 1 ? 'lead' : 'leads'} em 90 dias</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: string | number; alerta?: boolean }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alerta ? 'text-red-600' : 'text-slate-900'}`}>{valor}</p>
    </div>
  );
}
