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
export type ResultadoSql = {
  predio: { logradouro: string; numero: string; cep: string } | null;
  unidade: UnidadeItbi | null;
  unidadeProcurada: string | null;
  unidadesVendidas: number;
  outrosEnderecos: string[];
};

type Linha = {
  building_key: string; logradouro: string; numero: string; cep: string | null;
  sql11: string | null; complemento: string | null; area_construida: string | null; data_transacao: string | Date | null;
};

const TRANSLATE = `translate(upper(logradouro), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')`;

async function linhasDoEndereco(nucleo: string, numero: string): Promise<Linha[]> {
  const q = `select building_key, logradouro, numero, cep, sql11, complemento, area_construida, data_transacao
               from public.vendidos_itbi_usados
              where numero = $1 and ${TRANSLATE} like $2
              order by data_transacao desc nulls last
              limit 600`;
  let { rows } = await pool.query(q, [numero, `%${nucleo}%`]);
  // "DOUTOR ARNALDO" → tenta sem o título ("ARNALDO"), como o estudo faz
  if (!rows.length && /\s/.test(nucleo)) ({ rows } = await pool.query(q, [numero, `%${nucleo.replace(/^\S+\s+/, '')}%`]));
  return rows as Linha[];
}

const dataIso = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function sqlPorEndereco(endereco: string, unidadeExtra?: string | null): Promise<ResultadoSql | null> {
  const e = lerEndereco(endereco, unidadeExtra);
  if (!e) return null;
  const linhas = await linhasDoEndereco(e.nucleo, e.numero);
  if (!linhas.length) return { predio: null, unidade: null, unidadeProcurada: e.unidade, unidadesVendidas: 0, outrosEnderecos: [] };

  // mais de uma rua com o mesmo núcleo ("R X" e "AL X"): fica com a que tem mais vendas
  const porPredio = new Map<string, Linha[]>();
  for (const l of linhas) porPredio.set(l.building_key, [...(porPredio.get(l.building_key) || []), l]);
  const ordenados = [...porPredio.values()].sort((a, b) => b.length - a.length);
  const doPredio = ordenados[0];
  const base = doPredio[0];

  // uma entrada por unidade (a venda mais recente manda: SQL e área atuais)
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

  return {
    predio: { logradouro: String(base.logradouro || '').trim(), numero: String(base.numero || ''), cep: String(base.cep || '') },
    unidade: e.unidade ? unidades.get(e.unidade) || null : null,
    unidadeProcurada: e.unidade,
    unidadesVendidas: unidades.size,
    outrosEnderecos: ordenados.slice(1, 4).map((g) => `${String(g[0].logradouro).trim()}, ${g[0].numero}`),
  };
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
