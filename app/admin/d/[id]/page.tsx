// app/admin/d/[id]/page.tsx
// Drill-down da diligencia no painel admin (v2 com categorias).
//
// Agrupamento:
//   - Imovel: 2 categorias (Documentos do imovel | Contas de consumo)
//   - PF:    5 categorias (Documentos pessoais | CNDs do TJSP [e-SAJ/eproc] |
//             CNDs TRF | Trabalhistas | Fiscais e protestos)
//   - PJ:    5 categorias (Documentos cadastrais | CNDs do TJSP | CNDs TRF |
//             Trabalhistas | Fiscais e protestos)
// Dentro de cada categoria as certidoes sao numeradas.

import { pool } from '@/lib/db';
import { listPdfsInFolders, type DriveFile } from '@/lib/drive';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desvincularPDF, vincularPDF, reemitirCertidao, auditarDiligencia, logoutAction } from '../../actions';
import { SubmitButtonAsync } from '../../SubmitButtonAsync';
import { ToggleCardVisivel, TogglePessoaVisivel } from '../../ToggleVisibilidade';
import { CopiarLinkCliente } from '../../CopiarLinkCliente';
import { CardExtraNovo, ExcluirCardExtra } from '../../CardExtra';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminRow = {
  diligencia_id: string;
  endereco: string;
  cliente_nome: string;
  certidao_id: string;
  tipo: string;
  titular: string | null;
  tipo_documento: 'imovel' | 'pf' | 'pj' | 'outro';
  documento_mascarado: string | null;
  documento_normalizado: string | null;
  certidao: string | null;
  situacao: string;
  resultado: string | null;
  data_emissao: string | null;
  link_documento: string | null;
  emitida_em: string | null;
  observacao_ia: string | null;
  drive_file_id: string | null;
  pasta_id: string | null;
  url_pdf: string | null;
  // v2: log de processamento
  cs_status: string | null;
  cs_erro: string | null;
  cs_tentativas: number | null;
  cs_tentativas_obter: number | null;
  cs_atualizado_em: string | null;
  cs_numero_pedido: string | null;
  cs_pedido_data: string | null;
  // visibilidade
  card_oculto: boolean;
  titular_oculto: boolean;
  // extras
  is_extra: boolean;
};

async function fetchDiligencia(id: string): Promise<AdminRow[] | null> {
  if (!UUID_RE.test(id)) return null;
  const result = await pool.query(
    `SELECT *
     FROM painel.v_painel_cliente_admin
     WHERE diligencia_id = $1
     ORDER BY titular NULLS FIRST, certidao`,
    [id]
  );
  const rows = result.rows as AdminRow[];
  return rows.length > 0 ? rows : null;
}

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------

type GroupTipo = 'imovel' | 'pf' | 'pj';

// Subgrupo opcional dentro de uma categoria (ex: e-SAJ vs eproc dentro de TJSP)
type Subgrupo = { titulo: string; tipos: Set<string> };

type Categoria = {
  titulo: string;
  // Lista ordenada de tipos pertencentes (define a ordem da numeracao)
  tipos: string[];
  subgrupos?: Subgrupo[];
};

const CATEGORIAS_IMOVEL: Categoria[] = [
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

const CATEGORIAS_PF: Categoria[] = [
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

const CATEGORIAS_PJ: Categoria[] = [
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

function categoriasFor(tipo: GroupTipo): Categoria[] {
  if (tipo === 'imovel') return CATEGORIAS_IMOVEL;
  if (tipo === 'pj') return CATEGORIAS_PJ;
  return CATEGORIAS_PF;
}

// -----------------------------------------------------------------------------
// Agrupamento por titular
// -----------------------------------------------------------------------------

type Group = {
  key: string;
  tipo: GroupTipo;
  titulo: string;
  subtitulo?: string;
  rows: AdminRow[];
  pasta_id?: string | null;
};

const SITUACOES_ATENCAO = new Set(['Positiva', 'Com pendencias', 'Em revisao']);

function agrupar(rows: AdminRow[], endereco: string): Group[] {
  const imovel: AdminRow[] = [];
  const porDocumento = new Map<string, AdminRow[]>();

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

  const groups: Group[] = [];

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

  const pessoas: Group[] = [];
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
type CategoriaPreenchida = {
  titulo: string;
  rows: AdminRow[];
  subgrupos: { titulo: string | null; rows: AdminRow[] }[];
};

function preencherCategorias(
  rowsTitular: AdminRow[],
  cats: Categoria[]
): CategoriaPreenchida[] {
  const usados = new Set<string>();
  const result: CategoriaPreenchida[] = [];

  for (const cat of cats) {
    // Filtra rows desta categoria, na ordem dos tipos
    const rowsDaCategoria: AdminRow[] = [];
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

// -----------------------------------------------------------------------------
// Estilos por situacao
// -----------------------------------------------------------------------------

type Style = {
  cardBg: string;
  cardBorder: string;
  badgeBg: string;
  badgeText: string;
  dot: string;
};

const SITUACAO_STYLES: Record<string, Style> = {
  Concluida: {
    cardBg: 'bg-emerald-50/50',
    cardBorder: 'border-emerald-200',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    dot: 'bg-emerald-500',
  },
  Positiva: {
    cardBg: 'bg-rose-50/60',
    cardBorder: 'border-rose-300',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    dot: 'bg-rose-500',
  },
  'Em revisao': {
    cardBg: 'bg-amber-50/50',
    cardBorder: 'border-amber-200',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  'Com pendencias': {
    cardBg: 'bg-amber-50/50',
    cardBorder: 'border-amber-200',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    dot: 'bg-amber-500',
  },
  Processando: {
    cardBg: 'bg-sky-50/50',
    cardBorder: 'border-sky-200',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    dot: 'bg-sky-500',
  },
  'Em processamento': {
    cardBg: 'bg-sky-50/50',
    cardBorder: 'border-sky-200',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    dot: 'bg-sky-500',
  },
  'Empresa extinta': {
    cardBg: 'bg-slate-100',
    cardBorder: 'border-slate-400',
    badgeBg: 'bg-slate-800',
    badgeText: 'text-white',
    dot: 'bg-slate-300',
  },
  'Aguardando inicio': {
    cardBg: 'bg-slate-50',
    cardBorder: 'border-slate-200',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    dot: 'bg-slate-400',
  },
};

const DEFAULT_STYLE: Style = {
  cardBg: 'bg-slate-50',
  cardBorder: 'border-slate-200',
  badgeBg: 'bg-slate-100',
  badgeText: 'text-slate-700',
  dot: 'bg-slate-400',
};

function styleFor(s: string): Style {
  return SITUACAO_STYLES[s] ?? DEFAULT_STYLE;
}

function rotuloSituacao(s: string): string {
  if (s === 'Positiva') return 'Constam ocorrências';
  return s;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// v2: formato data + hora pra log de processamento
function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// v2: bloco de log de processamento. So aparece em cards sem PDF vinculado.
function LogProcessamento({ r }: { r: AdminRow }) {
  const tentativas = (r.cs_tentativas ?? 0) + (r.cs_tentativas_obter ?? 0);
  const dataAtu = formatDateTime(r.cs_atualizado_em);
  const erro = r.cs_erro?.trim();

  // Caso 1: tem erro registrado
  if (erro) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50/60 px-2 py-1.5 text-xs text-rose-800">
        <div className="font-semibold">
          ⚠ Última tentativa: {dataAtu || 'data desconhecida'}
        </div>
        <div className="mt-0.5 leading-snug break-words">{erro}</div>
      </div>
    );
  }

  // Caso 2: já houve tentativas mas sem erro registrado (em processamento normal)
  if (tentativas > 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-600">
        <span className="font-medium">⏳ Em processamento.</span>{' '}
        {dataAtu && <>Última atualização: {dataAtu}</>}
        {r.cs_numero_pedido && (
          <> · pedido <span className="font-mono">{r.cs_numero_pedido}</span></>
        )}
      </div>
    );
  }

  // Caso 3: nenhuma tentativa ainda
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-500">
      Aguardando primeiro processamento.
    </div>
  );
}

// -----------------------------------------------------------------------------
// Componentes visuais
// -----------------------------------------------------------------------------

function CardAdmin({
  numero,
  r,
  diligencia_id,
  pdfsDisponiveis,
}: {
  numero: number;
  r: AdminRow;
  diligencia_id: string;
  pdfsDisponiveis: DriveFile[];
}) {
  const s = styleFor(r.situacao);
  const mostrarObs = !!r.observacao_ia && SITUACOES_ATENCAO.has(r.situacao);

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border ${s.cardBorder} ${s.cardBg} p-3`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-slate-900">
          <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
            {numero}
          </span>
          {r.certidao ?? r.tipo}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.badgeBg} ${s.badgeText}`}
        >
          <span className={`size-1.5 rounded-full ${s.dot}`} />
          {rotuloSituacao(r.situacao)}
        </span>
      </div>

      {mostrarObs && (
        <p className={`text-xs leading-snug ${s.badgeText}`}>
          <span className="font-semibold">⚠ Observação: </span>
          {r.observacao_ia}
        </p>
      )}

      {/* v2: Log de processamento — so aparece se nao tem PDF vinculado */}
      {!r.drive_file_id && <LogProcessamento r={r} />}

      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {r.data_emissao
            ? `Emitida em ${formatDate(r.data_emissao)}`
            : '\u00A0'}
        </span>
        {r.link_documento && (
          <a
            href={r.link_documento}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            Abrir PDF →
          </a>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2">
        {/* v2: Reemitir - so aparece quando nao tem PDF vinculado */}
        {!r.drive_file_id && (
          <form
            action={async () => {
              'use server';
              await reemitirCertidao(r.certidao_id, diligencia_id);
            }}
          >
            <SubmitButtonAsync
              pendingLabel="Disparando..."
              className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              title="Dispara o workflow de emissão dessa certidão agora"
            >
              ↻ Reemitir
            </SubmitButtonAsync>
          </form>
        )}
        {r.drive_file_id && (
          <form
            action={async () => {
              'use server';
              await desvincularPDF(r.certidao_id, diligencia_id);
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              Desvincular PDF
            </button>
          </form>
        )}
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
            {r.drive_file_id ? 'Trocar PDF' : 'Vincular PDF'}
          </summary>
          <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 shadow-lg">
            {pdfsDisponiveis.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">
                Nenhum PDF encontrado nas pastas dessa diligência.
              </p>
            ) : (
              <ul className="space-y-1">
                {pdfsDisponiveis.map((f) => (
                  <li key={f.id}>
                    <form
                      action={async () => {
                        'use server';
                        await vincularPDF({
                          certidao_id: r.certidao_id,
                          diligencia_id,
                          drive_file_id: f.id,
                          url_pdf: f.webViewLink ?? '',
                          nome_arquivo: f.name,
                        });
                      }}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                        {f.name}
                      </span>
                      <button
                        type="submit"
                        className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700"
                      >
                        Vincular
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>

        {/* v3: toggle de visibilidade do card no painel cliente */}
        <div className="ml-auto flex items-center gap-2">
          {r.is_extra && (
            <ExcluirCardExtra
              certidao_id={r.certidao_id}
              diligencia_id={diligencia_id}
            />
          )}
          <ToggleCardVisivel
            certidao_id={r.certidao_id}
            diligencia_id={diligencia_id}
            oculto={r.card_oculto}
          />
        </div>
      </div>
    </div>
  );
}

function IconeTipo({ tipo }: { tipo: GroupTipo }) {
  const cls =
    'flex size-10 shrink-0 items-center justify-center rounded-full text-lg';
  if (tipo === 'imovel')
    return <div className={`${cls} bg-blue-100 text-blue-700`}>🏠</div>;
  if (tipo === 'pj')
    return <div className={`${cls} bg-violet-100 text-violet-700`}>🏢</div>;
  return <div className={`${cls} bg-teal-100 text-teal-700`}>👤</div>;
}

function GrupoAdmin({
  g,
  diligencia_id,
  pdfsDoGrupo,
}: {
  g: Group;
  diligencia_id: string;
  pdfsDoGrupo: DriveFile[];
}) {
  const tot = g.rows.length;
  const concl = g.rows.filter((r) => r.situacao === 'Concluida').length;
  const pct = tot > 0 ? Math.round((concl / tot) * 100) : 0;

  const cats = preencherCategorias(g.rows, categoriasFor(g.tipo));

  return (
    <details
      style={{ backgroundColor: '#ffffff' }}
      className="group overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 transition hover:bg-slate-50 sm:px-6">
        <IconeTipo tipo={g.tipo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">
            {g.titulo}
          </p>
          {g.subtitulo && (
            <p className="truncate text-xs text-slate-500">{g.subtitulo}</p>
          )}
          {/* v3: toggle visibilidade da PESSOA (apenas PF/PJ) */}
          {g.tipo !== 'imovel' && g.rows[0]?.documento_normalizado && (
            <div className="mt-1.5">
              <TogglePessoaVisivel
                diligencia_id={diligencia_id}
                documento_normalizado={g.rows[0].documento_normalizado}
                oculta={g.rows[0].titular_oculto}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">
            {concl}/{tot}
          </span>
          <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </summary>

      <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
        <div className="space-y-5">
          {cats.map((cat) => {
            const totCat = cat.rows.length;
            const conclCat = cat.rows.filter((r) => r.situacao === 'Concluida').length;
            return (
              <div key={cat.titulo}>
                <div className="mb-2 flex items-baseline justify-between border-b border-slate-200 pb-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    {cat.titulo}
                  </h3>
                  <span className="text-[10px] font-medium text-slate-500">
                    {conclCat}/{totCat}
                  </span>
                </div>

                <div className="space-y-3">
                  {cat.subgrupos.map((sg, sgIdx) => (
                    <div key={sgIdx}>
                      {sg.titulo && (
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {sg.titulo}
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {sg.rows.map((r, idx) => {
                          // Numeracao continua dentro da categoria
                          const numero = cat.rows.indexOf(r) + 1;
                          return (
                            <CardAdmin
                              key={r.certidao_id}
                              numero={numero}
                              r={r}
                              diligencia_id={diligencia_id}
                              pdfsDisponiveis={pdfsDoGrupo}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* v3: card "+" pra adicionar documento avulso ao grupo */}
          <div className="border-t border-dashed border-slate-200 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <CardExtraNovo
                diligencia_id={diligencia_id}
                pasta_id={
                  g.rows.find((r) => r.pasta_id)?.pasta_id ?? ''
                }
                documento_normalizado={
                  g.tipo === 'imovel' ? null : g.rows[0]?.documento_normalizado ?? null
                }
                titular={g.tipo === 'imovel' ? null : g.titulo}
                pdfsDisponiveis={pdfsDoGrupo}
              />
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

// -----------------------------------------------------------------------------
// Pagina
// -----------------------------------------------------------------------------

export default async function AdminDiligenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await fetchDiligencia(id);
  if (!rows) notFound();

  const { endereco, cliente_nome } = rows[0];
  const grupos = agrupar(rows, endereco);

  const pastaIds = Array.from(
    new Set(
      grupos.map((g) => g.pasta_id).filter((p): p is string => !!p)
    )
  );

  let pdfsTodos: DriveFile[] = [];
  let driveErro: string | null = null;
  try {
    pdfsTodos = await listPdfsInFolders(pastaIds);
  } catch (e: any) {
    driveErro = e?.message ?? 'Erro ao listar PDFs do Drive';
  }

  const pdfsPorPasta = new Map<string, DriveFile[]>();
  for (const f of pdfsTodos) {
    const parents = f.parents ?? [];
    for (const p of parents) {
      const arr = pdfsPorPasta.get(p) ?? [];
      arr.push(f);
      pdfsPorPasta.set(p, arr);
    }
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="text-xs font-semibold uppercase tracking-wider text-blue-600 hover:underline"
            >
              ← Voltar para diligências
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
              {endereco}
            </h1>
            {cliente_nome && (
              <p className="mt-1 text-sm text-slate-600">
                Titular: {cliente_nome}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CopiarLinkCliente diligencia_id={id} />
            <form
              action={async () => {
                'use server';
                await auditarDiligencia(id);
              }}
            >
              <SubmitButtonAsync
                pendingLabel="Auditando..."
                className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                title="Dispara o WF-07 (auditoria) para varrer todos os PDFs nas pastas dessa diligência e tentar vincular nos cards pendentes"
              >
                ↻ Auditar diligência
              </SubmitButtonAsync>
            </form>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        {driveErro && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Não consegui listar PDFs do Drive.</p>
            <p className="mt-1 text-xs">{driveErro}</p>
          </div>
        )}

        <section className="space-y-3">
          {grupos.map((g) => (
            <GrupoAdmin
              key={g.key}
              g={g}
              diligencia_id={id}
              pdfsDoGrupo={g.pasta_id ? pdfsPorPasta.get(g.pasta_id) ?? [] : []}
            />
          ))}
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          RE/MAX Ville — Painel admin
        </footer>
      </main>
    </div>
  );
}
