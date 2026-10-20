// Ficha de captação: acha o SQL (nº do contribuinte do IPTU) e a área total da
// unidade a partir do endereço, e emite a Certidão de Dados Cadastrais do Imóvel.
//
// SQL pelo endereço: vem das vendas do ITBI (public.vendidos_itbi_usados), que
// trazem o SQL e a área construída de cada unidade vendida. Só acha a unidade
// que já foi vendida desde o início da base; senão, devolve o prédio e pede o SQL
// do carnê. Grátis (banco próprio).
//
// Certidão: Infosimples pref/sp/sao-paulo/dados-imovel com a Senha Web do CNPJ da
// Ville (a mesma do WF-08). R$ 0,24 por consulta. O resultado fica guardado no
// Storage por SQL + exercício: pedir de novo a mesma certidão não paga de novo.

import { pool } from '@/lib/db';

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const limpo = (s: unknown) => semAcento(String(s ?? '')).toUpperCase().replace(/\s+/g, ' ').trim();

const TIPOS_RUA =
  /^(RUA|R|AV|AVENIDA|AL|ALAMEDA|TRAVESSA|TV|PRACA|ESTRADA|ESTR|RODOVIA|ROD|LARGO|LGO|VIELA|VILA|PCA)\.?\s+/;
const UNIDADE =
  /[,\s\-–—]*\b(?:apto|apt|ap|apartamento|cj|conj|conjunto|sala|loja|unid|unidade)\.?\s*n?[ºo°]?\s*(\d+[a-z]?)\b/i;

export type EnderecoLido = { nucleo: string; numero: string; unidade: string | null };

/** "R. Treze de Maio, 1203 — ap 91" → { nucleo: "TREZE DE MAIO", numero: "1203", unidade: "91" } */
export function lerEndereco(endereco: string, unidadeExtra?: string | null): EnderecoLido | null {
  const flat = String(endereco || '').replace(/\s+/g, ' ').trim();
  const mu = flat.match(UNIDADE);
  let unidade = mu ? mu[1] : null;
  const extra = String(unidadeExtra || '').match(/\d+[a-z]?/i);
  if (extra) unidade = extra[0];
  const head = flat.replace(UNIDADE, ' ').replace(/\s+/g, ' ').trim();
  const nums = [...head.matchAll(/\d{1,6}/g)];
  if (!nums.length) return null;
  const last = nums[nums.length - 1];
  const numero = String(Number(last[0]));
  const rua = head.slice(0, last.index).replace(/[,\-–—\s]+$/, '');
  const nucleo = limpo(rua).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim().replace(TIPOS_RUA, '').trim();
  if (nucleo.length < 3) return null;
  return { nucleo, numero, unidade: unidade ? unidade.replace(/^0+(?=\d)/, '').toUpperCase() : null };
}

/** Número da unidade no complemento do ITBI ("AP 112", "APTO 102", "AP 11 VG"); null em vaga/box. */
export function unidadeDoComplemento(complemento: string): string | null {
  const t = limpo(complemento).replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t || /^(VG|VAGA|VAGAS|BOX|BX|GARAGE|GARAGEM|DEP|DEPOSITO|AN|ANEXO)\b/.test(t)) return null;
  const m = t.match(/\b(?:APARTAMENTO|APTO|APT|AP|CONJUNTO|CONJ|CJ|SALA|SL|LOJA|UNIDADE|UNID|UN)\s*(\d+[A-Z]?)\b/);
  return m ? m[1].replace(/^0+(?=\d)/, '') : null;
}

export const formatarSql = (s: string) => {
  const d = String(s || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 10)}-${d.slice(10)}` : d;
};

export type UnidadeItbi = { unidade: string; complemento: string; sql: string; area: number | null; ultimaVenda: string | null };
export type CandidatoSql = { complemento: string; sql: string };
export type ResultadoSql = {
  predio: { logradouro: string; numero: string; cep: string } | null;
  unidade: UnidadeItbi | null;
  unidadeProcurada: string | null;
  unidadesVendidas: number;
  outrosEnderecos: string[];
  /** de onde veio o SQL da unidade: vendas do ITBI ou cadastro da Prefeitura (CIT) */
  fonte?: 'itbi' | 'cit' | null;
  /** CIT com mais de uma série para a unidade e nada que desempate: o corretor escolhe */
  candidatos?: CandidatoSql[];
  /** falha ao consultar o CIT (site fora do ar etc.) */
  avisoCit?: string | null;
};

type Linha = {
  building_key: string; logradouro: string; numero: string; cep: string | null;
  sql11: string | null; complemento: string | null; area_construida: string | null; data_transacao: string | Date | null;
};

// Títulos e abreviações do cadastro ("R CAP PINTO FERREIRA" e "R CAPITAO PINTO FERREIRA" são a mesma rua)
const TITULOS: Record<string, string> = {
  CAP: 'CAPITAO', DR: 'DOUTOR', DRA: 'DOUTORA', PROF: 'PROFESSOR', PROFA: 'PROFESSORA', ENG: 'ENGENHEIRO',
  GEN: 'GENERAL', CEL: 'CORONEL', TEN: 'TENENTE', SGT: 'SARGENTO', MAL: 'MARECHAL', BRIG: 'BRIGADEIRO',
  ALM: 'ALMIRANTE', CMTE: 'COMANDANTE', CDE: 'CONDE', VISC: 'VISCONDE', MARQ: 'MARQUES', BAR: 'BARAO',
  DES: 'DESEMBARGADOR', MIN: 'MINISTRO', PRES: 'PRESIDENTE', SEN: 'SENADOR', DEP: 'DEPUTADO', VER: 'VEREADOR',
  CONS: 'CONSELHEIRO', PE: 'PADRE', STA: 'SANTA', STO: 'SANTO', SR: 'SENHOR', SRA: 'SENHORA', MONS: 'MONSENHOR',
  COM: 'COMENDADOR', JORN: 'JORNALISTA', MAJ: 'MAJOR', EMB: 'EMBAIXADOR', GOV: 'GOVERNADOR', ARQ: 'ARQUITETO',
};
const TITULO_EXTENSO = new Set(Object.values(TITULOS));
const LIGACOES = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);

/** palavras do nome da rua com as abreviações expandidas, sem o tipo ("R", "AL") */
export function palavrasRua(s: string): string[] {
  return limpo(s).replace(/[^A-Z0-9 ]+/g, ' ').replace(TIPOS_RUA, '').split(' ').filter(Boolean).map((w) => TITULOS[w] || w);
}
/** núcleo para busca por texto: sem títulos e sem ligações ("CAPITAO PINTO FERREIRA" → "PINTO FERREIRA") */
export function nucleoBusca(nucleo: string): string {
  const ws = palavrasRua(nucleo);
  let i = 0;
  while (i < ws.length - 1 && (TITULO_EXTENSO.has(ws[i]) || LIGACOES.has(ws[i]))) i++;
  return ws.slice(i).join(' ');
}
/** quanto o logradouro do cadastro bate com o que o corretor digitou (0 a 1) */
export function semelhancaRua(digitado: string, cadastro: string): number {
  const a = palavrasRua(digitado).filter((w) => !LIGACOES.has(w));
  const b = new Set(palavrasRua(cadastro).filter((w) => !LIGACOES.has(w)));
  if (!a.length) return 0;
  const comuns = a.filter((w) => b.has(w)).length;
  // todas as palavras digitadas precisam estar no cadastro; palavra a mais no cadastro pesa pouco
  // ("PINTO FERREIRA" serve para "CAPITAO PINTO FERREIRA"; "CAPITAO PINTO FERREIRA" não serve para "JOAO PINTO FERREIRA")
  return comuns / a.length - 0.01 * Math.max(0, b.size - comuns);
}

const TRANSLATE = `translate(upper(logradouro), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')`;

async function linhasDoEndereco(nucleo: string, numero: string): Promise<Linha[]> {
  const q = `select building_key, logradouro, numero, cep, sql11, complemento, area_construida, data_transacao
               from public.vendidos_itbi_usados
              where numero = $1 and ${TRANSLATE} like $2
              order by data_transacao desc nulls last
              limit 800`;
  // busca pelo nome sem o título: o ITBI escreve "CAP PINTO FERREIRA" e "CAPITAO PINTO FERREIRA"
  const { rows } = await pool.query(q, [numero, `%${nucleoBusca(nucleo)}%`]);
  return rows as Linha[];
}

const dataIso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const lote = (sql: string) => Number(sql.slice(6, 10));

/** Entre as séries do CIT (ex.: "APTO 141" cancelado × "AP 141 VG" vigente), fica com a que bate com as vendas do ITBI. */
export function escolherSerie(candidatos: CandidatoSql[], sqlsItbi: string[]): CandidatoSql | null {
  if (candidatos.length === 1) return candidatos[0];
  const exato = candidatos.find((c) => sqlsItbi.includes(c.sql));
  if (exato) return exato;
  const mesmos = sqlsItbi.filter((s) => candidatos.some((c) => c.sql.slice(0, 6) === s.slice(0, 6)));
  if (!mesmos.length) return null;
  // a série vigente é a mais perto dos lotes que aparecem nas vendas (as vendas usam o SQL vigente)
  const lotes = mesmos.map(lote);
  const dist = (c: CandidatoSql) => Math.min(...lotes.map((l) => Math.abs(l - lote(c.sql))));
  const ord = [...candidatos].sort((x, y) => dist(x) - dist(y));
  return dist(ord[1]) > 2 * dist(ord[0]) + 5 ? ord[0] : null;
}

export async function sqlPorEndereco(endereco: string, unidadeExtra?: string | null): Promise<ResultadoSql | null> {
  const e = lerEndereco(endereco, unidadeExtra);
  if (!e) return null;
  const linhas = await linhasDoEndereco(e.nucleo, e.numero);

  // o mesmo prédio aparece com o nome escrito de jeitos diferentes: agrupa por setor+quadra do SQL
  const porPredio = new Map<string, Linha[]>();
  for (const l of linhas) {
    const k = String(l.sql11 || '').replace(/\D/g, '').slice(0, 6) || l.building_key;
    porPredio.set(k, [...(porPredio.get(k) || []), l]);
  }
  const nota = (g: Linha[]) => Math.max(...g.map((l) => semelhancaRua(e.nucleo, l.logradouro)));
  const ordenados = [...porPredio.values()].sort((a, b) => nota(b) - nota(a) || b.length - a.length);
  const doPredio = ordenados.length && nota(ordenados[0]) >= 0.9 ? ordenados[0] : [];

  const unidades = new Map<string, UnidadeItbi>();
  for (const l of doPredio) {
    const u = unidadeDoComplemento(l.complemento || '');
    const sql = String(l.sql11 || '').replace(/\D/g, '');
    if (!u || sql.length !== 11 || unidades.has(u)) continue;
    unidades.set(u, {
      unidade: u,
      complemento: String(l.complemento || '').trim(),
      sql,
      area: l.area_construida == null ? null : Number(l.area_construida),
      ultimaVenda: dataIso(l.data_transacao),
    });
  }
  const base = doPredio[0];
  const res: ResultadoSql = {
    predio: base ? { logradouro: String(base.logradouro || '').trim(), numero: String(base.numero || ''), cep: String(base.cep || '') } : null,
    unidade: e.unidade ? unidades.get(e.unidade) || null : null,
    unidadeProcurada: e.unidade,
    unidadesVendidas: unidades.size,
    outrosEnderecos: ordenados.slice(1, 4).filter((g) => nota(g) >= 0.9).map((g) => `${String(g[0].logradouro).trim()}, ${g[0].numero}`),
    fonte: null,
  };
  if (res.unidade) { res.fonte = 'itbi'; return res; }
  if (!e.unidade) return res;

  // a unidade nunca foi vendida na base: procura no cadastro da Prefeitura (CIT)
  try {
    const cit = await unidadesDoCit(e.nucleo, e.numero);
    if (cit) {
      if (!res.predio) res.predio = { logradouro: cit.logradouro, numero: e.numero, cep: '' };
      const cands = cit.unidades.filter((u) => unidadeDoComplemento(u.complemento) === e.unidade);
      const sqlsItbi = [...new Set(doPredio.map((l) => String(l.sql11 || '').replace(/\D/g, '')).filter((s) => s.length === 11))];
      const escolhido = escolherSerie(cands, sqlsItbi);
      if (escolhido) {
        res.unidade = { unidade: e.unidade, complemento: escolhido.complemento, sql: escolhido.sql, area: null, ultimaVenda: null };
        res.fonte = 'cit';
      } else if (cands.length > 1) {
        res.candidatos = cands;
        res.fonte = 'cit';
      }
    }
  } catch (err) {
    console.error('[estudo][cit]', err);
    res.avisoCit = 'O cadastro da Prefeitura (CIT) não respondeu agora.';
  }
  return res;
}

// ---------------------------------------------------------------- CIT (Prefeitura)
// Cadastro de Imóveis Tombados: a busca por endereço lista TODAS as unidades do prédio com
// o SQL de cada uma (inclusive séries canceladas). ASP.NET WebForms, sem login nem captcha:
// 1) GET ?Endereco=<nome>  2) postback do logradouro  3) POST com o número do imóvel.

const CIT = 'https://www3.prefeitura.sp.gov.br/cit/Forms/frmPesquisaEndereco.aspx';
const desHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function camposOcultos(html: string): URLSearchParams {
  const p = new URLSearchParams();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const nome = m[0].match(/name="([^"]*)"/)?.[1];
    if (!nome) continue;
    const valor = m[0].match(/value="([^"]*)"/)?.[1] ?? '';
    p.set(nome, valor.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  p.set('PageProdamSPPosicao', 'Form=0;0/'); // o JS da página preenche; sem ele o postback volta 500
  return p;
}
function linhasTabela(html: string): { tds: string[]; alvo: string | null }[] {
  const out: { tds: string[]; alvo: string | null }[] = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 6) continue;
    const alvo = tr[1].match(/__doPostBack\('([^']+)'/)?.[1] || null;
    out.push({ tds: tds.map(desHtml), alvo });
  }
  return out;
}

async function citFetch(url: string, cookies: string[], corpo?: URLSearchParams): Promise<string> {
  const r = await fetch(url, {
    method: corpo ? 'POST' : 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      ...(corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
    },
    body: corpo ? corpo.toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const novos = (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  for (const c of novos) {
    const par = c.split(';')[0];
    const nome = par.split('=')[0];
    const i = cookies.findIndex((x) => x.startsWith(nome + '='));
    if (i >= 0) cookies[i] = par; else cookies.push(par);
  }
  if (!r.ok) throw new Error(`CIT respondeu ${r.status}`);
  return r.text();
}

export async function unidadesDoCit(nucleo: string, numero: string): Promise<{ logradouro: string; unidades: CandidatoSql[] } | null> {
  const busca = nucleoBusca(nucleo).toLowerCase();
  const url = `${CIT}?Endereco=${encodeURIComponent(busca)}`;
  const cookies: string[] = [];

  // 1) logradouros com esse nome: Tipo | Título | Prep. | Nome | Situação | CodLog | Selecionar
  const h1 = await citFetch(url, cookies);
  const ruas = linhasTabela(h1).filter((r) => r.alvo && /drg_CodLog/.test(r.alvo));
  if (!ruas.length) return null;
  const nomeDe = (r: { tds: string[] }) => [r.tds[1], r.tds[2], r.tds[3]].join(' ');
  const melhor = ruas
    .map((r) => ({ r, nota: semelhancaRua(nucleo, nomeDe(r)), vigente: !/ANTIG|CANCEL|EXTINT/i.test(r.tds[4] || '') }))
    .sort((a, b) => b.nota - a.nota || Number(b.vigente) - Number(a.vigente))[0];
  if (!melhor || melhor.nota < 0.9) return null;

  // 2) seleciona o logradouro
  const p2 = camposOcultos(h1);
  p2.set('__EVENTTARGET', melhor.r.alvo!);
  p2.set('__EVENTARGUMENT', '');
  const h2 = await citFetch(url, cookies, p2);

  // 3) número do imóvel → Tipo | Título | Prep. | Nome | Nro | Compl. | Setor/Quadra/Lote
  const p3 = camposOcultos(h2);
  p3.set('__EVENTTARGET', '');
  p3.set('ctl00$Principal$txt_numero', numero);
  p3.set('ctl00$Principal$btn_pesquisaNumero', 'Pesquisar');
  const h3 = await citFetch(url, cookies, p3);
  const unidades = linhasTabela(h3)
    .filter((r) => /^\d{3}\.\d{3}\.\d{4}-\d$/.test(r.tds[6] || ''))
    .map((r) => ({ complemento: r.tds[5], sql: r.tds[6].replace(/\D/g, '') }));
  return { logradouro: desHtml(nomeDe(melhor.r)), unidades };
}

// ---------------------------------------------------------------- certidão

export type Certidao = {
  sql: string;
  ano: number;
  areaConstruida: number | null;
  areaTerreno: number | null;
  fracaoIdeal: number | null;
  anoConstrucao: number | null;
  localImovel: string | null;
  dataEmissao: string | null;
};

const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (/^\d+\.\d+$/.test(String(v).trim())) return Number(String(v).trim()); // "0.0123" (ponto decimal)
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Do data[0] da Infosimples para o que a ficha usa. Nome e CPF do contribuinte ficam de fora de propósito. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON da Infosimples
export function lerCertidao(sql: string, ano: number, d: Record<string, any>): Certidao {
  const c = d?.dados_construcao || {};
  const t = d?.dados_terreno || {};
  return {
    sql,
    ano,
    areaConstruida: numero(c.normalizado_area_construida ?? c.area_construida),
    areaTerreno: numero(t.normalizado_area_total ?? t.area_total),
    fracaoIdeal: numero(t.normalizado_fracao_ideal ?? t.fracao_ideal),
    anoConstrucao: numero(c.ano_construcao_corrigido),
    localImovel: d?.local_imovel ? String(d.local_imovel).replace(/\s+/g, ' ').trim() : null,
    dataEmissao: d?.data_emissao ? String(d.data_emissao) : null,
  };
}
