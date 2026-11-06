// 06/11: funil de recrutamento — usado no Funil do SDR (aba Recrutamento) e na tela própria /recrutamento
// (perfil com a tela "Recrutamento de corretores", ex.: Jessica, sem acesso ao resto do SDR).
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import AcoesCandidato from '@/app/sdr/recrutamento-acoes';
import { ETAPAS_REC, foraDeSp, perfilCandidato, type EtapaRec, type PerfilRec } from '@/lib/recrutamento';

const fmtData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);
const desde = (dias: number | null) => (dias == null ? '1970-01-01T00:00:00Z' : new Date(Date.now() - dias * 864e5).toISOString());

type Recrut = { id: string; criado_em: string; evento: string; nome: string | null; telefone: string | null; momento: string | null; bairro: string | null; creci: string | null; c2s_lead_id: string | null; payload: Record<string, unknown> | null };
async function carregarRecrutamento(dias: number | null) {
  const { data } = await supabaseAdmin().from('recrutamento_leads').select('id,criado_em,evento,nome,telefone,momento,bairro,creci,c2s_lead_id,payload').gte('criado_em', desde(dias)).order('criado_em', { ascending: false }).limit(3000);
  return (data ?? []) as Recrut[];
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

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
      <div className="mt-4">{children}</div>
    </section>
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

// ---------- recrutamento ----------
// 05/11: etapas (Para decidir → Em contato → Entrevistas → Entraram / Descartados; Fora de SP à parte),
// gravadas em public.recrutamento_candidatos. Perfil = etiqueta automática do "momento" + CRECI.
type LinhaRec = { telefone: string; etapa: EtapaRec; motivo: string | null; entrevista_em: string | null; encaminhado_nome: string | null; atualizado_em: string };

async function custoRecrutamento(dias: number | null): Promise<number | null> {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const ini = dias == null ? '2026-09-01' : dia(new Date(Date.now() - dias * 864e5));
  try {
    const r = await fetch('https://villejds.app.n8n.cloud/webhook/monitor-ads-leitura-8s4cas1u', {
      method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ query: `SELECT metrics.cost_micros FROM campaign WHERE campaign.id IN (24295426302, 24302623838) AND segments.date BETWEEN '${ini}' AND '${dia(new Date())}'` }),
    });
    const j = (await r.json()) as { results?: { metrics?: { costMicros?: string } }[] };
    if (!j.results) return null;
    return j.results.reduce((s, x) => s + Number(x.metrics?.costMicros ?? 0), 0) / 1e6;
  } catch {
    return null;
  }
}

export async function FunilRecrutamento({ dias, base, aba, corretores }: { dias: number | null; base: string; aba: string; corretores: { id: number; nome: string }[] }) {
  const [ev, { data: linhas }, custo] = await Promise.all([
    carregarRecrutamento(dias),
    supabaseAdmin().from('recrutamento_candidatos').select('telefone,etapa,motivo,entrevista_em,encaminhado_nome,atualizado_em').limit(5000),
    custoRecrutamento(dias),
  ]);
  const porTel = new Map(((linhas ?? []) as LinhaRec[]).map((l) => [fim8(l.telefone), l]));
  const cliques = ev.filter((e) => e.evento === 'clique_whatsapp').length;
  type Cand = {
    tel: string; nome: string | null; criado_em: string; formulario: boolean; conversa: boolean; relatorio: boolean;
    legado: 'qualificado' | 'descartado' | null; momento: string | null; bairro: string | null; creci: string | null; indicador: string | null;
    etapa: EtapaRec | 'fora'; perfil: PerfilRec; reg: LinhaRec | null;
  };
  const cands = new Map<string, Cand>();
  for (const e of [...ev].reverse()) {
    if (!e.telefone) continue;
    const k = fim8(e.telefone);
    const c = cands.get(k) ?? { tel: e.telefone, nome: null, criado_em: e.criado_em, formulario: false, conversa: false, relatorio: false, legado: null, momento: null, bairro: null, creci: null, indicador: null, etapa: 'decidir', perfil: 'Não informado', reg: null } as Cand;
    if (e.nome && !/^\[(removed|usu[aá]rio)\]$/i.test(e.nome.trim())) c.nome = e.nome;
    if (e.evento === 'formulario') c.formulario = true;
    if (e.evento === 'whatsapp_inicio') c.conversa = true;
    if (e.evento === 'whatsapp_resumo') { c.conversa = true; c.relatorio = true; }
    if (e.evento === 'qualificado') c.legado = 'qualificado';
    if (e.evento === 'descartado') c.legado = 'descartado';
    c.momento = e.momento || c.momento;
    c.bairro = e.bairro || c.bairro;
    c.creci = e.creci || c.creci;
    const ind = (e.payload as { indicador?: string } | null)?.indicador;
    if (ind) c.indicador = ind;
    cands.set(k, c);
  }
  const lista = [...cands.values()];
  for (const c of lista) {
    c.reg = porTel.get(fim8(c.tel)) ?? null;
    c.perfil = perfilCandidato(c.momento, c.creci);
    c.etapa = c.reg ? c.reg.etapa : c.legado === 'descartado' ? 'descartado' : c.legado === 'qualificado' ? 'contato' : foraDeSp(c.bairro) ? 'fora' : 'decidir';
  }
  lista.sort((a, b) => b.criado_em.localeCompare(a.criado_em));

  const abaK = ETAPAS_REC.some((x) => x.k === aba) ? aba : 'decidir';
  const n = (k: string) => lista.filter((c) => c.etapa === k).length;
  let daAba = lista.filter((c) => c.etapa === abaK);
  if (abaK === 'entrevista') daAba = [...daAba].sort((a, b) => (a.reg?.entrevista_em ?? '').localeCompare(b.reg?.entrevista_em ?? ''));
  const entrevistados = lista.filter((c) => c.reg?.entrevista_em || c.etapa === 'entrevista' || c.etapa === 'entrou').length;
  const conversaram = lista.filter((c) => c.conversa).length;
  const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const cor = (i: string | null) => (i === 'verde' ? '🟢' : i === 'amarelo' ? '🟡' : i === 'vermelho' ? '🔴' : '');
  const TOM: Record<PerfilRec, 'verde' | 'azul' | 'ambar' | 'cinza' | 'roxo'> = { 'Já é corretor': 'verde', 'Curso de corretor': 'roxo', 'Começando (sem CRECI)': 'ambar', 'Outra área': 'azul', 'Não informado': 'cinza' };
  const fmtEnt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Candidatos" valor={lista.length} sub={`${lista.filter((c) => c.formulario).length} por formulário · ${n('fora')} fora de SP`} />
        <Kpi rotulo="Conversaram com a Eva" valor={conversaram} sub={`${pct(conversaram, lista.length)}% dos candidatos`} />
        <Kpi rotulo="Entrevistas" valor={entrevistados} sub={custo != null && entrevistados ? `${brl(custo / entrevistados)} por entrevistado` : custo != null ? `campanha: ${brl(custo)}` : undefined} />
        <Kpi rotulo="Entraram" valor={n('entrou')} sub={custo != null ? `campanha no período: ${brl(custo)}` : undefined} />
      </section>

      <div className="mt-4">
        <Secao titulo="Candidatos">
          <nav className="-mx-1 flex flex-wrap gap-1.5">
            {ETAPAS_REC.map((e) => (
              <Link key={e.k} href={`${base}&a=${e.k}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${e.k === abaK ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {e.rotulo} <span className={e.k === abaK ? 'text-slate-300' : 'text-slate-400'}>{n(e.k)}</span>
              </Link>
            ))}
          </nav>

          {daAba.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Ninguém nesta etapa no período.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {daAba.map((c) => (
                <li key={c.tel} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900">{cor(c.indicador)} {c.nome || 'Sem nome'}</span>{' '}
                      <Link href={'/sdr/conversa/' + c.tel.replace(/\D/g, '')} className="text-xs text-blue-700 underline">conversa</Link>
                    </div>
                    <span className="text-xs tabular-nums text-slate-500">chegou {fmtData.format(new Date(c.criado_em))} · {c.formulario ? 'formulário' : 'WhatsApp'}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <Selo texto={c.perfil} tom={TOM[c.perfil]} />
                    {c.bairro && <span>{c.bairro}</span>}
                    {c.momento && <span className="min-w-0 break-words">· {c.momento}</span>}
                    {!c.conversa && <span>· ainda não falou com a Eva</span>}
                  </div>
                  {c.reg && (c.reg.encaminhado_nome || c.reg.entrevista_em || c.reg.motivo) && (
                    <p className="mt-1 text-xs text-slate-700">
                      {c.reg.encaminhado_nome && <>Com {c.reg.encaminhado_nome}. </>}
                      {c.reg.entrevista_em && <>Entrevista {fmtEnt.format(new Date(c.reg.entrevista_em))}. </>}
                      {c.reg.motivo && <>Motivo: {c.reg.motivo}.</>}
                    </p>
                  )}
                  <AcoesCandidato tel={c.tel} etapa={c.etapa === 'fora' ? 'decidir' : c.etapa} fora={c.etapa === 'fora'} corretores={corretores} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Vem da landing Seja REMAX e dos anúncios de recrutamento. Quem decide é você; a Eva só conversa e faz o relatório.
            Fora de SP: quem mora fora da capital (não gera aviso nem conversão no Google). Cliques no WhatsApp da landing no período: {cliques}.
          </p>
        </Secao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Lista titulo="Perfil dos candidatos" itens={contar(lista, (c) => c.perfil)} />
        <Lista titulo="Motivos de descarte" itens={contar(lista.filter((c) => c.etapa === 'descartado'), (c) => c.reg?.motivo || 'sem motivo (anterior às etapas)')} />
      </div>
    </>
  );
}

