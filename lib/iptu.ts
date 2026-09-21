// Cadastro do IPTU de São Paulo: é daqui que sai a LISTA DE UNIDADES de um
// prédio, com o SQL de cada uma. A DirectD sabe quem mora; ela não sabe quais
// apartamentos existem. Sem esta tabela não há uma linha por unidade.
//
// A tabela vem de sql/iptu_cadastro.sql (arquivo público da prefeitura).
// Ela NÃO traz nome nem documento de proprietário — a prefeitura removeu esses
// campos. Traz o SQL, que é o que abre a certidão de dados cadastrais.

import { pool } from '@/lib/db';

export type UnidadeIptu = {
  sql: string;
  complemento: string;
  /** O que mandar para a DirectD no campo complemento ("Ap 11"). */
  consulta: string | null;
  /** true quando a linha é vaga, box ou garagem — não é moradia. */
  acessorio: boolean;
  areaConstruida: number | null;
  fracaoIdeal: number | null;
  venal: number | null;
  anoInicio: number | null;
};

export type PredioIptu = {
  logradouro: string;
  numero: number | null;
  bairro: string;
  cep: string;
  referencia: string;
  condominio: string;
  codlog: string;
  setor: string;
  quadra: string;
  anoConstrucao: number | null;
  unidades: UnidadeIptu[];
};

export class ErroIptu extends Error {}

const ACESSORIO = /^(VG|VAGA|VAGAS|BOX|BX|GARAGE|GARAGEM|GR|DEP|DEPOSITO|AN|ANEXO|TERRACO)\b/;

/**
 * Traduz o complemento do cadastro para o complemento que a DirectD entende.
 *
 * O cadastro escreve "AP 11 VG", "APTO 72 - VG", "AP 101 E 102 VG"; a DirectD
 * casa por prefixo e espera "Ap 11". Linhas de vaga, box e garagem devolvem
 * null: não adianta procurar morador numa vaga.
 */
export function unidadeParaDirectd(complemento: string): string | null {
  const t = (complemento || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (!t) return null;

  const m = t.match(/\b(APARTAMENTO|APTO|APT|AP|CONJUNTO|CONJ|CJ|CASA|SALA|LOJA)\s*(\d+[A-Z]?)\b/);
  if (!m) return null;

  // "AN APTO 51" é anexo do 51; "VG 12" é vaga. Só descarta quando a linha
  // COMEÇA com acessório e não é um "AN APTO".
  if (ACESSORIO.test(t) && !/\b(APARTAMENTO|APTO|APT|AP|CONJUNTO|CONJ|CJ)\b/.test(t)) return null;

  const rotulo: Record<string, string> = {
    APARTAMENTO: 'Ap', APTO: 'Ap', APT: 'Ap', AP: 'Ap',
    CONJUNTO: 'Cj', CONJ: 'Cj', CJ: 'Cj',
    CASA: 'Casa', SALA: 'Sala', LOJA: 'Loja',
  };
  return `${rotulo[m[1]]} ${m[2]}`;
}

function limpo(v: unknown): string {
  return String(v ?? '').trim();
}

type Linha = {
  sql: string; condominio: string | null; codlog: string | null; logradouro: string | null;
  numero: number | null; complemento: string | null; bairro: string | null;
  referencia: string | null; cep: string | null; fracao_ideal: string | null;
  area_construida: number | null; venal: string | null; ano_construcao: number | null;
  ano_inicio: number | null;
};

const COLUNAS = `sql, condominio, codlog, logradouro, numero, complemento, bairro,
  referencia, cep, fracao_ideal, area_construida, venal, ano_construcao, ano_inicio`;

async function consultar(texto: string, valores: unknown[]): Promise<Linha[]> {
  try {
    const { rows } = await pool.query(texto, valores);
    return rows as Linha[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/iptu_cadastro/.test(msg) && /does not exist|não existe/i.test(msg)) {
      throw new ErroIptu(
        'O cadastro do IPTU ainda não foi carregado no banco. Rode sql/iptu_cadastro.sql.'
      );
    }
    throw e;
  }
}

/** Do SQL de UMA unidade para o prédio inteiro dela. */
async function porSql(sqlUnidade: string): Promise<Linha[]> {
  const chave = sqlUnidade.replace(/[^\dA-Za-z]/g, '');
  const linhas = await consultar(
    `select ${COLUNAS} from public.iptu_cadastro
      where replace(replace(sql, '.', ''), '-', '') = $1 limit 1`,
    [chave]
  );
  if (!linhas.length) return [];
  return irmas(linhas[0]);
}

/** Todas as unidades que dividem o mesmo condomínio (ou o mesmo endereço). */
async function irmas(base: Linha): Promise<Linha[]> {
  const cond = limpo(base.condominio);
  if (cond && cond !== '00-0' && base.codlog) {
    return consultar(
      `select ${COLUNAS} from public.iptu_cadastro
        where codlog = $1 and condominio = $2 order by sql`,
      [base.codlog, cond]
    );
  }
  return consultar(
    `select ${COLUNAS} from public.iptu_cadastro
      where cep = $1 and numero = $2 order by sql`,
    [base.cep, base.numero]
  );
}

/**
 * Acha o prédio pelo CEP + número. O CEP cobre um trecho inteiro da rua, mas
 * CEP + número identifica o imóvel; daí o número de condomínio agrupa as
 * unidades. O logradouro do cadastro vem abreviado ("R CAP PINTO FERREIRA"),
 * então casar por texto erraria — por isso o CEP é obrigatório.
 */
export async function predioPorEndereco(
  entrada: { cep?: string; numero?: string; sql?: string }
): Promise<PredioIptu | null> {
  const sqlUnidade = limpo(entrada.sql);
  let linhas: Linha[] = [];

  if (sqlUnidade) {
    linhas = await porSql(sqlUnidade);
  } else {
    const cep = limpo(entrada.cep).replace(/\D/g, '');
    const numero = limpo(entrada.numero).replace(/\D/g, '');
    if (cep.length !== 8) throw new ErroIptu('Informe o CEP para listar as unidades do prédio.');
    if (!numero) throw new ErroIptu('Informe o número do imóvel.');

    const cepFormatado = `${cep.slice(0, 5)}-${cep.slice(5)}`;
    const candidatas = await consultar(
      `select ${COLUNAS} from public.iptu_cadastro
        where cep = $1 and numero = $2 order by sql`,
      [cepFormatado, Number(numero)]
    );
    if (!candidatas.length) return null;

    // Num mesmo endereço pode haver mais de um condomínio (duas torres). Fica
    // com o maior grupo: é o prédio que o corretor quis.
    const grupos = new Map<string, Linha[]>();
    for (const l of candidatas) grupos.set(limpo(l.condominio), [...(grupos.get(limpo(l.condominio)) ?? []), l]);
    const maior = [...grupos.values()].sort((a, b) => b.length - a.length)[0];
    linhas = await irmas(maior[0]);
  }

  if (!linhas.length) return null;

  const base = linhas[0];
  const setorQuadra = base.sql.replace(/\D/g, '');
  return {
    logradouro: limpo(base.logradouro),
    numero: base.numero,
    bairro: limpo(linhas.find((l) => limpo(l.bairro))?.bairro),
    cep: limpo(base.cep),
    referencia: limpo(linhas.find((l) => limpo(l.referencia))?.referencia),
    condominio: limpo(base.condominio),
    codlog: limpo(base.codlog),
    setor: setorQuadra.slice(0, 3),
    quadra: setorQuadra.slice(3, 6),
    anoConstrucao: base.ano_construcao,
    unidades: linhas.map((l) => ({
      sql: l.sql,
      complemento: limpo(l.complemento),
      consulta: unidadeParaDirectd(limpo(l.complemento)),
      acessorio: unidadeParaDirectd(limpo(l.complemento)) === null,
      areaConstruida: l.area_construida,
      fracaoIdeal: l.fracao_ideal === null ? null : Number(l.fracao_ideal),
      venal: l.venal === null ? null : Number(l.venal),
      anoInicio: l.ano_inicio,
    })),
  };
}
