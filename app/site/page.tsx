// 08/11: números do www.villejardins.com.br. Fonte: registro próprio do site
// (public.site_eventos, gravado por /api/site/evento) e o custo diário do Google Ads
// (public.ads_custos_diarios e ads_termos_pesquisa, gravados pelo n8n às 6h10).
// Tudo vem de uma chamada só: public.site_painel(de, ate).
// 15/11: e a lista "Quem converteu" de public.site_convertidos(de, ate).
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Site — REMAX Ville' };

type Jornada = {
  sessao: string; inicio: string; origem: string | null; referrer: string | null; pago: boolean; dispositivo: string | null;
  tempo: number; paginas: number; contato: boolean; acoes: string | null; eva_phone: string | null;
  passos: { caminho: string | null; titulo: string | null; seg: number | null; rolagem: number | null }[] | null;
};
type Dados = {
  resumo: { visitantes: number; sessoes: number; paginas: number; contatos: number; whatsapp: number; formularios: number; telefones: number; whats_chegaram: number; sessoes_pagas: number; contatos_pagos: number; uma_pagina: number; tempo_medio: number; tempo_mediano: number; buscas: number };
  por_dia: { dia: string; visitantes: number; sessoes: number; contatos: number }[];
  origens: { origem: string; pago: boolean; sessoes: number; visitantes: number; contatos: number; paginas_por_sessao: number; tempo_medio: number }[];
  entradas: { caminho: string; sessoes: number; sairam: number; contatos: number; tempo_medio: number }[];
  links: { destino: string; vezes: number; sessoes: number }[];
  jornadas: Jornada[];
  dispositivos: { dispositivo: string; sessoes: number; contatos: number; tempo_medio: number }[];
  imoveis: { imovel_id: string; titulo: string | null; caminho: string | null; visitas: number; sessoes: number; contatos: number; whats?: number; chegaram?: number; forms?: number; tels?: number; tempo_medio: number; rolagem_media: number }[];
  bairros: { bairro: string; visitas: number; sessoes: number }[];
  buscas: { termo: string; vezes: number }[];
  saidas: { caminho: string; sessoes: number; sem_contato: number }[];
  termos_site: { termo: string; pago: boolean; sessoes: number; contatos: number }[];
  termos_ads: { termo: string; campanhas: string; cliques: number; impressoes: number; custo: number; conversoes: number }[];
  campanhas: { campanha: string; tipo: string | null; custo: number | null; cliques: number | null; impressoes: number | null; conversoes: number | null; todas_conversoes: number | null; visitas?: number | null; paginas_por_visita?: number | null; tempo_medio?: number | null; contatos?: number | null }[];
  custo_imoveis: { custo: number; cliques: number; impressoes: number; conversoes: number };
  leads_sdr: { fonte: string; n: number; do_site: number }[];
};

const PERIODOS = [
  { k: 'hoje', rotulo: 'Hoje', dias: 0 },
  { k: '7', rotulo: '7 dias', dias: 7 },
  { k: '30', rotulo: '30 dias', dias: 30 },
  { k: '90', rotulo: '90 dias', dias: 90 },
];
const INICIO_REGISTRO = '2026-11-08';
const SITE = 'https://www.villejardins.com.br';

const int = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('pt-BR');
const brl = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—');
// segundos → "1min 05s"
const dur = (s: number | null | undefined) => {
  const n = Math.round(Number(s) || 0);
  if (!n) return '—';
  return n < 60 ? `${n}s` : n < 3600 ? `${Math.floor(n / 60)}min ${String(n % 60).padStart(2, '0')}s` : `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}min`;
};
const hora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const curto = (t: string | null, c: string | null) => (t || c || '').replace(/ \| REMAX Ville$/, '').replace(/ · R\$ [\d.,]+(\/mês)?$/, '') || '/';
const hostDe = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, '') : ''; } catch { return u || ''; } };
const ACAO: Record<string, string> = { whatsapp: 'WhatsApp', formulario: 'Formulário', telefone: 'Telefone', link: 'Saiu para', busca: 'Buscou', compartilhar: 'Compartilhou' };

function Jornadas({ lista }: { lista: Jornada[] }) {
  if (!lista.length) return <Tabela cab={[]} linhas={[]} />;
  return (
    <div className="grid gap-2">
      {lista.map((j) => {
        const ref = hostDe(j.referrer);
        return (
          <details key={j.sessao} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="tabular-nums text-slate-500">{hora(j.inicio)}</span>
              <span className="font-semibold text-slate-900">{j.origem || 'Indefinida'}</span>
              <Selo pago={j.pago} />
              <span className="text-slate-600">{j.dispositivo}</span>
              <span className="text-slate-600">{j.paginas} pág. · {dur(j.tempo)}</span>
              {j.contato ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">Fez contato</span> : null}
            </summary>
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
              {ref && <p className="text-xs text-slate-500">Chegou de: {ref}</p>}
              <ol className="mt-2 grid gap-1.5">
                {(j.passos || []).map((p, k) => (
                  <li key={k} className="flex min-w-0 gap-2">
                    <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{k + 1}.</span>
                    <a href={SITE + (p.caminho || '/')} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-blue-700 hover:underline">{curto(p.titulo, p.caminho)}</a>
                    <span className="shrink-0 tabular-nums text-slate-500">{dur(p.seg)}{p.rolagem != null ? ` · ${p.rolagem}% rolado` : ''}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-slate-600">
                {j.acoes
                  ? 'Ações: ' + j.acoes.split(', ').map((a) => { const [t, ...r] = a.split(' '); return (ACAO[t] ?? t) + (r.length ? ' ' + r.join(' ') : ''); }).join(' · ')
                  : 'Saiu sem clicar em contato nem em link.'}
              </p>
              {j.acoes?.includes('whatsapp') && (j.eva_phone
                ? <p className="mt-1 text-xs font-semibold text-emerald-700">A mensagem chegou na Eva: <a href={'/sdr/conversa/' + j.eva_phone} className="underline">ver a conversa</a></p>
                : <p className="mt-1 text-xs font-semibold text-amber-700">Abriu o WhatsApp, mas a mensagem não chegou na Eva (não enviou, ou mandou para o número de um corretor).</p>)}
              <p className="mt-1 text-[11px] text-slate-400">Gravação no Clarity: filtro “vj_sessao” = {j.sessao}</p>
            </div>
          </details>
        );
      })}
    </div>
  );
}

const TIPO_CAMP: Record<string, string> = { imoveis: 'Imóveis', captacao: 'Captação', recrutamento: 'Recrutamento' };

// Meia-noite de São Paulo (UTC-3, sem horário de verão) de "hoje menos n dias".
// 15/11: ou um intervalo escolhido (?de=AAAA-MM-DD&ate=AAAA-MM-DD), dias inteiros de São Paulo.
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const meiaNoiteSP = (dia: string) => new Date(Date.parse(dia + 'T00:00:00-03:00'));
const dataBR = (dia: string) => dia.split('-').reverse().join('/');
function periodo(k: string, deP?: string, ateP?: string) {
  const agora = new Date();
  if (deP && ateP && DIA.test(deP) && DIA.test(ateP) && !Number.isNaN(Date.parse(deP)) && !Number.isNaN(Date.parse(ateP))) {
    const [a, b] = deP <= ateP ? [deP, ateP] : [ateP, deP];
    const fim = new Date(meiaNoiteSP(b).getTime() + 86400e3);
    return {
      p: { k: 'datas', rotulo: a === b ? dataBR(a) : `${dataBR(a)} a ${dataBR(b)}`, dias: -1 },
      de: meiaNoiteSP(a).toISOString(), ate: (fim < agora ? fim : agora).toISOString(), deDia: a, ateDia: b,
    };
  }
  const p = PERIODOS.find((x) => x.k === k) ?? PERIODOS[1];
  const meiaNoite = meiaNoiteSP(diaSP(agora)).getTime();
  const de = new Date(meiaNoite - (p.dias ? (p.dias - 1) * 86400e3 : 0));
  return { p, de: de.toISOString(), ate: agora.toISOString(), deDia: diaSP(de), ateDia: diaSP(agora) };
}

function Cartao({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}

// 15/11: cada área abre e fecha clicando no título; a página abre com todas fechadas
function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-3 select-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-sm text-slate-400 transition-transform group-open:rotate-90">▶</span>
        <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
        <span className="ml-auto text-xs font-semibold text-blue-700 group-open:hidden">abrir</span>
        <span className="ml-auto hidden text-xs font-semibold text-blue-700 group-open:inline">recolher</span>
      </summary>
      {descricao && <p className="mt-1 text-sm text-slate-600">{descricao}</p>}
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Tabela({ cab, linhas, vazio = 'Nada registrado no período.' }: { cab: { t: string; dir?: boolean }[]; linhas: React.ReactNode[][]; vazio?: string }) {
  if (!linhas.length) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">{vazio}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{cab.map((c) => <th key={c.t} className={`px-3 py-2 font-semibold ${c.dir ? 'text-right' : 'text-left'}`}>{c.t}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l, i) => (
            <tr key={i}>{l.map((v, j) => <td key={j} className={`px-3 py-2 ${cab[j]?.dir ? 'text-right tabular-nums' : ''}`}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Selo = ({ pago }: { pago: boolean }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pago ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{pago ? 'Patrocinado' : 'Orgânico'}</span>
);

function PorDia({ dias }: { dias: Dados['por_dia'] }) {
  if (!dias.length) return <Tabela cab={[]} linhas={[]} />;
  const max = Math.max(1, ...dias.map((d) => d.sessoes));
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex h-40 items-end gap-1">
        {dias.map((d) => (
          <div key={d.dia} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.dia.split('-').reverse().join('/')}: ${d.sessoes} sessões, ${d.contatos} contatos`}>
            <div className="w-full rounded-t bg-blue-500" style={{ height: `${(d.sessoes / max) * 100}%` }}>
              {d.contatos > 0 && <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.min(100, (d.contatos / Math.max(1, d.sessoes)) * 100)}%`, minHeight: 3 }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{dias[0].dia.split('-').reverse().slice(0, 2).join('/')}</span>
        <span className="flex gap-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-blue-500" />sessões (máx. {int(max)})</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500" />com contato</span></span>
        <span>{dias[dias.length - 1].dia.split('-').reverse().slice(0, 2).join('/')}</span>
      </div>
    </div>
  );
}

// 15/11: quem converteu — cada contato do site (WhatsApp que chegou na Eva, formulário, ligação),
// quem é, de onde veio e até onde foi no funil (lead → corretor → visita → proposta). Fonte: public.site_convertidos(de, ate).
type Convertido = {
  quando: string; sessao: string; canal: 'WhatsApp' | 'Formulário' | 'Telefone'; tipo_form: 'captacao' | 'recrutamento' | null;
  imovel_id: string | null; caminho: string | null; imovel_titulo: string | null;
  origem: string | null; pago: boolean; paginas: number | null; dispositivo: string | null; campanha: string | null;
  telefone: string | null; nome: string | null; profissional: boolean;
  lead_id: string | null; lead_em: string | null; fonte: string | null; status: string | null; intencao: string | null; corretor: string | null;
  qualificado: boolean | null; visita_agendada: boolean | null; visitou: boolean; proposta: boolean;
  recrut_etapa: string | null; etapas_captacao: string[] | null;
};

const STATUS_LEAD: Record<string, string> = {
  em_qualificacao: 'Em qualificação com a Eva', aguardando_cliente: 'Aguardando o cliente', aguardando_guilherme: 'Aguardando sua decisão',
  em_cascata: 'Oferecido aos corretores', atribuido: 'Com corretor', direto: 'Direto ao gestor do imóvel', visita_agendada: 'Visita agendada',
  arquivado: 'Arquivado', encerrado: 'Encerrado',
};

const telBR = (t: string | null) => {
  const d = (t || '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t || '';
};

function Etapas({ c }: { c: Convertido }) {
  const capt = c.tipo_form === 'captacao' || (c.fonte || '').startsWith('Captação');
  const e = c.etapas_captacao || [];
  const passos: [string, boolean][] = capt
    ? [['Lead', !!c.lead_id], ['Captador', !!c.corretor], ['V1 agendada', e.some((x) => x.startsWith('v1') || x.startsWith('v2') || x.startsWith('contrato'))],
       ['V1 realizada', e.some((x) => x === 'v1_realizada' || x.startsWith('v2') || x.startsWith('contrato'))], ['V2', e.some((x) => x.startsWith('v2') || x.startsWith('contrato'))],
       ['Contrato', e.some((x) => x.startsWith('contrato'))]]
    : [['Lead', !!c.lead_id], ['Corretor', !!c.corretor], ['Visita agendada', !!c.visita_agendada || c.visitou || c.proposta], ['Visitou', c.visitou || c.proposta], ['Proposta', c.proposta]];
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {passos.map(([t, ok], i) => (
        <li key={t} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">→</span>}
          <span className={`rounded-full px-2 py-0.5 font-semibold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function QuemConverteu({ lista }: { lista: Convertido[] }) {
  if (!lista.length) return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Ninguém fez contato pelo site no período.</p>;
  const comLead = lista.filter((c) => c.lead_id).length;
  const visitas = lista.filter((c) => c.visita_agendada || c.visitou).length;
  const propostas = lista.filter((c) => c.proposta).length;
  return (
    <>
      <p className="mb-3 text-sm text-slate-700 tabular-nums">
        {lista.length} {lista.length === 1 ? 'pessoa' : 'pessoas'} · {comLead} viraram lead · {visitas} com visita · {propostas} com proposta
      </p>
      <div className="grid gap-2">
        {lista.map((c) => {
          const recrut = c.tipo_form === 'recrutamento';
          const pagina = c.imovel_titulo ? curto(c.imovel_titulo, c.caminho) : c.caminho === '/anuncie' ? 'Landing “Anuncie seu imóvel”' : c.caminho === '/seja-remax' ? 'Landing “Seja REMAX” (recrutamento)' : c.caminho || '/';
          return (
            <div key={c.sessao + c.canal + c.quando} className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="tabular-nums text-slate-500">{hora(c.quando)}</span>
                <span className="font-semibold text-slate-900">{c.nome || (c.telefone ? 'Sem nome' : 'Não identificado')}</span>
                {c.telefone && <span className="tabular-nums text-slate-600">{telBR(c.telefone)}</span>}
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{c.canal}</span>
                <Selo pago={c.pago} />
                {c.profissional && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Corretor/profissional</span>}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Veio de: <b className="font-semibold">{c.origem || 'Indefinida'}</b>{c.campanha ? ` · ${c.campanha}` : ''}{c.dispositivo ? ` · ${c.dispositivo}` : ''}{c.paginas ? ` · ${c.paginas} pág.` : ''}
              </p>
              <p className="mt-0.5 min-w-0 truncate text-xs text-slate-600">
                {c.canal === 'Formulário' ? 'Formulário em: ' : 'Contato a partir de: '}
                <a href={SITE + (c.caminho || '/')} target="_blank" rel="noopener" className="text-blue-700 hover:underline">{pagina}</a>
              </p>
              <div className="mt-2 border-t border-slate-100 pt-2">
                {recrut ? (
                  <p className="text-xs text-slate-700">Candidato a corretor (recrutamento){c.recrut_etapa ? ` · etapa: ${c.recrut_etapa}` : ''}</p>
                ) : c.lead_id ? (
                  <div className="grid gap-1.5">
                    <Etapas c={c} />
                    <p className="text-xs text-slate-600">
                      {c.fonte}{c.status ? ` · ${STATUS_LEAD[c.status] ?? c.status}` : ''}{c.corretor ? ` · ${c.corretor}` : ''}
                    </p>
                  </div>
                ) : c.canal === 'Telefone' ? (
                  <p className="text-xs text-slate-500">Clicou para ligar — a ligação não é registrada, então não há como saber quem é.</p>
                ) : (
                  <p className="text-xs font-semibold text-amber-700">Conversou com a Eva, mas não virou lead no SDR.</p>
                )}
                <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {c.lead_id && <Link href={'/sdr/lead/' + c.lead_id} className="font-semibold text-blue-700 hover:underline">Abrir o lead</Link>}
                  {c.telefone && !recrut && <Link href={'/sdr/conversa/' + c.telefone} className="font-semibold text-blue-700 hover:underline">Ver a conversa</Link>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default async function SitePage({ searchParams }: { searchParams: Promise<{ p?: string; de?: string; ate?: string }> }) {
  await exigirTela('vitrine');
  const { p: pParam, de: deParam, ate: ateParam } = await searchParams;
  const { p, de, ate, deDia, ateDia } = periodo(pParam || '7', deParam, ateParam);
  const hoje = diaSP(new Date());
  let d: Dados | null = null;
  let erro: string | null = null;
  let conv: Convertido[] = [];
  let erroConv: string | null = null;
  const sb = supabaseAdmin();
  const [rp, rc] = await Promise.allSettled([sb.rpc('site_painel', { de, ate }), sb.rpc('site_convertidos', { de, ate })]);
  try {
    if (rp.status === 'rejected') throw rp.reason;
    if (rp.value.error) throw new Error(rp.value.error.message);
    d = rp.value.data as Dados;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  if (rc.status === 'rejected') erroConv = String(rc.reason);
  else if (rc.value.error) erroConv = rc.value.error.message;
  else conv = (rc.value.data as Convertido[]) || [];

  const r = d?.resumo;
  const org = d ? d.origens.filter((o) => !o.pago) : [];
  const pag = d ? d.origens.filter((o) => o.pago) : [];
  const soma = (l: { sessoes: number; contatos: number }[]) => l.reduce((a, o) => ({ s: a.s + o.sessoes, c: a.c + o.contatos }), { s: 0, c: 0 });
  const so = soma(org), sp = soma(pag);
  const custoImoveis = Number(d?.custo_imoveis?.custo) || 0;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Site villejardins.com.br</h1>
        <p className="mt-1 text-sm text-slate-600">
          Visitas, caminho de cada pessoa, tempo, imóveis vistos, contatos e de onde vieram. O registro começou em {INICIO_REGISTRO.split('-').reverse().join('/')}; o tempo e a rolagem, no fim do mesmo dia.
          O custo dos anúncios é atualizado todo dia às 6h10 (o de hoje ainda não entra).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <nav className="flex flex-wrap gap-2" aria-label="Período">
            {PERIODOS.map((x) => (
              <Link key={x.k} href={`/site?p=${x.k}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${x.k === p.k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>{x.rotulo}</Link>
            ))}
          </nav>
          {/* 15/11: filtro por datas (dias inteiros, horário de São Paulo) */}
          <form action="/site" method="get" className={`flex flex-wrap items-end gap-2 rounded-2xl border px-3 py-2 ${p.k === 'datas' ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white'}`} aria-label="Filtrar por datas">
            <label className="text-xs font-semibold text-slate-600">
              De
              <input type="date" name="de" defaultValue={deDia} min={INICIO_REGISTRO} max={hoje} required className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-normal text-slate-800" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Até
              <input type="date" name="ate" defaultValue={ateDia} min={INICIO_REGISTRO} max={hoje} required className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-normal text-slate-800" />
            </label>
            <button type="submit" className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">Filtrar</button>
          </form>
        </div>
        {p.k === 'datas' && <p className="mt-2 text-sm font-semibold text-slate-700">Período: {p.rotulo}{ateDia === hoje ? ' (hoje até agora)' : ''}</p>}

        {erro || !d || !r ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui carregar os números agora: {erro}</div>
        ) : (
          <>
            <div className="mt-6 mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cartao titulo="Visitantes" valor={int(r.visitantes)} nota={`${int(r.sessoes)} visitas`} />
              <Cartao titulo="Páginas vistas" valor={int(r.paginas)} nota={`${pct(r.uma_pagina, r.sessoes)} saíram na 1ª página`} />
              <Cartao titulo="Tempo no site" valor={dur(r.tempo_mediano)} nota={`metade das visitas fica até isso · média ${dur(r.tempo_medio)}`} />
              <Cartao titulo="Buscas no site" valor={int(r.buscas)} nota="uso da busca de imóveis" />
              <Cartao titulo="Contatos" valor={int(r.contatos)} nota={`${int(r.whatsapp)} cliques no WhatsApp (${int(r.whats_chegaram)} chegaram na Eva) · ${int(r.formularios)} formulário · ${int(r.telefones)} telefone`} />
              <Cartao titulo="Conversão" valor={pct(r.contatos, r.sessoes)} nota="visitas com contato" />
              <Cartao titulo="Anúncios de imóveis" valor={brl(custoImoveis)} nota={`${int(d.custo_imoveis.cliques)} cliques no Google Ads, desde o início do registro (dias completos)`} />
              <Cartao titulo="Custo por contato" valor={r.contatos_pagos ? brl(custoImoveis / r.contatos_pagos) : '—'} nota={`${int(r.contatos_pagos)} contatos de anúncio`} />
            </div>

            <Secao titulo="Quem converteu" descricao="Cada pessoa que fez contato pelo site no período: quem é, de onde veio, por onde entrou em contato e até onde foi no funil. Visita e proposta dependem do registro do corretor.">
              {erroConv
                ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui carregar a lista agora: {erroConv}</p>
                : <QuemConverteu lista={conv} />}
            </Secao>

            <Secao titulo="Visitas por dia">
              <PorDia dias={d.por_dia} />
            </Secao>

            <Secao titulo="Orgânico × patrocinado" descricao="Patrocinado = chegou por clique em anúncio (Google Ads, Meta ou outro com utm de mídia paga). O resto é orgânico.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Cartao titulo="Orgânico" valor={`${int(so.s)} visitas`} nota={`${int(so.c)} contatos · conversão ${pct(so.c, so.s)}`} />
                <Cartao titulo="Patrocinado" valor={`${int(sp.s)} visitas`} nota={`${int(sp.c)} contatos · conversão ${pct(sp.c, sp.s)}`} />
              </div>
            </Secao>

            <Secao titulo="De onde vieram" descricao="Origem de cada visita, pela primeira página.">
              <Tabela
                cab={[{ t: 'Origem' }, { t: 'Tipo' }, { t: 'Visitas', dir: true }, { t: 'Visitantes', dir: true }, { t: 'Contatos', dir: true }, { t: 'Conversão', dir: true }, { t: 'Páginas/visita', dir: true }, { t: 'Tempo médio', dir: true }]}
                linhas={d.origens.map((o) => [o.origem, <Selo key="s" pago={o.pago} />, int(o.sessoes), int(o.visitantes), int(o.contatos), pct(o.contatos, o.sessoes), String(o.paginas_por_sessao ?? '').replace('.', ','), dur(o.tempo_medio)])}
              />
            </Secao>

            <Secao titulo="Visitas recentes: caminho de cada pessoa" descricao="As 40 últimas visitas do período. Toque para ver de onde veio, as páginas na ordem, quanto tempo ficou em cada uma, quanto rolou e o que fez no fim.">
              <Jornadas lista={d.jornadas} />
            </Secao>

            <Secao titulo="Por onde entraram" descricao="Primeira página de cada visita. “Saíram” = foram embora nela mesma, sem contato.">
              <Tabela
                cab={[{ t: 'Página' }, { t: 'Visitas', dir: true }, { t: 'Saíram', dir: true }, { t: 'Contatos', dir: true }, { t: 'Tempo médio', dir: true }]}
                linhas={d.entradas.map((e) => [<span key="p" className="break-all">{e.caminho}</span>, int(e.sessoes), pct(e.sairam, e.sessoes), int(e.contatos), dur(e.tempo_medio)])}
              />
            </Secao>

            <Secao titulo="O que pesquisaram">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Na busca do site</h3>
                  <Tabela cab={[{ t: 'Busca' }, { t: 'Vezes', dir: true }]} linhas={d.buscas.map((b) => [b.termo, int(b.vezes)])} vazio="Ninguém usou a busca do site no período." />
                </div>
                <div className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">No Google, antes de clicar num anúncio de pesquisa</h3>
                  <Tabela
                    cab={[{ t: 'Pesquisa' }, { t: 'Campanha' }, { t: 'Cliques', dir: true }, { t: 'Custo', dir: true }, { t: 'Conv.', dir: true }]}
                    linhas={d.termos_ads.map((t) => [t.termo, <span key="c" className="text-xs text-slate-500">{t.campanhas}</span>, int(t.cliques), brl(t.custo), int(t.conversoes)])}
                    vazio="Sem pesquisas pagas no período. Os anúncios de imóveis (Display e Demand Gen) não vêm de pesquisa."
                  />
                </div>
              </div>
              {d.termos_site.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Palavra-chave que trouxe a visita (utm_term)</h3>
                  <Tabela cab={[{ t: 'Palavra' }, { t: 'Tipo' }, { t: 'Visitas', dir: true }, { t: 'Contatos', dir: true }]} linhas={d.termos_site.map((t) => [t.termo, <Selo key="s" pago={t.pago} />, int(t.sessoes), int(t.contatos)])} />
                </div>
              )}
              <p className="mt-3 text-xs text-slate-500">As pesquisas orgânicas do Google (quem chegou sem anúncio) ficam no Search Console; o Google não as manda para o site.</p>
            </Secao>

            <Secao titulo="Imóveis mais vistos">
              <Tabela
                cab={[{ t: 'Imóvel' }, { t: 'Visualizações', dir: true }, { t: 'Visitas', dir: true }, { t: 'Tempo médio', dir: true }, { t: 'Rolou até', dir: true }, { t: 'WhatsApp', dir: true }, { t: 'Contatos', dir: true }]}
                linhas={d.imoveis.map((i) => [
                  <a key="a" href={SITE + (i.caminho || '/imovel/' + i.imovel_id)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">{(i.titulo || i.imovel_id).replace(/ \| REMAX Ville$/, '')}</a>,
                  int(i.visitas), int(i.sessoes), dur(i.tempo_medio), i.rolagem_media ? i.rolagem_media + '%' : '—',
                  // 08/11: clique no WhatsApp ≠ contato. Contato = chegou na Eva, formulário ou ligação.
                  i.whats ? <span key="w" className="whitespace-nowrap">{int(i.whats)} {i.whats === 1 ? 'clique' : 'cliques'}<span className="block text-xs text-slate-500">{int(i.chegaram ?? 0)} {(i.chegaram ?? 0) === 1 ? 'chegou' : 'chegaram'} na Eva</span></span> : '—',
                  (i.chegaram ?? 0) + (i.forms ?? 0) + (i.tels ?? 0) ? <span key="c" className="whitespace-nowrap">{int((i.chegaram ?? 0) + (i.forms ?? 0) + (i.tels ?? 0))}<span className="block text-xs text-slate-500">{[i.chegaram ? int(i.chegaram) + ' WhatsApp' : '', i.forms ? int(i.forms) + ' formulário' : '', i.tels ? int(i.tels) + ' ligação' : ''].filter(Boolean).join(' · ')}</span></span> : '—',
                ])}
              />
            </Secao>

            <div className="grid items-start gap-x-4 lg:grid-cols-2">
              <Secao titulo="Bairros dos imóveis vistos">
                <Tabela cab={[{ t: 'Bairro' }, { t: 'Visualizações', dir: true }, { t: 'Visitas', dir: true }]} linhas={d.bairros.map((b) => [b.bairro, int(b.visitas), int(b.sessoes)])} />
              </Secao>
              <Secao titulo="Dispositivo">
                <Tabela cab={[{ t: 'Dispositivo' }, { t: 'Visitas', dir: true }, { t: 'Tempo médio', dir: true }, { t: 'Contatos', dir: true }, { t: 'Conversão', dir: true }]} linhas={d.dispositivos.map((x) => [x.dispositivo, int(x.sessoes), dur(x.tempo_medio), int(x.contatos), pct(x.contatos, x.sessoes)])} />
              </Secao>
            </div>

            <div className="grid items-start gap-x-4 lg:grid-cols-2">
              <Secao titulo="Onde as visitas terminaram" descricao="Última página vista em cada visita, e quantas saíram dali sem falar com a gente.">
                <Tabela cab={[{ t: 'Página' }, { t: 'Visitas', dir: true }, { t: 'Sem contato', dir: true }]} linhas={d.saidas.map((s) => [<span key="p" className="break-all">{s.caminho}</span>, int(s.sessoes), int(s.sem_contato)])} />
              </Secao>
              <Secao titulo="Para onde foram" descricao="Links para fora do site que as pessoas clicaram (o WhatsApp entra em Contatos).">
                <Tabela cab={[{ t: 'Destino' }, { t: 'Cliques', dir: true }, { t: 'Visitas', dir: true }]} linhas={d.links.map((l) => [<span key="d" className="break-all">{l.destino}</span>, int(l.vezes), int(l.sessoes)])} vazio="Ninguém saiu por link no período." />
              </Secao>
            </div>

            <Secao titulo="Campanhas do Google Ads" descricao="Custo e conversões no período (dias completos). Visitas, páginas, tempo e contatos são de quem chegou ao site por cada campanha (registrado a partir de 08/11, nas campanhas de imóveis). Só as campanhas de imóveis entram no custo por contato acima.">
              <Tabela
                cab={[{ t: 'Campanha' }, { t: 'Tipo' }, { t: 'Custo', dir: true }, { t: 'Cliques', dir: true }, { t: 'Impressões', dir: true }, { t: 'Conv. principais', dir: true }, { t: 'Todas as conv.', dir: true }, { t: 'Visitas no site', dir: true }, { t: 'Págs./visita', dir: true }, { t: 'Tempo médio', dir: true }, { t: 'Contatos', dir: true }]}
                linhas={d.campanhas.map((c) => [c.campanha, (c.tipo && TIPO_CAMP[c.tipo]) ?? c.tipo ?? '—', brl(Number(c.custo) || 0), int(Number(c.cliques) || 0), int(Number(c.impressoes) || 0), int(Number(c.conversoes) || 0), int(Number(c.todas_conversoes) || 0),
                  c.visitas ? int(c.visitas) : '—', c.visitas ? String(c.paginas_por_visita ?? '').replace('.', ',') : '—', c.visitas ? dur(Number(c.tempo_medio) || 0) : '—', c.visitas ? int(Number(c.contatos) || 0) : '—'])}
              />
            </Secao>

            <Secao titulo="Leads que entraram no SDR" descricao="Todos os leads do período por fonte; a última coluna conta os que citaram um imóvel do villejardins.com.br.">
              <Tabela cab={[{ t: 'Fonte' }, { t: 'Leads', dir: true }, { t: 'Do site', dir: true }]} linhas={d.leads_sdr.map((l) => [l.fonte, int(l.n), int(l.do_site)])} />
            </Secao>
          </>
        )}
      </main>
    </div>
  );
}
