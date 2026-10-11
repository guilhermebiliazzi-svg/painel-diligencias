// "Meu funil" — o Funil do SDR do ponto de vista de um corretor (perfil Corretor,
// alcance "proprio"): só os leads da Eva oferecidos ou atribuídos a ele.
// Casa o corretor pelo telefone (últimos 8 dígitos), como o resto do SDR.
import Link from 'next/link';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { CorretorDaPessoa } from '@/lib/perfil';

const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const fmtValor = (v: number | null) =>
  v == null ? '—' : v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;

const PERIODOS = [
  { k: '30', rotulo: '30 dias' },
  { k: '90', rotulo: '90 dias' },
  { k: 'tudo', rotulo: 'Tudo' },
] as const;

// Os mesmos funis do Funil do SDR completo, só com os leads do corretor.
const FUNIS = [
  { k: 'comprador', rotulo: 'Comprador' },
  { k: 'locatario', rotulo: 'Locatário' },
  { k: 'prop_venda', rotulo: 'Proprietário (venda)' },
  { k: 'prop_locacao', rotulo: 'Proprietário (locação)' },
] as const;
type FunilK = (typeof FUNIS)[number]['k'];
// Etapas da captação de venda (a Eva registra com o captador pelo WhatsApp).
const ETAPAS_CAP = [
  { k: 'v1_agendada', rotulo: 'V1 agendada' },
  { k: 'v1_realizada', rotulo: 'V1 realizada' },
  { k: 'v2_agendada', rotulo: 'V2 agendada' },
  { k: 'v2_realizada', rotulo: 'V2 realizada' },
  { k: 'contrato_assinado', rotulo: 'Contrato assinado' },
] as const;
const tipoDoLead = (l: { fonte: string | null; intencao: string | null }): FunilK =>
  /^capta/i.test(String(l.fonte ?? ''))
    ? /^alug|^loca/i.test(String(l.intencao ?? '')) ? 'prop_locacao' : 'prop_venda'
    : /^alug|^loca/i.test(String(l.intencao ?? '')) ? 'locatario' : 'comprador';

const INTENCAO: Record<string, string> = {
  compra: 'Compra', aluguel: 'Aluguel', venda: 'Venda', locacao: 'Locação', alugar: 'Locação', vender: 'Venda',
};

type Atr = { lead_id: string; corretor_phone: string; resposta: string | null; oferecido_em: string | null; prazo_em: string | null; respondido_em: string | null };
type LeadMin = { id: string; telefone: string | null; nome: string | null; status: string; intencao: string | null; corretor_phone: string | null; atribuido_em: string | null; feito_em: string | null; created_at: string; fonte: string | null };
type Funil = { id: string; endereco: string | null; valor: number | null; visita_agendada: boolean; proposta: boolean };

// comoAdmin: o administrador vendo o funil de um corretor ("Ver como corretor").
export async function MeuFunil({ cor, nome, periodo, comoAdmin, seletor, funilK }: { cor: CorretorDaPessoa | null; nome: string; periodo: string; comoAdmin?: boolean; seletor?: React.ReactNode; funilK?: string }) {
  const p = PERIODOS.some((x) => x.k === periodo) ? periodo : '30';
  const fk: FunilK = FUNIS.some((x) => x.k === funilK) ? (funilK as FunilK) : 'comprador';
  // monta a URL desta tela mantendo período, funil e o corretor (visão do admin)
  const url = (o: { d?: string; f?: string }) =>
    `/sdr?d=${o.d ?? p}&f=${o.f ?? fk}` + (comoAdmin && cor ? `&c=${cor.id}` : '');
  let nivelCap = new Map<string, number>();
  const dias = p === 'tudo' ? null : Number(p);
  const desde = dias == null ? '1970-01-01T00:00:00Z' : new Date(Date.now() - dias * 864e5).toISOString();
  const k = fim8(cor?.phone);

  let atrs: Atr[] = [];
  let leads: LeadMin[] = [];
  let funil = new Map<string, Funil>();
  let erro: string | null = null;

  if (k.length === 8) {
    try {
      const sb = supabaseAdmin();
      const [{ data: a, error: e1 }, { data: l, error: e2 }] = await Promise.all([
        sb.from('sdr_atribuicoes').select('lead_id,corretor_phone,resposta,oferecido_em,prazo_em,respondido_em').ilike('corretor_phone', `%${k}`).gte('oferecido_em', desde).limit(2000),
        sb.from('sdr_leads').select('id,telefone,nome,status,intencao,corretor_phone,atribuido_em,feito_em,created_at,fonte').ilike('corretor_phone', `%${k}`).gte('created_at', desde).limit(2000),
      ]);
      if (e1 || e2) throw new Error((e1 || e2)!.message);
      atrs = ((a ?? []) as Atr[]).filter((x) => fim8(x.corretor_phone) === k);
      leads = ((l ?? []) as LeadMin[]).filter((x) => fim8(x.corretor_phone) === k);
      // leads oferecidos que ele não pegou (para contar na base e saber a resposta)
      const faltam = [...new Set(atrs.map((x) => x.lead_id))].filter((id) => !leads.some((x) => x.id === id));
      for (let i = 0; i < faltam.length; i += 300) {
        const { data } = await sb.from('sdr_leads').select('id,telefone,nome,status,intencao,corretor_phone,atribuido_em,feito_em,created_at,fonte').in('id', faltam.slice(i, i + 300));
        leads.push(...((data ?? []) as LeadMin[]));
      }
      // só os leads deste funil
      leads = leads.filter((x) => tipoDoLead(x) === fk);
      const doFunil = new Set(leads.map((x) => x.id));
      atrs = atrs.filter((x) => doFunil.has(x.lead_id));
      const ids = leads.map((x) => x.id);
      if (fk === 'prop_venda' && ids.length) {
        const { data: et } = await sb.from('sdr_captacao_etapas').select('lead_id,etapa').in('lead_id', ids.slice(0, 300));
        const m = new Map<string, number>();
        for (const e of (et ?? []) as { lead_id: string; etapa: string }[]) {
          const o = ETAPAS_CAP.findIndex((x) => x.k === e.etapa);
          if (o >= 0) m.set(e.lead_id, Math.max(m.get(e.lead_id) ?? -1, o));
        }
        nivelCap = m;
      }
      if (ids.length) {
        const { rows } = await pool.query<Funil>(
          `select id, endereco, valor, visita_agendada, proposta from public.v_painel_sdr_funil where id = any($1::uuid[])`,
          [ids]
        );
        funil = new Map(rows.map((r) => [r.id, { ...r, valor: r.valor == null ? null : Number(r.valor) }]));
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }

  // "Seus" = atribuídos a ele (ficou com o lead). "Ofertados" = recebeu a oferta ou ficou com o lead.
  const meus = leads.filter((l) => fim8(l.corretor_phone) === k && !!l.atribuido_em);
  const ofertados = new Set([...atrs.map((a) => a.lead_id), ...meus.map((l) => l.id)]);
  const noPrazo = (a: Atr) => {
    if (!a.respondido_em) return false;
    const lim = a.prazo_em ? new Date(a.prazo_em).getTime() : a.oferecido_em ? new Date(a.oferecido_em).getTime() + 15 * 60_000 : Infinity;
    return new Date(a.respondido_em).getTime() <= lim;
  };
  const meusIds = new Set(meus.map((l) => l.id));
  const recusou = new Set(atrs.filter((a) => a.resposta === 'nao' && noPrazo(a) && !meusIds.has(a.lead_id)).map((a) => a.lead_id));
  const semResposta = [...ofertados].filter((id) => !meusIds.has(id) && !recusou.has(id)).length;

  const contato = (l: LeadMin) => !!l.feito_em || !!funil.get(l.id)?.visita_agendada || !!funil.get(l.id)?.proposta;
  const visita = (l: LeadMin) => !!funil.get(l.id)?.visita_agendada || !!funil.get(l.id)?.proposta;
  const proposta = (l: LeadMin) => !!funil.get(l.id)?.proposta;
  const ehProp = fk === 'prop_venda' || fk === 'prop_locacao';
  const nivel = (l: LeadMin) => nivelCap.get(l.id) ?? -1;
  const etapas = [
    { rotulo: 'Ofertados a você', n: ofertados.size },
    { rotulo: 'Você aceitou', n: meus.length },
    { rotulo: 'Contato feito', n: meus.filter(ehProp ? (l: LeadMin) => !!l.feito_em || nivel(l) >= 0 : contato).length },
    ...(fk === 'prop_venda'
      ? ETAPAS_CAP.map((e, i) => ({ rotulo: e.rotulo, n: meus.filter((l) => nivel(l) >= i).length }))
      : fk === 'prop_locacao'
        ? []
        : [
            { rotulo: 'Visita agendada', n: meus.filter(visita).length },
            { rotulo: 'Proposta', n: meus.filter(proposta).length },
          ]),
  ];
  const topo = Math.max(etapas[0].n, 1);
  const lista = [...meus].sort((a, b) => (b.atribuido_em || b.created_at).localeCompare(a.atribuido_em || a.created_at));

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {comoAdmin ? (
              <Link href={`/sdr?d=${p}`} className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">← Funil completo</Link>
            ) : (
              <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">← Painel interno</Link>
            )}
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">{comoAdmin ? `Funil de ${nome}` : 'Meu funil'}</h1>
            <p className="mt-1 text-sm text-slate-600">{comoAdmin ? `Exatamente o que ${nome} vê em “Meu funil”.` : `Os leads da Eva oferecidos a você, ${nome}.`}</p>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODOS.map((x) => (
              <Link key={x.k} href={url({ d: x.k })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${x.k === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {x.rotulo}
              </Link>
            ))}
          </nav>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {FUNIS.map((x) => (
              <Link key={x.k} href={url({ f: x.k })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${x.k === fk ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {x.rotulo}
              </Link>
            ))}
          </nav>
          {seletor}
        </div>

        {k.length !== 8 ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Não achei seu telefone no cadastro de corretores (pelo e-mail com que você entrou). Fale com o administrador.
          </div>
        ) : erro ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui ler os dados: {erro}</div>
        ) : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi rotulo="Ofertados" valor={ofertados.size} />
              <Kpi rotulo="Aceitos" valor={meus.length} sub={`${pct(meus.length, ofertados.size)}% das ofertas`} />
              <Kpi rotulo="Recusados" valor={recusou.size} />
              <Kpi rotulo="Sem resposta" valor={semResposta} sub="no prazo de 15 min" />
            </section>

            <section style={{ backgroundColor: '#ffffff' }} className="mt-6 rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Funil</h2>
              <ol className="mt-4 space-y-3">
                {etapas.map((e, i) => (
                  <li key={e.rotulo}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-700">{e.rotulo}</span>
                      <span className="tabular-nums text-slate-900">
                        <strong>{e.n}</strong>
                        {i > 0 && <span className="ml-2 text-xs text-slate-500">{pct(e.n, etapas[0].n)}%</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${Math.max((e.n / topo) * 100, e.n ? 2 : 0)}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-slate-500">{ehProp ? 'Contato feito e as etapas da captação contam o que você registrou com a Eva pelo WhatsApp.' : 'Contato feito, visita e proposta contam o que você registrou com a Eva pelo WhatsApp.'}</p>
            </section>

            <section style={{ backgroundColor: '#ffffff' }} className="mt-4 rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">Seus leads ({lista.length})</h2>
              {lista.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Nenhum lead com você no período.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Aceito em</th>
                        <th className="py-2 pr-3 font-medium">Lead</th>
                        <th className="py-2 pr-3 font-medium">Interesse</th>
                        <th className="py-2 pr-3 font-medium">Imóvel</th>
                        <th className="py-2 font-medium">Andamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lista.map((l) => {
                        const f = funil.get(l.id);
                        const nv = nivel(l);
                        const andamento = ehProp
                          ? nv >= 0 ? ETAPAS_CAP[nv].rotulo : l.feito_em ? 'Contato feito' : 'Aguardando contato'
                          : proposta(l) ? 'Proposta' : visita(l) ? 'Visita agendada' : contato(l) ? 'Contato feito' : 'Aguardando contato';
                        const tom = (ehProp ? nv >= 0 : proposta(l) || visita(l)) ? 'bg-emerald-100 text-emerald-700' : (ehProp ? !!l.feito_em : contato(l)) ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
                        return (
                          <tr key={l.id}>
                            <td className="whitespace-nowrap py-2 pr-3 text-slate-600">{fmtData.format(new Date(l.atribuido_em || l.created_at))}</td>
                            <td className="py-2 pr-3">
                              <span className="font-medium text-slate-900">{l.nome || '—'}</span>
                              {l.telefone && (
                                <a href={`https://wa.me/${String(l.telefone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-600 hover:underline">
                                  {l.telefone}
                                </a>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-slate-600">{INTENCAO[l.intencao ?? ''] ?? (l.intencao || '—')}</td>
                            <td className="py-2 pr-3 text-slate-600">
                              {f?.endereco || '—'}
                              {f?.valor != null && <span className="block text-xs text-slate-500">{fmtValor(f.valor)}</span>}
                            </td>
                            <td className="py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tom}`}>{andamento}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <footer className="mt-10 text-center text-xs text-slate-400">Dados do SDR da Eva · atualizados a cada acesso</footer>
      </main>
    </div>
  );
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string | number; sub?: string }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
