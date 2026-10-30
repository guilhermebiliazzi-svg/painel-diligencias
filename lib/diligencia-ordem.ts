// lib/diligencia-ordem.ts
// Categorias e ordem das certidões de uma diligência (Imóvel, depois PF e PJ por
// nome; dentro de cada titular, por categoria e na ordem dos tipos). Usado pela
// tela /admin/d/[id] e pelo PDF com todas as certidões, para os dois saírem na
// mesma ordem.

// Campos mínimos de uma linha de painel.v_painel_cliente_admin para agrupar.
export type RowOrdem = {
  certidao_id: string;
  tipo: string;
  titular: string | null;
  tipo_documento: 'imovel' | 'pf' | 'pj' | 'outro';
  documento_normalizado: string | null;
  documento_mascarado: string | null;
  pasta_id: string | null;
};

export function rotuloSituacao(s: string): string {
  if (s === 'Positiva') return 'Constam ocorrências';
  if (s === 'Falhou') return 'Não foi possível emitir';
  return s;
}

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------

export type GroupTipo = 'imovel' | 'pf' | 'pj';

// Subgrupo opcional dentro de uma categoria (ex: e-SAJ vs eproc dentro de TJSP)
export type Subgrupo = { titulo: string; tipos: Set<string> };

export type Categoria = {
  titulo: string;
  // Lista ordenada de tipos pertencentes (define a ordem da numeracao)
  tipos: string[];
  subgrupos?: Subgrupo[];
};

export const CATEGORIAS_IMOVEL: Categoria[] = [
  {
    titulo: 'Documentos do imóvel',
    tipos: [
      'matricula_imovel',
      'dados_cadastrais_imovel',
      'ata_sindico',
      'cnd_condominio',
      'iptu_pref_sp',
    ],
  },
  {
    titulo: 'Contas de consumo',
    tipos: [
      'conta_consumo',
      'conta_consumo_agua',
      'conta_consumo_luz',
      'conta_consumo_gas',
    ],
  },
];

export const CATEGORIAS_PF: Categoria[] = [
  {
    titulo: 'Documentos pessoais',
    tipos: [
      'doc_identidade',
      'cert_estado_civil',
      'comp_residencia',
      'sit_cadastral_rf',
      'cert_simplificada_jucesp_pf',
    ],
  },
  {
    titulo: 'CNDs do TJSP',
    tipos: [
      // eproc
      'tjsp_civel_1g',
      // e-SAJ
      'tjsp_civeis',
      'tjsp_criminais',
      'tjsp_inventarios',
      'tjsp_falencia',
    ],
    subgrupos: [
      {
        titulo: 'eproc',
        tipos: new Set(['tjsp_civel_1g']),
      },
      {
        titulo: 'e-SAJ',
        tipos: new Set([
          'tjsp_civeis',
          'tjsp_criminais',
          'tjsp_inventarios',
          'tjsp_falencia',
        ]),
      },
    ],
  },
  {
    titulo: 'CNDs TRF',
    tipos: ['trf_civel', 'trf_criminal'],
  },
  {
    titulo: 'Trabalhistas',
    tipos: ['trt2_digital', 'trt2_fisico', 'cndt_tst'],
  },
  {
    titulo: 'Fiscais e protestos',
    tipos: [
      'cnd_federal',
      'pge_sp_inscritos',
      'sefaz_sp_nao_inscritos',
      'mobiliaria_pref_sp',
      'cenprot_pf',
    ],
  },
];

export const CATEGORIAS_PJ: Categoria[] = [
  {
    titulo: 'Documentos cadastrais',
    tipos: [
      'sit_cadastral_rf_pj',
      'cert_simplificada_jucesp',
      'contrato_social',
    ],
  },
  {
    titulo: 'CNDs do TJSP',
    tipos: [
      // eproc
      'tjsp_civel_1g',
      // e-SAJ
      'tjsp_civeis',
      'tjsp_criminais',
      'tjsp_inventarios',
      'tjsp_falencia',
    ],
    subgrupos: [
      {
        titulo: 'eproc',
        tipos: new Set(['tjsp_civel_1g']),
      },
      {
        titulo: 'e-SAJ',
        tipos: new Set([
          'tjsp_civeis',
          'tjsp_criminais',
          'tjsp_inventarios',
          'tjsp_falencia',
        ]),
      },
    ],
  },
  {
    titulo: 'CNDs TRF',
    tipos: ['trf_civel'],
  },
  {
    titulo: 'Trabalhistas',
    tipos: ['trt2_digital', 'trt2_fisico', 'cndt_tst_pj', 'crf_fgts'],
  },
  {
    titulo: 'Fiscais e protestos',
    tipos: [
      'cnd_federal_pj',
      'pge_sp_inscritos',
      'sefaz_sp_nao_inscritos',
      'mobiliaria_pref_sp',
      'cenprot_pj',
    ],
  },
];

export function categoriasFor(tipo: GroupTipo): Categoria[] {
  if (tipo === 'imovel') return CATEGORIAS_IMOVEL;
  if (tipo === 'pj') return CATEGORIAS_PJ;
  return CATEGORIAS_PF;
}

// -----------------------------------------------------------------------------
// Agrupamento por titular
// -----------------------------------------------------------------------------

export type Group<T extends RowOrdem = RowOrdem> = {
  key: string;
  tipo: GroupTipo;
  titulo: string;
  subtitulo?: string;
  rows: T[];
  pasta_id?: string | null;
};

export const SITUACOES_ATENCAO = new Set(['Positiva', 'Com pendencias', 'Em revisao', 'Falhou']);

export function agrupar<T extends RowOrdem>(rows: T[], endereco: string): Group<T>[] {
  const imovel: T[] = [];
  const porDocumento = new Map<string, T[]>();

  for (const r of rows) {
    if (r.tipo_documento === 'imovel' || !r.documento_normalizado) {
      imovel.push(r);
    } else {
      const chave = r.documento_normalizado;
      const arr = porDocumento.get(chave) ?? [];
      arr.push(r);
      porDocumento.set(chave, arr);
    }
  }

  const groups: Group<T>[] = [];

  if (imovel.length > 0) {
    groups.push({
      key: 'imovel',
      tipo: 'imovel',
      titulo: 'Imóvel',
      subtitulo: endereco,
      rows: imovel,
      pasta_id: imovel.find((r) => r.pasta_id)?.pasta_id ?? null,
    });
  }

  const pessoas: Group<T>[] = [];
  for (const [, rowsPessoa] of porDocumento) {
    const first = rowsPessoa[0];
    const tipo: GroupTipo = first.tipo_documento === 'pj' ? 'pj' : 'pf';
    const titular = first.titular ?? 'Titular sem nome';
    const rotuloDoc = tipo === 'pj' ? 'CNPJ' : 'CPF';
    pessoas.push({
      key: first.documento_normalizado ?? Math.random().toString(),
      tipo,
      titulo: titular,
      subtitulo: `${rotuloDoc} ${first.documento_mascarado ?? ''}`,
      rows: rowsPessoa,
      pasta_id: rowsPessoa.find((r) => r.pasta_id)?.pasta_id ?? null,
    });
  }

  pessoas.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'pf' ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });

  return [...groups, ...pessoas];
}

/**
 * Agrupa rows do titular por categoria/subgrupo, mantendo a ordem dos tipos
 * definida em CATEGORIAS_*. Tipos nao mapeados caem em "Outros".
 */
export type CategoriaPreenchida<T extends RowOrdem = RowOrdem> = {
  titulo: string;
  rows: T[];
  subgrupos: { titulo: string | null; rows: T[] }[];
};

export function preencherCategorias<T extends RowOrdem>(
  rowsTitular: T[],
  cats: Categoria[]
): CategoriaPreenchida<T>[] {
  const usados = new Set<string>();
  const result: CategoriaPreenchida<T>[] = [];

  for (const cat of cats) {
    // Filtra rows desta categoria, na ordem dos tipos
    const rowsDaCategoria: T[] = [];
    for (const tipo of cat.tipos) {
      const rs = rowsTitular.filter((r) => r.tipo === tipo);
      for (const r of rs) {
        rowsDaCategoria.push(r);
        usados.add(r.certidao_id);
      }
    }
    if (rowsDaCategoria.length === 0) continue;

    // Subgrupos (se a categoria tem)
    if (cat.subgrupos && cat.subgrupos.length > 0) {
      const subs = cat.subgrupos.map((sg) => ({
        titulo: sg.titulo,
        rows: rowsDaCategoria.filter((r) => sg.tipos.has(r.tipo)),
      }));
      // Filtra sub-grupos vazios
      const subsNaoVazios = subs.filter((s) => s.rows.length > 0);
      result.push({
        titulo: cat.titulo,
        rows: rowsDaCategoria,
        subgrupos: subsNaoVazios.map((s) => ({
          titulo: s.titulo,
          rows: s.rows,
        })),
      });
    } else {
      result.push({
        titulo: cat.titulo,
        rows: rowsDaCategoria,
        subgrupos: [{ titulo: null, rows: rowsDaCategoria }],
      });
    }
  }

  // "Outros" - tipos não mapeados
  const outros = rowsTitular.filter((r) => !usados.has(r.certidao_id));
  if (outros.length > 0) {
    result.push({
      titulo: 'Outros',
      rows: outros,
      subgrupos: [{ titulo: null, rows: outros }],
    });
  }

  return result;
}
