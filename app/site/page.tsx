// 08/11: números do www.villejardins.com.br. Fonte: registro próprio do site
// (public.site_eventos, gravado por /api/site/evento) e o custo diário do Google Ads
// (public.ads_custos_diarios e ads_termos_pesquisa, gravados pelo n8n às 6h10).
// Tudo vem de uma chamada só: public.site_painel(de, ate).
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Site — REMAX Ville' };

type Dados = {
  resumo: { visitantes: number; sessoes: number; paginas: number; contatos: number; whatsapp: number; formularios: number; sessoes_pagas: number; contatos_pagos: number; uma_pagina: number; buscas: number };
  por_dia: { dia: string; visitantes: number; sessoes: number; contatos: number }[];
  origens: { origem: string; pago: boolean; sessoes: number; visitantes: number; contatos: number; paginas_por_sessao: number }[];
  dispositivos: { dispositivo: string; sessoes: number; contatos: number }[];
  imoveis: { imovel_id: string; titulo: string | null; caminho: string | null; visitas: number; sessoes: number; contatos: number }[];
  bairros: { bairro: string; visitas: number; sessoes: number }[];
  buscas: { termo: string; vezes: number }[];
  saidas: { caminho: string; sessoes: number; sem_contato: number }[];
  termos_site: { termo: string; pago: boolean; sessoes: number; contatos: number }[];
  termos_ads: { termo: string; campanhas: string; cliques: number; impressoes: number; custo: number; conversoes: number }[];
  campanhas: { campanha: string; tipo: string; custo: number; cliques: number; impressoes: number; conversoes: number; todas_conversoes: number }[];
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
const TIPO_CAMP: Record<string, string> = { imoveis: 'Imóveis', captacao: 'Captação', recrutamento: 'Recrutamento' };

// Meia-noite de São Paulo (UTC-3, sem horário de verão) de "hoje menos n dias".
function periodo(k: string) {
  const p = PERIODOS.find((x) => x.k === k) ?? PERIODOS[1];
  const agora = new Date();
  const sp = new Date(agora.getTime() - 3 * 3600e3);
  const meiaNoite = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()) + 3 * 3600e3;
  const de = new Date(meiaNoite - (p.dias ? (p.dias - 1) * 86400e3 : 0));
  return { p, de: de.toISOString(), ate: agora.toISOString() };
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

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      {descricao && <p className="mt-0.5 text-sm text-slate-600">{descricao}</p>}
      <div className="mt-3">{children}</div>
    </section>
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

export default async function SitePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await exigirTela('vitrine');
  const { p: pParam } = await searchParams;
  const { p, de, ate } = periodo(pParam || '7');
  let d: Dados | null = null;
  let erro: string | null = null;
  try {
    const { data, error } = await supabaseAdmin().rpc('site_painel', { de, ate });
    if (error) throw new Error(error.message);
    d = data as Dados;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

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
          Visitas, imóveis vistos, contatos e de onde as pessoas vieram. O registro começou em {INICIO_REGISTRO.split('-').reverse().join('/')}; antes disso não há dados de visita.
          O custo dos anúncios é atualizado todo dia às 6h10 (o de hoje ainda não entra).
        </p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Período">
          {PERIODOS.map((x) => (
            <Link key={x.k} href={`/site?p=${x.k}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${x.k === p.k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>{x.rotulo}</Link>
          ))}
        </nav>

        {erro || !d || !r ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Não consegui carregar os números agora: {erro}</div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Cartao titulo="Visitantes" valor={int(r.visitantes)} nota={`${int(r.sessoes)} visitas`} />
              <Cartao titulo="Páginas vistas" valor={int(r.paginas)} nota={`${pct(r.uma_pagina, r.sessoes)} saíram na 1ª página`} />
              <Cartao titulo="Contatos" valor={int(r.contatos)} nota={`${int(r.whatsapp)} WhatsApp · ${int(r.formularios)} formulário`} />
              <Cartao titulo="Conversão" valor={pct(r.contatos, r.sessoes)} nota="visitas com contato" />
              <Cartao titulo="Anúncios de imóveis" valor={brl(custoImoveis)} nota={`${int(d.custo_imoveis.cliques)} cliques no Google Ads`} />
              <Cartao titulo="Custo por contato" valor={r.contatos_pagos ? brl(custoImoveis / r.contatos_pagos) : '—'} nota={`${int(r.contatos_pagos)} contatos de anúncio`} />
            </div>

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
                cab={[{ t: 'Origem' }, { t: 'Tipo' }, { t: 'Visitas', dir: true }, { t: 'Visitantes', dir: true }, { t: 'Contatos', dir: true }, { t: 'Conversão', dir: true }, { t: 'Páginas/visita', dir: true }]}
                linhas={d.origens.map((o) => [o.origem, <Selo key="s" pago={o.pago} />, int(o.sessoes), int(o.visitantes), int(o.contatos), pct(o.contatos, o.sessoes), String(o.paginas_por_sessao ?? '').replace('.', ',')])}
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
                cab={[{ t: 'Imóvel' }, { t: 'Visualizações', dir: true }, { t: 'Visitas', dir: true }, { t: 'Contatos', dir: true }]}
                linhas={d.imoveis.map((i) => [
                  <a key="a" href={SITE + (i.caminho || '/imovel/' + i.imovel_id)} target="_blank" rel="noopener" className="text-blue-700 hover:underline">{(i.titulo || i.imovel_id).replace(/ \| REMAX Ville$/, '')}</a>,
                  int(i.visitas), int(i.sessoes), int(i.contatos),
                ])}
              />
            </Secao>

            <div className="grid gap-4 lg:grid-cols-2">
              <Secao titulo="Bairros dos imóveis vistos">
                <Tabela cab={[{ t: 'Bairro' }, { t: 'Visualizações', dir: true }, { t: 'Visitas', dir: true }]} linhas={d.bairros.map((b) => [b.bairro, int(b.visitas), int(b.sessoes)])} />
              </Secao>
              <Secao titulo="Dispositivo">
                <Tabela cab={[{ t: 'Dispositivo' }, { t: 'Visitas', dir: true }, { t: 'Contatos', dir: true }, { t: 'Conversão', dir: true }]} linhas={d.dispositivos.map((x) => [x.dispositivo, int(x.sessoes), int(x.contatos), pct(x.contatos, x.sessoes)])} />
              </Secao>
            </div>

            <Secao titulo="Onde as visitas terminaram" descricao="Última página vista em cada visita, e quantas saíram dali sem falar com a gente.">
              <Tabela cab={[{ t: 'Página' }, { t: 'Visitas', dir: true }, { t: 'Sem contato', dir: true }]} linhas={d.saidas.map((s) => [<span key="p" className="break-all">{s.caminho}</span>, int(s.sessoes), int(s.sem_contato)])} />
            </Secao>

            <Secao titulo="Campanhas do Google Ads" descricao="Custo e conversões no período (dias completos). Só as campanhas de imóveis entram no custo por contato acima.">
              <Tabela
                cab={[{ t: 'Campanha' }, { t: 'Tipo' }, { t: 'Custo', dir: true }, { t: 'Cliques', dir: true }, { t: 'Impressões', dir: true }, { t: 'Conv. principais', dir: true }, { t: 'Todas as conv.', dir: true }]}
                linhas={d.campanhas.map((c) => [c.campanha, TIPO_CAMP[c.tipo] ?? c.tipo, brl(c.custo), int(c.cliques), int(c.impressoes), int(c.conversoes), int(c.todas_conversoes)])}
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
