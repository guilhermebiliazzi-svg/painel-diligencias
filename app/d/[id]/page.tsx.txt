// Pagina /d/[id] - visualizacao do cliente.
// Renderizacao server-side: query direto no Postgres no carregamento.
// Layout: acordeao por titular (imovel / PF / PJ) com cards coloridos.

import { pool } from '@/lib/db';
import { notFound } from 'next/navigation';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DiligenciaRow = {
  diligencia_id: string;
  endereco: string;
  cliente_nome: string;
  certidao_id: string;
  tipo: string;
  titular: string | null;
  documento_mascarado: string | null;
  certidao: string | null;
  situacao: string;
  resultado: string | null;
  data_emissao: string | null;
  link_documento: string | null;
  emitida_em: string | null;
};

async function fetchDiligencia(id: string): Promise<DiligenciaRow[] | null> {
  if (!UUID_RE.test(id)) return null;
  const result = await pool.query(
    `SELECT *
     FROM painel.v_painel_cliente
     WHERE diligencia_id = $1
     ORDER BY titular NULLS FIRST, certidao`,
    [id]
  );
  const rows = result.rows as DiligenciaRow[];
  return rows.length > 0 ? rows : null;
}

// -----------------------------------------------------------------------------
// Agrupamento
// -----------------------------------------------------------------------------

type GroupTipo = 'imovel' | 'pf' | 'pj';

type Group = {
  key: string;
  tipo: GroupTipo;
  titulo: string;
  subtitulo?: string;
  rows: DiligenciaRow[];
};

function agrupar(rows: DiligenciaRow[], endereco: string): Group[] {
  const imovel: DiligenciaRow[] = [];
  const porDocumento = new Map<string, DiligenciaRow[]>();

  for (const r of rows) {
    if (!r.documento_mascarado) {
      imovel.push(r);
    } else {
      const arr = porDocumento.get(r.documento_mascarado) ?? [];
      arr.push(r);
      porDocumento.set(r.documento_mascarado, arr);
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
    });
  }

  const pessoas: Group[] = [];
  for (const [doc, rowsPessoa] of porDocumento) {
    const ehPJ = doc.includes('/');
    const titular = rowsPessoa[0].titular ?? 'Titular sem nome';
    pessoas.push({
      key: doc,
      tipo: ehPJ ? 'pj' : 'pf',
      titulo: titular,
      subtitulo: `${ehPJ ? 'CNPJ' : 'CPF'} ${doc}`,
      rows: rowsPessoa,
    });
  }

  // PFs primeiro, depois PJs; dentro de cada tipo, alfabetico
  pessoas.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'pf' ? -1 : 1;
    return a.titulo.localeCompare(b.titulo, 'pt-BR');
  });

  return [...groups, ...pessoas];
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

function styleFor(situacao: string): Style {
  return SITUACAO_STYLES[situacao] ?? DEFAULT_STYLE;
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

// -----------------------------------------------------------------------------
// Componentes visuais
// -----------------------------------------------------------------------------

function IconeTipo({ tipo }: { tipo: GroupTipo }) {
  const cls =
    'flex size-10 shrink-0 items-center justify-center rounded-full';
  if (tipo === 'imovel') {
    return (
      <div className={`${cls} bg-blue-100 text-blue-700`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>
    );
  }
  if (tipo === 'pj') {
    return (
      <div className={`${cls} bg-violet-100 text-violet-700`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          <path d="M3 21h18" />
          <path d="M5 21V7l8-4v18" />
          <path d="M19 21V11l-6-4" />
        </svg>
      </div>
    );
  }
  // PF
  return (
    <div className={`${cls} bg-teal-100 text-teal-700`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}

function CertidaoCard({ r }: { r: DiligenciaRow }) {
  const s = styleFor(r.situacao);
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border ${s.cardBorder} ${s.cardBg} p-3`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug text-slate-900">
          {r.certidao ?? r.tipo}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.badgeBg} ${s.badgeText}`}
        >
          <span className={`size-1.5 rounded-full ${s.dot}`} />
          {r.situacao}
        </span>
      </div>
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
            Abrir documento →
          </a>
        )}
      </div>
    </div>
  );
}

function GrupoAcordeao({ g }: { g: Group }) {
  const tot = g.rows.length;
  const concl = g.rows.filter((r) => r.situacao === 'Concluida').length;
  const pct = tot > 0 ? Math.round((concl / tot) * 100) : 0;
  const precisaAtencao = g.rows.some((r) =>
    ['Em revisao', 'Com pendencias'].includes(r.situacao)
  );

  return (
    <details
      style={{ backgroundColor: '#ffffff' }}
      className="group overflow-hidden rounded-2xl border border-slate-200 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-4 transition hover:bg-slate-50 sm:px-6">
        <IconeTipo tipo={g.tipo} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold text-slate-900">
              {g.titulo}
            </p>
            {precisaAtencao && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                Revisar
              </span>
            )}
          </div>
          {g.subtitulo && (
            <p className="truncate text-xs text-slate-500">{g.subtitulo}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden flex-col items-end sm:flex">
            <span className="text-sm font-semibold text-slate-900">
              {concl}/{tot}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              concluídas
            </span>
          </div>
          <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-slate-900 sm:hidden">
            {concl}/{tot}
          </span>
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

      <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-5">
        {g.rows.map((r) => (
          <CertidaoCard key={r.certidao_id} r={r} />
        ))}
      </div>
    </details>
  );
}

// -----------------------------------------------------------------------------
// Pagina
// -----------------------------------------------------------------------------

export default async function DiligenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await fetchDiligencia(id);

  if (!rows) notFound();

  const { endereco, cliente_nome } = rows[0];
  const total = rows.length;
  const concluidas = rows.filter(
    (r: DiligenciaRow) => r.situacao === 'Concluida'
  ).length;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const grupos = agrupar(rows, endereco);

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            RE/MAX Ville — Diligência imobiliária
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
            {endereco}
          </h1>
          {cliente_nome && (
            <p className="mt-1 text-sm text-slate-600">
              Titular: {cliente_nome}
            </p>
          )}
        </header>

        <section
          style={{ backgroundColor: '#ffffff' }}
          className="mb-6 rounded-2xl border border-slate-200 p-6 shadow-sm"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-slate-600">
              Progresso geral
            </h2>
            <span className="text-sm font-semibold text-slate-900">
              {concluidas} de {total}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {pct}% das certidões concluídas
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Documentos por titular
          </h2>
          {grupos.map((g) => (
            <GrupoAcordeao key={g.key} g={g} />
          ))}
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          RE/MAX Ville — Jardins/Itaim, São Paulo
        </footer>
      </main>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await fetchDiligencia(id);
  return {
    title: rows
      ? `${rows[0].endereco} — Diligência RE/MAX Ville`
      : 'Diligência — RE/MAX Ville',
  };
}
