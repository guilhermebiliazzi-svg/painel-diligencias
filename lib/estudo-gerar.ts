// Botão "Gerar estudo" da ficha de captação (/estudo).
//
// 1) Prévia: vendas do ITBI do prédio (apartamento e sala) e os anúncios da busca do
//    villejardins.com.br que o corretor colou em "Concorrentes". O corretor desmarca o que
//    não quer no estudo.
// 2) Pedido: a ficha vira a mesma entrada que a EVA passa aos subfluxos do n8n
//    (uUs0BxpgRzg2LJmo apartamento/sala e dStAOxXxdMKdUWMo casa). O painel grava o pedido em
//    painel_estudo_pedidos e chama o webhook "painel-estudo" só com o id; o n8n gera o
//    PowerPoint e grava o arquivo de volta no pedido (o painel baixa por consulta).

import { pool } from '@/lib/db';
import { lerEndereco } from '@/lib/estudo-iptu';

export type TipoFicha = 'ap' | 'casa' | 'sala';
export type ValorFicha = string | string[];
export type Vals = Record<string, ValorFicha>;

export type VendaItbi = {
  chave: string;      // "DD/MM/YYYY|UNIDADE" — o mesmo formato da tool Consultar_Vendas_Condominio
  data: string;       // DD/MM/YYYY
  unidade: string;    // "AP 81 + 1 vaga"
  area: number;
  valor: number;
  valor_m2: number;
  mesma_area: boolean; // mesma área total (IPTU) do imóvel — são as que ancoram o valor
};

export type Anuncio = {
  link: string;
  codigo: string;
  titulo: string;
  preco: number;
  area: number | null;
  quartos: number | null;
  suites: number | null;
  vagas: number | null;
  condominio_mensal: number | null;
  bairro: string;
};

export type Busca = {
  anuncios: Anuncio[];
  total_na_busca: number | null;
  links_encontrados: number;
  fora_do_tamanho: number;
  criterio: string;
  outros_links: number; // links que não são do villejardins.com.br (o painel não lê)
};

// ------------------------------------------------------------------ leitura da ficha

export function ficha(tipo: TipoFicha, vals: Vals) {
  const g = (id: string): string => {
    const v = vals[tipo + '.' + id];
    return typeof v === 'string' ? v.trim() : '';
  };
  const ga = (id: string): string[] => {
    const v = vals[tipo + '.' + id];
    return Array.isArray(v) ? v.map(String) : [];
  };
  /** "1.250.000" → 1250000 · "197,5" → 197.5 · "" → null */
  const n = (id: string): number | null => {
    const s = g(id);
    if (!s) return null;
    const m = s.match(/[\d.,]+/);
    if (!m) return null;
    let t = m[0];
    t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    const x = Number(t);
    return Number.isFinite(x) ? x : null;
  };
  return { g, ga, n };
}

const ESTADO: Record<string, string> = {
  'original (sem reforma)': 'original',
  'bom (padrão do prédio)': 'bom',
  reformado: 'reformado',
};

/** Padrão da reforma para o prêmio do estudo: completa → alta; 3 ou mais itens → média; senão simples. */
function padraoReforma(itens: string[]): string {
  if (itens.some((i) => /completa/i.test(i))) return 'alta';
  return itens.length >= 3 ? 'media' : 'simples';
}

/** Links colados em "Concorrentes": os do villejardins.com.br e quantos são de outros sites. */
export function linksConcorrentes(texto: string): { site: string[]; outros: number } {
  const todos = [...new Set((String(texto || '').match(/https?:\/\/[^\s<>"']+/g) || []).map((u) => u.replace(/[),.;]+$/, '')))];
  const site = todos.filter((u) => /^https?:\/\/(www\.)?villejardins\.com\.br\//i.test(u));
  return { site: site.slice(0, 5), outros: todos.length - site.length };
}

/** O que falta preencher para gerar pelo painel (vazio = pode gerar). */
export function faltandoParaGerar(tipo: TipoFicha, vals: Vals): string[] {
  const { g, n } = ficha(tipo, vals);
  const out: string[] = [];
  const end = lerEndereco(g('endereco'), tipo === 'sala' ? g('conjunto') : null);
  if (!end) out.push('endereço com rua e número');
  if (tipo === 'casa') {
    if (!(Number(n('area_terreno')) > 0)) out.push('área do terreno');
  } else {
    if (!(Number(n('area_util')) > 0)) out.push('área útil');
    if (!(Number(n('area_iptu')) > 0)) out.push('área total (IPTU) — use “Achar pelo endereço” ou a certidão');
  }
  return out;
}

// ------------------------------------------------------------------ prévia: ITBI do prédio

// Mesma consulta da tool Consultar_Vendas_Condominio da EVA (vendas do prédio com as vagas do
// mesmo dia somadas ao apartamento), com parâmetros no lugar do texto montado.
const SQL_ITBI = `
WITH alvo AS (
  SELECT regexp_replace(cep::text, '\\D', '', 'g') AS cep
  FROM vendidos_itbi_usados
  WHERE numero::text = $1
    AND (logradouro ILIKE '%' || $2 || '%' OR logradouro ILIKE '%' || regexp_replace($2, '^\\S+\\s+', '') || '%')
  GROUP BY 1 ORDER BY count(*) DESC LIMIT 1
),
base AS (
  SELECT v.data_transacao::date AS dia,
    COALESCE(NULLIF(btrim(v.complemento), ''), '-') AS unidade,
    v.area_construida::numeric AS area, v.valor_transacao::numeric AS valor,
    ( COALESCE(v.descricao_uso ILIKE 'GARAGEM%', false)
      OR btrim(COALESCE(v.complemento, '')) ~* '^(VG|VAGA|BOX|GAR|GARAGEM|ESTACION)'
      OR (v.area_construida::numeric > 0 AND v.area_construida::numeric < 15) ) AS is_vaga
  FROM vendidos_itbi_usados v
  JOIN alvo ON regexp_replace(v.cep::text, '\\D', '', 'g') = alvo.cep
  WHERE regexp_replace(v.numero::text, '\\D', '', 'g') = $1
    AND v.valor_transacao::numeric > 0 AND v.area_construida::numeric > 0
),
aptos AS (
  SELECT b.*, row_number() OVER (PARTITION BY dia ORDER BY valor DESC, unidade) AS ordem,
         row_number() OVER (ORDER BY dia, valor DESC, unidade) AS gid
  FROM base b WHERE NOT is_vaga
),
vagas AS (SELECT b.*, row_number() OVER (ORDER BY dia, unidade, valor) AS vid FROM base b WHERE is_vaga),
liga AS (
  SELECT DISTINCT ON (vg.vid) vg.vid, a.gid
  FROM vagas vg JOIN aptos a ON abs(a.dia - vg.dia) <= 5
  WHERE (a.dia = vg.dia AND a.ordem = 1) OR NOT EXISTS (SELECT 1 FROM aptos x WHERE x.dia = vg.dia)
  ORDER BY vg.vid, abs(a.dia - vg.dia), a.gid
),
soma AS (SELECT l.gid, count(*) AS qtd, sum(vg.valor) AS valor_vagas FROM liga l JOIN vagas vg USING (vid) GROUP BY l.gid)
SELECT to_char(a.dia, 'DD/MM/YYYY') || '|' || a.unidade AS chave,
  to_char(a.dia, 'DD/MM/YYYY') AS data,
  CASE WHEN COALESCE(s.qtd, 0) > 0 THEN a.unidade || ' + ' || s.qtd || CASE WHEN s.qtd > 1 THEN ' vagas' ELSE ' vaga' END ELSE a.unidade END AS unidade,
  a.area::float8 AS area,
  (a.valor + COALESCE(s.valor_vagas, 0))::float8 AS valor,
  ROUND((a.valor + COALESCE(s.valor_vagas, 0)) / a.area)::float8 AS valor_m2
FROM aptos a LEFT JOIN soma s USING (gid)
ORDER BY a.dia DESC, a.valor DESC
LIMIT 40;`;

export async function vendasItbi(endereco: string, areaTotal: number | null): Promise<VendaItbi[] | null> {
  const end = lerEndereco(endereco);
  if (!end) return null;
  const { rows } = await pool.query(SQL_ITBI, [end.numero, end.nucleo]);
  return (rows as Omit<VendaItbi, 'mesma_area'>[]).map((r) => ({
    ...r,
    area: Number(r.area),
    valor: Number(r.valor),
    valor_m2: Number(r.valor_m2),
    mesma_area: areaTotal != null && Math.abs(Number(r.area) - areaTotal) <= 0.5,
  }));
}

// ------------------------------------------------------------------ prévia: busca do site

const BASE_SITE = 'https://www.villejardins.com.br';

async function baixar(url: string): Promise<string> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 REMAX-painel-estudo' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    return r.ok ? await r.text() : '';
  } catch {
    return '';
  }
}

const numBR = (s: string | null | undefined): number | null => {
  if (s == null || s === '') return null;
  const x = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : null;
};

/**
 * Lê a busca (ou anúncios soltos) do villejardins.com.br — mesma lógica do subfluxo
 * "EVA - Ler Busca do Site (estudo)": até 4 páginas por busca, corte de tamanho pelo m² do
 * link e até 12 anúncios abertos.
 */
export async function lerBuscaSite(texto: string, area: number | null, tolerancia = 0.15): Promise<Busca> {
  const { site, outros } = linksConcorrentes(texto);
  let links: string[] = [];
  let total: number | null = null;
  for (const u of site) {
    const path = u.replace(/^https?:\/\/(www\.)?villejardins\.com\.br/i, '');
    if (/^\/imovel\//.test(path)) { links.push(BASE_SITE + path.split(/[?#]/)[0]); continue; }
    for (let pg = 1; pg <= 4; pg++) {
      const h = await baixar(pg === 1 ? u : u + (u.includes('?') ? '&' : '?') + 'pagina=' + pg);
      if (pg === 1) { const m = h.match(/—\s*(\d+)\s*op[çc][õo]es/i); if (m) total = Number(m[1]); }
      const novos = [...h.matchAll(/href="((?:https:\/\/www\.villejardins\.com\.br)?\/imovel\/[^"?#]+)"/g)]
        .map((m) => (m[1].startsWith('http') ? m[1] : BASE_SITE + m[1]))
        .filter((l) => !links.includes(l));
      if (!novos.length) break;
      links.push(...novos);
    }
  }
  links = [...new Set(links)];
  const m2Link = (l: string) => { const m = l.match(/-(\d+)m2-/); return m ? Number(m[1]) : null; };
  let fora = 0;
  const alvo = area
    ? links.filter((l) => { const a = m2Link(l); const ok = !a || Math.abs(a - area) <= area * tolerancia; if (!ok) fora++; return ok; })
    : links;

  const lidos = await Promise.all(alvo.slice(0, 12).map(async (url): Promise<Anuncio | null> => {
    const html = await baixar(url);
    if (!html) return null;
    const t = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').replace(/&amp;/g, '&');
    const txt = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const g = (re: RegExp, s = txt) => { const m = s.match(re); return m ? m[1] : null; };
    const preco = numBR(g(/R\$\s*([\d.]+)/, t)) || numBR(g(/R\$\s*([\d.]+)/));
    if (!preco) return null;
    return {
      link: url,
      codigo: (g(/-([A-Za-z0-9]+)\/?$/, url) || '').toUpperCase(),
      titulo: t.replace(/\s*\|\s*RE\/?MAX Ville\s*$/i, ''),
      preco,
      area: numBR(g(/[ÁA]rea [úu]til\s*([\d.,]+)\s*m/i)) || numBR(g(/([\d.,]+)\s*m²/, t)),
      quartos: numBR(g(/Quartos\s*(\d+)/)),
      suites: numBR(g(/Su[íi]tes\s*(\d+)/)),
      vagas: numBR(g(/Vagas\s*(\d+)/)),
      condominio_mensal: numBR(g(/Condom[íi]nio\s*R\$\s*([\d.]+)/)),
      bairro: (g(/ em ([^,—]+),/, t) || '').trim(),
    };
  }));
  const anuncios = lidos.filter((a): a is Anuncio => !!a).sort((a, b) => a.preco - b.preco);
  return {
    anuncios,
    total_na_busca: total,
    links_encontrados: links.length,
    fora_do_tamanho: fora,
    criterio: area ? `de ${Math.round(area * (1 - tolerancia))} a ${Math.round(area * (1 + tolerancia))} m²` : 'sem corte de tamanho',
    outros_links: outros,
  };
}

// ------------------------------------------------------------------ pedido para o n8n

export type Escolhas = {
  itbi_manter: string[];
  itbi_excluir: string[];
  anuncios: Anuncio[];
};

export function montarPayload(tipo: TipoFicha, vals: Vals, esc: Escolhas) {
  const { g, ga, n } = ficha(tipo, vals);
  const ano = Number(n('ano'));
  const anoAtual = new Date().getFullYear();
  const reformado = g('reformado') === 'sim';
  const itens = ga('reforma_itens').concat(g('reforma_outros') ? [g('reforma_outros')] : []);
  const simNao = (v: string) => (v === 'sim' ? 'sim' : v === 'não' ? 'não' : undefined);
  const so = <T extends Record<string, unknown>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;

  if (tipo === 'casa') {
    const end = lerEndereco(g('endereco'));
    return {
      tipo: 'casa',
      casa: so({
        tipo: g('casa_tipo') === 'terreno vazio' ? 'terreno' : 'casa',
        rua: end?.nucleo,
        numero: end?.numero,
        area_terreno: n('area_terreno'),
        area_construida: n('area_construida'),
        testada: n('testada'),
        uso_atual: g('uso') === 'outro' ? g('uso_outro') || 'outro' : g('uso'),
        renda_mensal: n('renda'),
        condominio_fechado: g('casa_tipo') === 'casa em condomínio' ? 'sim' : undefined,
        ano_construcao: ano >= 1850 && ano <= anoAtual ? ano : undefined,
        sql: g('sql').replace(/\D/g, '') || undefined,
        estado: reformado ? 'reformada' + (n('reforma_ano') ? ' em ' + n('reforma_ano') : '') + (itens.length ? ' (' + itens.join(', ') + ')' : '') : ESTADO[g('estado')] || g('estado'),
        reside: simNao(g('mora')),
        aluguel_moradia: g('mora') === 'sim' ? n('aluguel_moradia') : undefined,
        anuncios: esc.anuncios.map((a) => a.link).join(' '),
      }),
    };
  }

  const tipoSala: Record<string, string> = { 'sala/conjunto': 'sala', laje: 'laje', loja: 'loja' };
  const vagas = g('vagas') === '' ? undefined : n('vagas') ?? (g('vagas').trim() === '0' ? 0 : undefined);
  const ocupa = g(tipo === 'sala' ? 'usa' : 'mora');
  const query = so({
    endereco: g('endereco') + (tipo === 'sala' && g('conjunto') ? ' - cj ' + g('conjunto') : ''),
    tipo: tipo === 'ap' ? 'apartamento' : tipoSala[g('sala_tipo')] || 'sala',
    area_util: n('area_util'),
    area_total: n('area_iptu'),
    quartos: tipo === 'ap' ? n('dorms') : undefined,
    suites: tipo === 'ap' ? n('suites') : undefined,
    banheiros: tipo === 'sala' ? n('banheiros') : undefined,
    vagas,
    idade_anos: ano >= 1850 && ano <= anoAtual ? anoAtual - ano : undefined,
    condominio: tipo === 'sala' ? g('edificio') : g('condominio'),
    bairro: g('bairro'),
    posicao: g('vista'),
    estado: reformado ? 'reformado' : ESTADO[g('estado')],
    reforma_ano: reformado ? n('reforma_ano') : undefined,
    reforma_padrao: reformado ? padraoReforma(itens) : undefined,
    mobilia_valor: g('porteira') === 'sim' ? n('mobilia') : undefined,
    reside: simNao(ocupa),
    aluguel_moradia: tipo === 'ap' && ocupa === 'sim' ? n('aluguel_moradia') : undefined,
    aluga: g('alugado') === 'sim' ? 'sim' : undefined,
    aluguel_mensal: g('alugado') === 'sim' ? n('aluguel') : undefined,
    condominio_mensal: n('cond_mes'),
    iptu_anual: n('iptu'),
    preco_alvo: n('alvo'),
  });
  // amostras "cruas" (o mesmo formato que a EVA passa): o /estudo converte para o contrato do estudo
  const amostras = esc.anuncios.map((a) => ({
    link: a.link, preco: a.preco, area: a.area, quartos: a.quartos, suites: a.suites, vagas: a.vagas,
    bairro: a.bairro, condominio_mensal: a.condominio_mensal, address: '', condominio_nome: '',
  }));
  return {
    tipo,
    query,
    itbi_manter: esc.itbi_manter,
    itbi_excluir: esc.itbi_excluir,
    amostras,
    sem_amostras: amostras.length === 0, // sem concorrentes marcados: estudo só com o ITBI
  };
}

export function nomeArquivo(tipo: TipoFicha, endereco: string): string {
  const slug = String(endereco || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `Estudo_${tipo === 'casa' ? 'Casa' : 'Mercado'}_${slug || 'imovel'}.pptx`;
}
