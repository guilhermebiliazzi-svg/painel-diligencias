// Funil do SDR (Eva) — 5 funis: comprador, locatário, proprietário (venda),
// proprietário (locação) e recrutamento. Só admin.
// Clientes: view public.v_painel_sdr_funil (role painel_looker) + feito_em/origem do sdr_leads.
// Proprietários: captacao_leads (landing Anuncie na REMAX) + o lead criado quando a fila é definida.
// Recrutamento: recrutamento_leads (landing Seja REMAX).

import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import FunilSelect from './funil-select';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Funil do SDR — REMAX Ville' };

type Lead = {
  id: string;
  created_at: string;
  nome: string | null;
  fonte: string;
  status: string;
  intencao: string | null;
  temperatura: string | null;
  endereco: string | null;
  valor: number | null;
  direto: boolean;
  respondeu: boolean;
  qualificado: boolean;
  cartao_enviado_em: string | null;
  atribuido_em: string | null;
  arquivado: boolean;
  motivo_arquivamento: string | null;
  corretor: string | null;
  visita_agendada: boolean;
  proposta: boolean;
  min_ate_cartao: number | null;
  min_ate_atribuicao: number | null;
  feito: boolean;
  referenciado: boolean;
  corretor_phone: string | null;
};

type Etapa = { rotulo: string; n: number };

const PERIODOS = [
  { k: '7', rotulo: '7 dias' },
  { k: '30', rotulo: '30 dias' },
  { k: '90', rotulo: '90 dias' },
  { k: 'tudo', rotulo: 'Tudo' },
] as const;

const FUNIS = [
  { k: 'comprador', rotulo: 'Comprador' },
  { k: 'locatario', rotulo: 'Locatário' },
  { k: 'prop_venda', rotulo: 'Proprietário (venda)' },
  { k: 'prop_locacao', rotulo: 'Proprietário (locação)' },
  { k: 'recrutamento', rotulo: 'Recrutamento' },
] as const;
type FunilK = (typeof FUNIS)[number]['k'];

const STATUS_ROTULO: Record<string, string> = {
  direto: 'Direto ao gestor',
  atribuido: 'Atribuído',
  arquivado: 'Arquivado',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_guilherme: 'Aguardando você',
  em_cascata: 'Ofertando',
  em_qualificacao: 'Qualificando',
  visita_agendada: 'Visita agendada',
  encerrado: 'Encerrado',
};

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const fmtValor = (v: number | null) =>
  v == null ? '—' : v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
    : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);

function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => x != null && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}
function fmtMin(m: number | null) {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.round(h / 24)} dias`;
}
const desde = (dias: number | null) => (dias == null ? '1970-01-01T00:00:00Z' : new Date(Date.now() - dias * 864e5).toISOString());

// ---------- carga ----------
async function carregarClientes(dias: number | null): Promise<Lead[]> {
  const { rows } = await pool.query<Lead>(
    `select * from public.v_painel_sdr_funil
      where ($1::int is null or created_at >= now() - make_interval(days => $1::int))
      order by created_at desc`,
    [dias]
  );
  const ids = rows.map((r) => r.id);
  const extra = new Map<string, { feito_em: string | null; origem: string | null; motivo: string | null; corretor_phone: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabaseAdmin().from('sdr_leads').select('id,feito_em,origem,motivo_arquivamento,corretor_phone').in('id', ids.slice(i, i + 300));
    for (const d of (data ?? []) as { id: string; feito_em: string | null; origem: string | null; motivo_arquivamento: string | null; corretor_phone: string | null }[])
      extra.set(d.id, { feito_em: d.feito_em, origem: d.origem, motivo: d.motivo_arquivamento, corretor_phone: d.corretor_phone });
  }
  return rows
    .filter((r) => extra.get(r.id)?.origem !== 'campanha' && !/^capta/i.test(r.fonte))
    .map((r) => ({
      ...r,
      valor: r.valor == null ? null : Number(r.valor),
      feito: !!extra.get(r.id)?.feito_em,
      corretor_phone: extra.get(r.id)?.corretor_phone ?? null,
      referenciado: /referenciad/i.test(extra.get(r.id)?.motivo ?? r.motivo_arquivamento ?? ''),
    }));
}

type Captacao = { id: string; criado_em: string; evento: string; nome: string | null; telefone: string | null; intencao: string | null; tipo: string | null; bairro: string | null; endereco: string | null; canal?: string };
type LeadCap = { id: string; telefone: string; status: string; intencao: string | null; corretor_phone: string | null; atribuido_em: string | null; feito_em: string | null; fila_corretores: string[] | null; created_at: string;
  nome: string | null; fonte: string | null; tipologia: string | null; bairros: string[] | null; imovel_anuncio_endereco: string | null };
type EtapaCap = { lead_id: string; etapa: string; quando: string | null; created_at: string };
// Etapas da captação de venda (a Eva registra com o captador pelo WhatsApp). Só venda: locação não tem V1/V2.
const ETAPAS_CAP = [
  { k: 'v1_agendada', rotulo: 'V1 agendada' },
  { k: 'v1_realizada', rotulo: 'V1 realizada' },
  { k: 'v2_agendada', rotulo: 'V2 agendada' },
  { k: 'v2_realizada', rotulo: 'V2 realizada' },
  { k: 'contrato_assinado', rotulo: 'Contrato assinado' },
] as const;
const ordemCap = (k: string) => ETAPAS_CAP.findIndex((e) => e.k === k);

async function carregarCaptacao(dias: number | null) {
  const sb = supabaseAdmin();
  const [{ data: cap }, { data: lds }, { data: cors }] = await Promise.all([
    sb.from('captacao_leads').select('id,criado_em,evento,nome,telefone,intencao,tipo,bairro,endereco').gte('criado_em', desde(dias)).order('criado_em', { ascending: false }).limit(2000),
    sb.from('sdr_leads').select('id,telefone,status,intencao,corretor_phone,atribuido_em,feito_em,fila_corretores,created_at,nome,fonte,tipologia,bairros,imovel_anuncio_endereco').ilike('fonte', 'Capta%').gte('created_at', desde(dias === null ? null : dias + 2)),
    sb.from('corretores_associados').select('phone,nome,apelido'),
  ]);
  const nomeCor = new Map(((cors ?? []) as { phone: string | null; nome: string; apelido: string | null }[]).map((c) => [fim8(c.phone), c.apelido?.trim() || c.nome.split(' ')[0]]));
  const ids = ((lds ?? []) as LeadCap[]).map((l) => l.id);
  const etapas: EtapaCap[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('sdr_captacao_etapas').select('lead_id,etapa,quando,created_at').in('lead_id', ids.slice(i, i + 300)).order('created_at');
    etapas.push(...((data ?? []) as EtapaCap[]));
  }
  return { cap: (cap ?? []) as Captacao[], leads: (lds ?? []) as LeadCap[], nomeCor, etapas };
}

type Recrut = { id: string; criado_em: string; evento: string; nome: string | null; telefone: string | null; momento: string | null; bairro: string | null; c2s_lead_id: string | null; payload: Record<string, unknown> | null };
async function carregarRecrutamento(dias: number | null) {
  const { data } = await supabaseAdmin().from('recrutamento_leads').select('id,criado_em,evento,nome,telefone,momento,bairro,c2s_lead_id,payload').gte('criado_em', desde(dias)).order('criado_em', { ascending: false }).limit(3000);
  return (data ?? []) as Recrut[];
}

// ---------- UI ----------
function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string | number; sub?: string }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Funil({ etapas, nota }: { etapas: Etapa[]; nota?: string }) {
  const topo = Math.max(etapas[0]?.n ?? 0, 1);
  return (
    <>
      <ol className="space-y-3">
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
      {nota && <p className="mt-4 text-xs text-slate-500">{nota}</p>}
    </>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: [string, number][] }) {
  return (
    <Secao titulo={titulo}>
      {itens.length === 0 ? (
        <p className="text-sm text-slate-500">Nada no período.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {itens.map(([m, n]) => (
            <li key={m} className="flex justify-between gap-3">
              <span className="min-w-0 break-words text-slate-700">{m}</span>
              <span className="tabular-nums font-medium text-slate-900">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

function Selo({ texto, tom }: { texto: string; tom: 'verde' | 'cinza' | 'roxo' | 'ambar' | 'azul' }) {
  const c = { verde: 'bg-emerald-100 text-emerald-700', cinza: 'bg-slate-100 text-slate-600', roxo: 'bg-violet-100 text-violet-700', ambar: 'bg-amber-100 text-amber-700', azul: 'bg-blue-100 text-blue-700' }[tom];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{texto}</span>;
}

const contar = <T,>(xs: T[], f: (x: T) => string) =>
  Object.entries(xs.reduce<Record<string, number>>((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);

// ---------- funis de cliente (comprador / locatário) ----------
async function FunilCliente({ dias, intencao }: { dias: number | null; intencao: 'compra' | 'aluguel' }) {
  const todos = await carregarClientes(dias);
  const leads = todos.filter((l) => l.intencao === intencao);
  const diretos = leads.filter((l) => l.direto);
  const sdr = leads.filter((l) => !l.direto);
  const referenciados = sdr.filter((l) => l.referenciado);
  // Funil sequencial: cada etapa conta só quem passou por todas as anteriores.
  // "Corretor assumiu" = lead com corretor atribuído (o mesmo critério da tabela de aceite).
  const assumiu = (l: Lead) => !!l.atribuido_em && !!l.corretor_phone;
  const cartao = (l: Lead) => !!l.cartao_enviado_em || assumiu(l);
  const contato = (l: Lead) => assumiu(l) && (l.feito || l.visita_agendada || l.proposta);
  const visita = (l: Lead) => assumiu(l) && (l.visita_agendada || l.proposta);
  const etapas: Etapa[] = [
    { rotulo: 'Entraram no SDR', n: sdr.length },
    { rotulo: 'Cartão enviado a você', n: sdr.filter(cartao).length },
    { rotulo: 'Corretor assumiu', n: sdr.filter(assumiu).length },
    { rotulo: 'Contato feito', n: sdr.filter(contato).length },
    { rotulo: 'Visita agendada', n: sdr.filter(visita).length },
    { rotulo: 'Proposta', n: sdr.filter((l) => assumiu(l) && l.proposta).length },
  ];
  const responderam = sdr.filter((l) => l.respondeu).length;
  const qualificados = sdr.filter((l) => l.qualificado).length;

  // Aceite por corretor: uma linha por lead oferecido a cada corretor (reoferta ao mesmo corretor conta uma vez).
  // Aceitou = ficou com o lead. Recusou = disse não dentro dos 15 min. Resposta depois do prazo (sim ou não) = sem resposta.
  const ids = sdr.map((l) => l.id);
  const aceites: Record<string, { ofertas: number; sim: number; nao: number; sem: number; tarde: number }> = {};
  if (ids.length) {
    const sb = supabaseAdmin();
    const [{ data: atr }, { data: cors }] = await Promise.all([
      sb.from('sdr_atribuicoes').select('lead_id,corretor_phone,resposta,oferecido_em,prazo_em,respondido_em').in('lead_id', ids.slice(0, 600)),
      sb.from('corretores_associados').select('phone,nome,apelido'),
    ]);
    const nomeCor = new Map(((cors ?? []) as { phone: string | null; nome: string; apelido: string | null }[]).map((c) => [fim8(c.phone), c.apelido?.trim() || c.nome.split(' ')[0]]));
    type Atr = { lead_id: string; corretor_phone: string; resposta: string | null; oferecido_em: string | null; prazo_em: string | null; respondido_em: string | null };
    const noPrazo = (a: Atr) => {
      if (!a.respondido_em) return false;
      const lim = a.prazo_em ? new Date(a.prazo_em).getTime() : a.oferecido_em ? new Date(a.oferecido_em).getTime() + 15 * 60_000 : Infinity;
      return new Date(a.respondido_em).getTime() <= lim;
    };
    const porLead = new Map(sdr.map((l) => [l.id, l]));
    const pares = new Map<string, { k: string; lead: Lead; recusou: boolean; tarde: boolean }>();
    for (const a of (atr ?? []) as Atr[]) {
      const lead = porLead.get(a.lead_id);
      if (!lead) continue;
      const k = fim8(a.corretor_phone);
      const chave = a.lead_id + ':' + k;
      const p = pares.get(chave) ?? { k, lead, recusou: false, tarde: false };
      if (a.resposta === 'nao' && noPrazo(a)) p.recusou = true;
      if ((a.resposta === 'sim' || a.resposta === 'sim_atrasado') && !noPrazo(a)) p.tarde = true;
      pares.set(chave, p);
    }
    // quem ficou com o lead sem ter passado pela cascata (atribuição direta) também conta como oferta aceita
    for (const l of sdr.filter(assumiu)) {
      const chave = l.id + ':' + fim8(l.corretor_phone);
      if (!pares.has(chave)) pares.set(chave, { k: fim8(l.corretor_phone), lead: l, recusou: false, tarde: false });
    }
    for (const p of pares.values()) {
      const nome = nomeCor.get(p.k) ?? '…' + p.k.slice(-4);
      const r = (aceites[nome] ??= { ofertas: 0, sim: 0, nao: 0, sem: 0, tarde: 0 });
      r.ofertas++;
      if (assumiu(p.lead) && fim8(p.lead.corretor_phone) === p.k) r.sim++;
      else if (p.recusou) r.nao++;
      else { r.sem++; if (p.tarde) r.tarde++; }
    }
  }
  const tabAceite = Object.entries(aceites).sort((a, b) => b[1].ofertas - a[1].ofertas);
  const medCartao = mediana(sdr.map((l) => l.min_ate_cartao!).filter((x) => x != null));
  const medAtrib = mediana(sdr.map((l) => l.min_ate_atribuicao!).filter((x) => x != null));
  const motivos = contar(sdr.filter((l) => l.arquivado), (l) => (l.motivo_arquivamento || 'sem motivo').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+—.*$/, '').trim());

  return (
    <>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Leads recebidos" valor={leads.length} sub={`${diretos.length} direto ao gestor · ${sdr.length} no SDR`} />
        <Kpi rotulo="Corretor assumiu" valor={etapas[2].n} sub={`${pct(etapas[2].n, sdr.length)}% dos que entraram no SDR`} />
        <Kpi rotulo="Referenciados" valor={referenciados.length} sub="para outras unidades REMAX" />
        <Kpi rotulo="Tempo até assumir" valor={fmtMin(medAtrib)} sub={`mediana · cartão em ${fmtMin(medCartao)}`} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Secao titulo={`Funil — ${intencao === 'compra' ? 'compradores' : 'locatários'} no SDR`}>
            <Funil etapas={etapas} nota={'Cada etapa conta só quem passou pelas anteriores. Leads da carteira Ville vão direto ao gestor e ficam fora do funil (estão no total). Referenciados contam até "cartão enviado" e saem do funil aí.'} />
            <p className="mt-3 text-sm text-slate-600">
              Fora do funil: <strong className="tabular-nums text-slate-900">{responderam}</strong> responderam à Eva · <strong className="tabular-nums text-slate-900">{qualificados}</strong> qualificados (de {sdr.length}).
              <span className="block text-xs text-slate-500">Há quem receba cartão sem responder à Eva (o portal já manda o que ele procura).</span>
            </p>
          </Secao>
        </div>
        <div className="lg:col-span-2">
          <Lista titulo="Arquivados por motivo" itens={motivos} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Lista titulo="Por fonte" itens={contar(leads, (l) => l.fonte)} />
        <Secao titulo="Aceite por corretor (ofertas no período)">
          <p className="-mt-2 mb-3 text-xs text-slate-500">Aceitou = ficou com o lead (soma igual a &quot;Corretor assumiu&quot;). Resposta depois dos 15 min conta como sem resposta; &quot;Aceitou tarde&quot; mostra quantos desses disseram sim fora do prazo (já incluídos em sem resposta).</p>
          {tabAceite.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma oferta no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Corretor</th>
                  <th className="pb-2 text-right font-medium">Ofertas</th>
                  <th className="pb-2 text-right font-medium">Aceitou</th>
                  <th className="pb-2 text-right font-medium">Recusou</th>
                  <th className="pb-2 text-right font-medium">Sem resp.</th>
                  <th className="pb-2 text-right font-medium">Aceitou tarde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tabAceite.map(([n, r]) => (
                  <tr key={n}>
                    <td className="py-1.5 text-slate-700">{n}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium">{r.ofertas}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-700">{r.sim}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{r.nao}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">{r.sem}</td>
                    <td className="py-1.5 text-right tabular-nums text-amber-700">{r.tarde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>
      </div>

      <div className="mt-4">
        <Secao titulo={`Leads do período (${leads.length})`}>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Chegou</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Fonte</th>
                  <th className="pb-2 font-medium">Imóvel</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Corretor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="whitespace-nowrap py-2 tabular-nums text-slate-600">{fmtData.format(new Date(l.created_at))}</td>
                    <td className="py-2">
                      <Link href={`/sdr/lead/${l.id}`} className="text-blue-700 underline">{l.nome || '—'}</Link>
                      {l.temperatura && <span className="ml-1 text-xs text-slate-500">· {l.temperatura}</span>}
                    </td>
                    <td className="py-2 text-slate-600">{l.fonte}</td>
                    <td className="py-2 text-slate-600">
                      {l.endereco || '—'}
                      {l.valor != null && <span className="block text-xs text-slate-500">{fmtValor(l.valor)}</span>}
                    </td>
                    <td className="py-2">
                      <Selo
                        texto={l.referenciado ? 'Referenciado' : STATUS_ROTULO[l.status] ?? l.status}
                        tom={l.referenciado ? 'azul' : l.status === 'atribuido' || l.status === 'visita_agendada' ? 'verde' : l.status === 'arquivado' ? 'cinza' : l.status === 'direto' ? 'roxo' : 'ambar'}
                      />
                    </td>
                    <td className="py-2 text-slate-600">{l.corretor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>
    </>
  );
}

// ---------- funis de proprietário (venda / locação) ----------
async function FunilProprietario({ dias, alugar }: { dias: number | null; alugar: boolean }) {
  const { cap, leads, nomeCor, etapas: etapasCap } = await carregarCaptacao(dias);
  // venda × locação: vale a intenção do lead (cadastro do SDR) quando existe; senão, o que veio da landing
  const leadDoTel = new Map(leads.map((l) => [fim8(l.telefone), l]));
  const daIntencao = (c: Captacao) => {
    const i = leadDoTel.get(fim8(c.telefone))?.intencao || c.intencao;
    return /^alug/i.test(String(i ?? '')) ? alugar : !alugar;
  };
  const doFunil = cap.filter(daIntencao);
  const cliques = doFunil.filter((c) => c.evento === 'clique_whatsapp').length;
  // contatos = pessoas (telefone) que mandaram formulário ou começaram conversa no WhatsApp
  const porTel = new Map<string, Captacao>();
  for (const c of doFunil.filter((c) => c.evento !== 'clique_whatsapp' && c.telefone)) {
    const k = fim8(c.telefone);
    const atual = porTel.get(k);
    if (!atual || (atual.evento !== 'formulario' && c.evento === 'formulario') || (!atual.endereco && c.endereco)) porTel.set(k, { ...atual, ...c, nome: c.nome || atual?.nome || null });
  }
  // proprietários que chegaram por outros canais (portais, site, WhatsApp da Eva): o SDR transforma o lead em captação
  const inicio = desde(dias);
  for (const l of leads) {
    const k = fim8(l.telefone);
    if (porTel.has(k) || l.created_at < inicio) continue;
    if (/^alug/i.test(String(l.intencao ?? '')) !== alugar) continue;
    const canal = String(l.fonte ?? '').replace(/^capta[cç][aã]o\s*[—-]\s*/i, '');
    if (/landing/i.test(canal)) continue;
    porTel.set(k, {
      id: 'lead-' + l.id, criado_em: l.created_at, evento: 'sdr', nome: l.nome, telefone: l.telefone, intencao: l.intencao,
      tipo: String(l.tipologia ?? '').replace(/^capta[cç][aã]o \(propriet[aá]rio\):\s*/i, '') || null,
      bairro: l.bairros?.[0] ?? null, endereco: l.imovel_anuncio_endereco, canal: canal || 'SDR',
    });
  }
  const contatos = [...porTel.values()].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const leadDe = (c: Captacao) => leads.find((l) => fim8(l.telefone) === fim8(c.telefone));
  const comFila = contatos.filter((c) => leadDe(c));
  const assumiu = contatos.filter((c) => { const l = leadDe(c); return l && (l.atribuido_em || l.corretor_phone); });
  const feito = contatos.filter((c) => leadDe(c)?.feito_em);
  // etapa mais avançada de cada lead (V1 → V2 → contrato), só venda
  const nivel = new Map<string, number>();
  const ultimaEt = new Map<string, EtapaCap>();
  if (!alugar) for (const e of etapasCap) {
    ultimaEt.set(e.lead_id, e);
    const o = ordemCap(e.etapa);
    if (o >= 0) nivel.set(e.lead_id, Math.max(nivel.get(e.lead_id) ?? -1, o));
  }
  const nivelDe = (c: Captacao) => { const l = leadDe(c); return l ? nivel.get(l.id) ?? -1 : -1; };
  const etapas: Etapa[] = [
    { rotulo: 'Cliques no WhatsApp da landing', n: cliques },
    { rotulo: 'Contatos (formulário ou conversa)', n: contatos.length },
    { rotulo: 'Fila de captadores definida', n: comFila.length },
    { rotulo: 'Captador assumiu', n: assumiu.length },
    { rotulo: 'Contato feito pelo captador', n: feito.length },
    ...(alugar ? [] : ETAPAS_CAP.map((e, i) => ({ rotulo: e.rotulo, n: contatos.filter((c) => nivelDe(c) >= i).length }))),
  ];
  // por captador (venda)
  const agoraIso = desde(0);
  type LinhaCap = { nome: string; assumiu: number; feito: number; niv: number[]; proxima: string | null };
  const porCap = new Map<string, LinhaCap>();
  if (!alugar) for (const c of assumiu) {
    const l = leadDe(c)!;
    const k = fim8(l.corretor_phone);
    const r = porCap.get(k) ?? { nome: nomeCor.get(k) ?? '—', assumiu: 0, feito: 0, niv: ETAPAS_CAP.map(() => 0), proxima: null };
    r.assumiu++;
    if (l.feito_em) r.feito++;
    const nv = nivel.get(l.id) ?? -1;
    for (let i = 0; i <= nv; i++) r.niv[i]++;
    const u = ultimaEt.get(l.id);
    if (u && /_agendada$/.test(u.etapa) && u.quando && new Date(u.quando).toISOString() > agoraIso && (!r.proxima || u.quando < r.proxima)) r.proxima = u.quando;
    porCap.set(k, r);
  }
  const linhasCap = [...porCap.values()].sort((a, b) => b.assumiu - a.assumiu);

  return (
    <>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Contatos" valor={contatos.length} sub={`${contatos.filter((c) => c.evento === 'formulario').length} por formulário`} />
        <Kpi rotulo="Captador assumiu" valor={assumiu.length} sub={`${pct(assumiu.length, contatos.length)}% dos contatos`} />
        <Kpi rotulo="Esperando você" valor={contatos.filter((c) => !leadDe(c)).length} sub="sem fila definida" />
        <Kpi rotulo="Cliques no WhatsApp" valor={cliques} sub={`${pct(contatos.length, cliques)}% viraram contato`} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Secao titulo={`Funil — proprietários que querem ${alugar ? 'alugar' : 'vender'}`}>
            <Funil etapas={etapas} nota={'Vem da landing Anuncie na REMAX e dos outros canais (portais, site, WhatsApp da Eva). Clique conta cada toque no botão de WhatsApp; contato conta pessoas (um telefone).' + (alugar ? '' : ' V1, V2 e contrato: a Eva registra pelo que o captador responde no WhatsApp.')} />
          </Secao>
        </div>
        <div className="lg:col-span-2">
          <Lista titulo="Por bairro" itens={contar(contatos, (c) => c.bairro || 'não informado')} />
        </div>
      </div>

      {!alugar && linhasCap.length > 0 && (
        <div className="mt-4">
          <Secao titulo="Por captador">
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 font-medium">Captador</th>
                    <th className="pb-2 text-right font-medium">Assumiu</th>
                    <th className="pb-2 text-right font-medium">Contato</th>
                    {ETAPAS_CAP.map((e) => <th key={e.k} className="pb-2 text-right font-medium">{e.rotulo}</th>)}
                    <th className="pb-2 pl-3 font-medium">Próxima visita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {linhasCap.map((r) => (
                    <tr key={r.nome}>
                      <td className="py-2 text-slate-900">{r.nome}</td>
                      <td className="py-2 text-right tabular-nums">{r.assumiu}</td>
                      <td className="py-2 text-right tabular-nums">{r.feito}</td>
                      {r.niv.map((n, i) => <td key={i} className="py-2 text-right tabular-nums">{n}</td>)}
                      <td className="whitespace-nowrap py-2 pl-3 tabular-nums text-slate-600">{r.proxima ? fmtData.format(new Date(r.proxima)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        </div>
      )}

      <div className="mt-4">
        <Secao titulo={`Proprietários do período (${contatos.length})`}>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Chegou</th>
                  <th className="pb-2 font-medium">Proprietário</th>
                  <th className="pb-2 font-medium">Imóvel</th>
                  <th className="pb-2 font-medium">Como veio</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Captador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contatos.map((c) => {
                  const l = leadDe(c);
                  const ue = l ? ultimaEt.get(l.id) : undefined;
                  const st = !l ? ['Esperando você', 'ambar']
                    : ue ? (ue.etapa === 'cancelada' ? ['Desistiu', 'cinza'] : [(ETAPAS_CAP.find((e) => e.k === ue.etapa)?.rotulo ?? ue.etapa) + (ue.quando && /_agendada$/.test(ue.etapa) ? ' · ' + fmtData.format(new Date(ue.quando)) : ''), ue.etapa === 'contrato_assinado' ? 'roxo' : 'verde'])
                    : l.feito_em ? ['Contato feito', 'verde'] : l.atribuido_em || l.corretor_phone ? ['Assumido', 'verde'] : l.status === 'em_cascata' ? ['Ofertando', 'azul'] : [STATUS_ROTULO[l.status] ?? l.status, 'cinza'];
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="whitespace-nowrap py-2 tabular-nums text-slate-600">{fmtData.format(new Date(c.criado_em))}</td>
                      <td className="py-2">
                        <Link href={l ? `/sdr/lead/${l.id}` : `/sdr/captacao/${c.id}`} className="text-blue-700 underline">{c.nome || 'Proprietário'}</Link>
                      </td>
                      <td className="py-2 text-slate-600">{[c.tipo, c.bairro].filter(Boolean).join(' · ') || '—'}{c.endereco && <span className="block text-xs text-slate-500">{c.endereco}</span>}</td>
                      <td className="py-2 text-slate-600">{c.evento === 'formulario' ? 'Formulário' : c.evento === 'sdr' ? c.canal : 'WhatsApp'}</td>
                      <td className="py-2"><Selo texto={st[0]} tom={st[1] as 'verde'} /></td>
                      <td className="py-2 text-slate-600">{l?.corretor_phone ? nomeCor.get(fim8(l.corretor_phone)) ?? '—' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>
    </>
  );
}

// ---------- recrutamento ----------
async function FunilRecrutamento({ dias }: { dias: number | null }) {
  const ev = await carregarRecrutamento(dias);
  const cliques = ev.filter((e) => e.evento === 'clique_whatsapp').length;
  type Cand = { tel: string; nome: string | null; criado_em: string; formulario: boolean; conversa: boolean; relatorio: boolean; decisao: 'qualificado' | 'descartado' | null; c2s: boolean; momento: string | null; bairro: string | null; indicador: string | null; id: string };
  const cands = new Map<string, Cand>();
  for (const e of [...ev].reverse()) {
    if (!e.telefone) continue;
    const k = fim8(e.telefone);
    const c = (cands.get(k) ?? { tel: e.telefone, nome: null, criado_em: e.criado_em, formulario: false, conversa: false, relatorio: false, decisao: null, c2s: false, momento: null, bairro: null, indicador: null, id: e.id }) as Cand;
    c.nome = e.nome || c.nome;
    if (e.evento === 'formulario') c.formulario = true;
    if (e.evento === 'whatsapp_inicio') c.conversa = true;
    if (e.evento === 'whatsapp_resumo') { c.conversa = true; c.relatorio = true; }
    if (e.evento === 'qualificado') c.decisao = 'qualificado';
    if (e.evento === 'descartado') c.decisao = 'descartado';
    if (e.c2s_lead_id) c.c2s = true;
    c.momento = e.momento || c.momento;
    c.bairro = e.bairro || c.bairro;
    const ind = (e.payload as { indicador?: string } | null)?.indicador;
    if (ind) c.indicador = ind;
    cands.set(k, c);
  }
  const lista = [...cands.values()].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const etapas: Etapa[] = [
    { rotulo: 'Cliques no WhatsApp da landing', n: cliques },
    { rotulo: 'Candidatos (formulário ou conversa)', n: lista.length },
    { rotulo: 'Relatório da Eva / formulário completo', n: lista.filter((c) => c.relatorio || c.formulario).length },
    { rotulo: 'Qualificados por você', n: lista.filter((c) => c.decisao === 'qualificado').length },
    { rotulo: 'No C2S', n: lista.filter((c) => c.c2s).length },
  ];
  const cor = (i: string | null) => (i === 'verde' ? '🟢' : i === 'amarelo' ? '🟡' : i === 'vermelho' ? '🔴' : '');

  return (
    <>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Candidatos" valor={lista.length} sub={`${lista.filter((c) => c.formulario).length} por formulário`} />
        <Kpi rotulo="Qualificados" valor={etapas[3].n} sub={`${lista.filter((c) => c.decisao === 'descartado').length} descartados`} />
        <Kpi rotulo="Esperando decisão" valor={lista.filter((c) => !c.decisao).length} />
        <Kpi rotulo="Cliques no WhatsApp" valor={cliques} sub={`${pct(lista.length, cliques)}% viraram candidato`} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Secao titulo="Funil — recrutamento de corretores">
            <Funil etapas={etapas} nota="Vem da landing Seja REMAX e dos anúncios de recrutamento. Quem decide qualificado/descartado é você; a Eva só faz o relatório. Candidatos anteriores à regra nova podem já estar no C2S sem decisão." />
          </Secao>
        </div>
        <div className="lg:col-span-2">
          <Lista titulo="Momento de carreira" itens={contar(lista.filter((c) => c.momento), (c) => c.momento!)} />
        </div>
      </div>

      <div className="mt-4">
        <Secao titulo={`Candidatos do período (${lista.length})`}>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Chegou</th>
                  <th className="pb-2 font-medium">Candidato</th>
                  <th className="pb-2 font-medium">Como veio</th>
                  <th className="pb-2 font-medium">Momento</th>
                  <th className="pb-2 font-medium">Decisão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((c) => (
                  <tr key={c.tel} className="align-top">
                    <td className="whitespace-nowrap py-2 tabular-nums text-slate-600">{fmtData.format(new Date(c.criado_em))}</td>
                    <td className="py-2 text-slate-900">{cor(c.indicador)} {c.nome || '—'}</td>
                    <td className="py-2 text-slate-600">{c.formulario ? 'Formulário' : 'WhatsApp'}</td>
                    <td className="py-2 text-slate-600">{c.momento || '—'}</td>
                    <td className="py-2">
                      {c.decisao === 'qualificado' ? <Selo texto="Qualificado" tom="verde" /> : c.decisao === 'descartado' ? <Selo texto="Descartado" tom="cinza" /> : <Selo texto="Esperando você" tom="ambar" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      </div>
    </>
  );
}

export default async function FunilSdr({ searchParams }: { searchParams: Promise<{ d?: string; f?: string }> }) {
  await exigirAdmin();
  const { d, f } = await searchParams;
  const periodo = PERIODOS.some((p) => p.k === d) ? (d as string) : '30';
  const funil: FunilK = FUNIS.some((x) => x.k === f) ? (f as FunilK) : 'comprador';
  const dias = periodo === 'tudo' ? null : Number(periodo);

  let conteudo: React.ReactNode = null;
  let erro: string | null = null;
  try {
    conteudo =
      funil === 'comprador' ? await FunilCliente({ dias, intencao: 'compra' })
      : funil === 'locatario' ? await FunilCliente({ dias, intencao: 'aluguel' })
      : funil === 'prop_venda' ? await FunilProprietario({ dias, alugar: false })
      : funil === 'prop_locacao' ? await FunilProprietario({ dias, alugar: true })
      : await FunilRecrutamento({ dias });
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">← Painel interno</Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Funil do SDR</h1>
            <p className="mt-1 text-sm text-slate-600">Leads que a Eva recebeu, qualificou e distribuiu.</p>
          </div>
          <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PERIODOS.map((p) => (
              <Link key={p.k} href={`/sdr?f=${funil}&d=${p.k}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${p.k === periodo ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {p.rotulo}
              </Link>
            ))}
          </nav>
        </header>

        <div className="mt-6">
          <FunilSelect funis={FUNIS.map((x) => ({ k: x.k, rotulo: x.rotulo }))} atual={funil} periodo={periodo} />
        </div>

        {erro ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui ler os dados: {erro}</div>
        ) : conteudo}

        <footer className="mt-10 text-center text-xs text-slate-400">Dados do SDR da Eva · atualizados a cada acesso</footer>
      </main>
    </div>
  );
}
