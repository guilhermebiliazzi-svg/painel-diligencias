// Página /d/[id] — visualização do cliente.
//
// Renderização é server-side: o Next.js faz a query direto no Postgres
// no carregamento da página (não via fetch client-side). Isso mantém as
// credenciais do banco só no servidor.

import { pool } from '@/lib/db';
import { notFound } from 'next/navigation';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Certidao = {
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

type DiligenciaRow = Certidao & {
  diligencia_id: string;
  endereco: string;
  cliente_nome: string;
};

async function fetchDiligencia(id: string): Promise<DiligenciaRow[] | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await pool.query<DiligenciaRow>(
    `SELECT *
     FROM painel.v_painel_cliente
     WHERE diligencia_id = $1
     ORDER BY titular NULLS LAST, certidao`,
    [id]
  );
  return rows.length > 0 ? rows : null;
}

// Cor e rótulo de cada situação. Se uma nova aparecer no banco, cai no fallback cinza.
const SITUACAO_STYLES: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  Concluida: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  'Em revisao': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  'Com pendencias': {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  Processando: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  'Em processamento': {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  'Aguardando inicio': {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
  },
};
const DEFAULT_STYLE = {
  bg: 'bg-slate-50',
  text: 'text-slate-600',
  dot: 'bg-slate-400',
};

function SituacaoBadge({ situacao }: { situacao: string }) {
  const style = SITUACAO_STYLES[situacao] ?? DEFAULT_STYLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {situacao}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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
  const concluidas = rows.filter((r) => r.situacao === 'Concluida').length;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Cabeçalho */}
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

      {/* Card de progresso */}
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-slate-600">
            Progresso da documentação
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

      {/* Tabela de certidões */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Certidões ({total})
          </h2>
        </div>

        <ul className="divide-y divide-slate-200">
          {rows.map((r) => (
            <li key={r.certidao_id} className="px-6 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">
                    {r.certidao ?? r.tipo}
                  </p>
                  {r.titular && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.titular}
                      {r.documento_mascarado && ` · ${r.documento_mascarado}`}
                    </p>
                  )}
                  {r.data_emissao && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Emitida em {formatDate(r.data_emissao)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <SituacaoBadge situacao={r.situacao} />
                  {r.link_documento && (
                    <a
                      href={r.link_documento}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Abrir documento →
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-8 text-center text-xs text-slate-400">
        RE/MAX Ville — Jardins/Itaim, São Paulo
      </footer>
    </main>
  );
}

// Metadata por página — título aparece na aba do browser
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
