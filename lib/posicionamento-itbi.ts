// Posicionamento: números de mercado de um prédio a partir das vendas do ITBI
// (public.vendidos_itbi_usados, a mesma base da Ficha de captação). Grátis.
//
// Acha o prédio pela rua + número, separa o prédio certo pelo setor/quadra do SQL
// e devolve: vendas em 12 meses, faixa e mediana do m² em 24 meses (sem os 10%
// das pontas), metragens das unidades vendidas, ano e padrão do IPTU, bairro e CEP.
import { pool } from '@/lib/db';
import { lerEndereco, nucleoBusca, semelhancaRua } from '@/lib/estudo-iptu';

export type MercadoItbi = {
  logradouro: string;
  numero: string;
  baseAte: string | null; // última data de venda na base (a Prefeitura publica com atraso)
  vendas12m: number;
  vendas24m: number;
  m2Min: number | null;
  m2Max: number | null;
  m2Mediana: number | null;
  metragemMin: number | null;
  metragemMax: number | null;
  ano: number | null;
  padraoIptu: string | null;
  padrao: 'economico' | 'medio' | 'alto' | 'luxo' | null;
  bairro: string | null;
  cep: string | null;
  totalVendas: number;
};

type Linha = {
  logradouro: string; numero: string; cep: string | null; bairro: string | null; sql11: string | null;
  area_construida: string | null; valor_m2: string | null; data_transacao: string | Date | null;
  ano_construcao: string | null; descricao_padrao: string | null;
};

const TRANSLATE = `translate(upper(logradouro), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')`;
const iso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const num = (v: unknown) => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
};

function quantil(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function moda<T>(xs: T[]): T | null {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  let best: T | null = null, n = 0;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}

// IPTU: residencial vertical padrão A (mais simples) a F
function padraoDoIptu(desc: string | null): MercadoItbi['padrao'] {
  const m = String(desc ?? '').toUpperCase().match(/PADR[AÃ]O\s+([A-F])\b/);
  if (!m) return null;
  return ({ A: 'economico', B: 'economico', C: 'medio', D: 'alto', E: 'luxo', F: 'luxo' } as const)[m[1] as 'A'];
}

let baseAteCache: { valor: string | null; em: number } | null = null;
async function dataDaBase(): Promise<string | null> {
  if (baseAteCache && Date.now() - baseAteCache.em < 6 * 3600_000) return baseAteCache.valor;
  const { rows } = await pool.query(`select max(data_transacao) as d from public.vendidos_itbi_usados`);
  baseAteCache = { valor: iso(rows[0]?.d ?? null), em: Date.now() };
  return baseAteCache.valor;
}

export async function mercadoPorEndereco(endereco: string): Promise<MercadoItbi | { erro: string }> {
  const e = lerEndereco(endereco);
  if (!e) return { erro: 'Preencha o endereço com rua e número (ex.: Al. Lorena, 1500).' };

  const [base, res] = await Promise.all([
    dataDaBase(),
    pool.query(
      `select logradouro, numero, cep, bairro, sql11, area_construida, valor_m2, data_transacao, ano_construcao, descricao_padrao
         from public.vendidos_itbi_usados
        where numero = $1 and ${TRANSLATE} like $2
        order by data_transacao desc nulls last
        limit 3000`,
      [e.numero, `%${nucleoBusca(e.nucleo)}%`]
    ),
  ]);
  let linhas = res.rows as Linha[];
  // só a rua que bate com o que foi digitado (o LIKE pega ruas parecidas)
  const notas = new Map<string, number>();
  for (const l of linhas) if (!notas.has(l.logradouro)) notas.set(l.logradouro, semelhancaRua(e.nucleo, l.logradouro));
  const melhor = Math.max(0, ...notas.values());
  if (melhor < 0.75) return { erro: 'Nenhuma venda encontrada no ITBI para esse endereço. Confira a rua e o número.' };
  linhas = linhas.filter((l) => (notas.get(l.logradouro) ?? 0) >= melhor - 0.001);

  // mesmo número pode ter mais de um prédio (setor+quadra do SQL): fica com o de mais vendas
  const porPredio = new Map<string, Linha[]>();
  for (const l of linhas) {
    const k = String(l.sql11 ?? '').replace(/\D/g, '').slice(0, 6) || l.logradouro;
    porPredio.set(k, [...(porPredio.get(k) ?? []), l]);
  }
  linhas = [...porPredio.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  if (!linhas.length) return { erro: 'Nenhuma venda encontrada no ITBI para esse endereço.' };

  // unidades (vaga e depósito ficam de fora pela área)
  const unid = linhas.filter((l) => (num(l.area_construida) ?? 0) >= 20);
  const ref = base ?? iso(linhas[0].data_transacao) ?? new Date().toISOString().slice(0, 10);
  const desde = (dias: number) => new Date(new Date(ref + 'T12:00:00Z').getTime() - dias * 86400000).toISOString().slice(0, 10);
  const d12 = desde(365), d24 = desde(730);
  const em12 = unid.filter((l) => (iso(l.data_transacao) ?? '') > d12);
  const em24 = unid.filter((l) => (iso(l.data_transacao) ?? '') > d24);

  const m2 = em24.map((l) => num(l.valor_m2)).filter((v): v is number => v != null);
  const areas = unid.map((l) => num(l.area_construida)).filter((v): v is number => v != null);
  const anos = linhas.map((l) => Number(String(l.ano_construcao ?? '').replace(/\D/g, ''))).filter((a) => a > 1900 && a < 2100);
  const padraoIptu = moda(linhas.map((l) => l.descricao_padrao).filter((x): x is string => !!x));
  const arred = (v: number, passo: number) => Math.round(v / passo) * passo;

  return {
    logradouro: linhas[0].logradouro,
    numero: e.numero,
    baseAte: base,
    vendas12m: em12.length,
    vendas24m: em24.length,
    m2Min: m2.length ? arred(quantil(m2, m2.length >= 5 ? 0.1 : 0), 100) : null,
    m2Max: m2.length ? arred(quantil(m2, m2.length >= 5 ? 0.9 : 1), 100) : null,
    m2Mediana: m2.length ? arred(quantil(m2, 0.5), 100) : null,
    metragemMin: areas.length ? Math.round(Math.min(...areas)) : null,
    metragemMax: areas.length ? Math.round(Math.max(...areas)) : null,
    ano: moda(anos),
    padraoIptu,
    padrao: padraoDoIptu(padraoIptu),
    bairro: moda(linhas.map((l) => l.bairro).filter((x): x is string => !!x)),
    cep: moda(linhas.map((l) => (l.cep ? String(l.cep).replace(/\D/g, '').padStart(8, '0') : '')).filter(Boolean)),
    totalVendas: unid.length,
  };
}
