// Cobrança com split (Venda): emitir boleto no Asaas com a comissão já dividida
// e acompanhar o histórico das cobranças emitidas, com status.
//
// O histórico filtra no banco (vencimento, status, tipo, beneficiário, busca),
// 50 por página — não carrega tudo de uma vez. "Vencida" = pendente com
// vencimento passado (ou OVERDUE vindo do Asaas).
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { pool } from '@/lib/db';
import NovaCobranca, { type VendaOpcao, type Beneficiario } from './nova';
import Filtros, { type FiltrosValor } from './filtros';

export const metadata = { title: 'Cobrança com split — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;
const RECEBIDO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const CANCELADO = ['CANCELADA', 'CANCELLED', 'DELETED', 'REFUNDED', 'REFUND_REQUESTED'];

type SP = {
  aba?: string;
  per?: string;
  de?: string;
  ate?: string;
  st?: string;
  tipo?: string;
  ben?: string;
  q?: string;
  ord?: string;
  pg?: string;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function somaDias(dia: string, n: number): string {
  const d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
function inicioMes(dia: string, deslocamento = 0): string {
  const [a, m] = dia.split('-').map(Number);
  return iso(new Date(Date.UTC(a, m - 1 + deslocamento, 1, 12)));
}

// [de, ate) — ate exclusivo
function intervalo(per: string, de: string, ate: string, hoje: string): [string | null, string | null] {
  switch (per) {
    case 'prox30':
      return [hoje, somaDias(hoje, 31)];
    case 'mespassado':
      return [inicioMes(hoje, -1), inicioMes(hoje)];
    case '90d':
      return [somaDias(hoje, -90), somaDias(hoje, 1)];
    case 'ano':
      return [hoje.slice(0, 4) + '-01-01', String(Number(hoje.slice(0, 4)) + 1) + '-01-01'];
    case 'datas':
      return [DATA.test(de) ? de : null, DATA.test(ate) ? somaDias(ate, 1) : null];
    case 'tudo':
      return [null, null];
    default:
      return [inicioMes(hoje), inicioMes(hoje, 1)];
  }
}

const ORDENS: Record<string, string> = {
  venc_desc: 'c.vencimento desc nulls last, c.id desc',
  venc_asc: 'c.vencimento asc nulls last, c.id',
  valor_desc: 'c.valor desc nulls last, c.id desc',
  valor_asc: 'c.valor asc nulls last, c.id',
  emit_desc: 'c.criado_em desc, c.id desc',
  emit_asc: 'c.criado_em asc, c.id',
};

type Linha = {
  id: number;
  asaas_payment_id: string;
  status: string;
  st: 'rec' | 'pen' | 'ven' | 'can' | 'out';
  valor: string | null;
  vencimento: string | null;
  criado_em: string;
  link: string | null;
  parcela: number | null;
  total_parcelas: number | null;
  pagador_nome: string | null;
  endereco: string | null;
  diligencia_id: string | null;
};

const brl = (v: unknown) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (v: unknown) => {
  if (!v) return '—';
  const s = v instanceof Date ? iso(v) : String(v).slice(0, 10);
  return s.split('-').reverse().join('/');
};
const emitidaBR = (v: unknown) => {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(String(v));
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
};
const curto = (e: string | null) =>
  String(e || '')
    .replace(/\s*-\s*S[ÃA]O PAULO\/SP$/i, '')
    .replace(/\bAPARTAMENTO\b/gi, 'AP')
    .replace(/\bAVENIDA\b/gi, 'AV.');

const ST_TXT: Record<string, [string, string]> = {
  rec: ['Recebida', 'bg-emerald-100 text-emerald-700'],
  pen: ['Pendente', 'bg-amber-100 text-amber-700'],
  ven: ['Vencida', 'bg-rose-100 text-rose-700'],
  can: ['Cancelada', 'bg-slate-100 text-slate-500'],
  out: ['', 'bg-slate-100 text-slate-600'],
};

export default async function CobrancaSplit({ searchParams }: { searchParams: Promise<SP> }) {
  await exigirTela('cobrancas');
  const sp = await searchParams;
  const aba = sp.aba === 'hist' ? 'hist' : 'nova';

  const [benR, totR] = await Promise.all([
    pool.query('select asaas_wallet_id, nome from asaas_participantes where asaas_wallet_id is not null order by nome'),
    pool.query('select count(*)::int n from asaas_cobrancas'),
  ]);
  const beneficiarios: Beneficiario[] = benR.rows.map((r) => ({ walletId: r.asaas_wallet_id, nome: r.nome }));
  const totalGeral: number = totR.rows[0]?.n ?? 0;

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Cobrança com split</h1>
        <p className="mt-1 text-sm text-slate-600">Boleto no Asaas com a comissão já dividida entre os corretores.</p>

        <nav className="mb-5 mt-6 flex gap-1 border-b border-slate-200">
          <Link
            href="/cobranca-split"
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === 'nova' ? 'border-blue-700 font-semibold text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            Nova cobrança
          </Link>
          <Link
            href="/cobranca-split?aba=hist"
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === 'hist' ? 'border-blue-700 font-semibold text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            Histórico ({totalGeral})
          </Link>
        </nav>

        {aba === 'nova' ? <Nova beneficiarios={beneficiarios} /> : <Historico sp={sp} beneficiarios={beneficiarios} />}
      </main>
    </div>
  );
}

async function Nova({ beneficiarios }: { beneficiarios: Beneficiario[] }) {
  // vendas = diligências não arquivadas; as com comissão na ficha primeiro
  const r = await pool.query(`
    select d.id, d.endereco,
           (d.dados_completos->'negocio'->'comissao'->>'total') is not null as tem_comissao,
           (select count(*)::int from asaas_cobrancas c
             where c.diligencia_id = d.id and coalesce(c.status,'') <> all($1::text[])) as cobrancas
      from diligencias d
     where not exists (select 1 from diligencias_arquivo a where a.diligencia_id = d.id::text)
     order by tem_comissao desc, d.criado_em desc`, [CANCELADO]);
  const vendas: VendaOpcao[] = r.rows.map((x) => ({
    id: x.id,
    rotulo: curto(x.endereco) || 'Diligência sem endereço',
    cobrancas: x.cobrancas,
    temComissao: !!x.tem_comissao,
  }));
  return <NovaCobranca vendas={vendas} beneficiarios={beneficiarios} />;
}

async function Historico({ sp, beneficiarios }: { sp: SP; beneficiarios: Beneficiario[] }) {
  const hoje = hojeSP();
  const f: FiltrosValor = {
    per: sp.per || 'mes',
    de: sp.de || '',
    ate: sp.ate || '',
    st: sp.st || '',
    tipo: sp.tipo || '',
    ben: sp.ben || '',
    q: (sp.q || '').trim(),
    ord: ORDENS[sp.ord || ''] ? sp.ord! : 'venc_desc',
  };
  const pg = Math.max(1, Number(sp.pg) || 1);

  const params: unknown[] = [RECEBIDO, CANCELADO, hoje];
  const add = (v: unknown) => {
    params.push(v);
    return '$' + params.length;
  };
  const conds: string[] = [];
  const [de, ate] = intervalo(f.per, f.de, f.ate, hoje);
  if (de) conds.push(`c.vencimento >= ${add(de)}::date`);
  if (ate) conds.push(`c.vencimento < ${add(ate)}::date`);
  if (['rec', 'pen', 'ven', 'can'].includes(f.st)) conds.push(`c.st = ${add(f.st)}`);
  if (f.tipo === 'venda') conds.push('c.diligencia_id is not null');
  if (f.tipo === 'avulsa') conds.push('c.diligencia_id is null');
  if (f.ben) conds.push(`c.split @> jsonb_build_array(jsonb_build_object('walletId', ${add(f.ben)}::text))`);
  if (f.q) {
    const like = add('%' + f.q + '%');
    const digitos = f.q.replace(/\D/g, '');
    const porDoc = digitos.length >= 3 ? ` or c.pagador_doc like ${add('%' + digitos + '%')}` : '';
    conds.push(
      `(d.endereco ilike ${like} or c.pagador_nome ilike ${like} or c.asaas_payment_id ilike ${like} or c.descricao ilike ${like}${porDoc})`
    );
  }
  const where = conds.length ? 'where ' + conds.join(' and ') : '';

  // status derivado: o "Vencida" não depende do aviso do Asaas chegar
  const base = `
    from (
      select c.*,
             case
               when c.status = any($1::text[]) then 'rec'
               when c.status = any($2::text[]) then 'can'
               when c.status = 'OVERDUE' or (c.status = 'PENDING' and c.vencimento < $3::date) then 'ven'
               when c.status in ('PENDING','AWAITING_RISK_ANALYSIS') then 'pen'
               else 'out'
             end as st
        from asaas_cobrancas c
    ) c
    left join diligencias d on d.id = c.diligencia_id
    ${where}`;

  const [lin, tot] = await Promise.all([
    pool.query(
      `select c.id, c.asaas_payment_id, c.status, c.st, c.valor, c.vencimento::text as vencimento, c.criado_em, c.link, c.parcela, c.total_parcelas,
              c.pagador_nome, c.diligencia_id, d.endereco
       ${base}
       order by ${ORDENS[f.ord]}
       limit ${POR_PAGINA} offset ${(pg - 1) * POR_PAGINA}`,
      params
    ),
    pool.query(
      `select count(*)::int n,
              coalesce(sum(c.valor) filter (where c.st = 'rec'), 0) rec,
              coalesce(sum(c.valor) filter (where c.st = 'pen'), 0) pen,
              coalesce(sum(c.valor) filter (where c.st = 'ven'), 0) ven
       ${base}`,
      params
    ),
  ]);
  const linhas = lin.rows as Linha[];
  const t = tot.rows[0] as { n: number; rec: string; pen: string; ven: string };
  const paginas = Math.max(1, Math.ceil(t.n / POR_PAGINA));

  const url = (mud: Partial<FiltrosValor> & { pg?: number }) => {
    const v = { ...f, ...mud };
    const p = new URLSearchParams({ aba: 'hist', per: v.per });
    if (v.per === 'datas') {
      if (v.de) p.set('de', v.de);
      if (v.ate) p.set('ate', v.ate);
    }
    for (const k of ['st', 'tipo', 'ben', 'q'] as const) if (v[k]) p.set(k, v[k]);
    if (v.ord !== 'venc_desc') p.set('ord', v.ord);
    if (mud.pg && mud.pg > 1) p.set('pg', String(mud.pg));
    return '/cobranca-split?' + p.toString();
  };
  const ordenar = (campo: 'venc' | 'valor' | 'emit') => {
    const desc = f.ord === `${campo}_desc`;
    return url({ ord: `${campo}_${desc ? 'asc' : 'desc'}` });
  };
  const seta = (campo: string) => (f.ord === `${campo}_desc` ? ' ▾' : f.ord === `${campo}_asc` ? ' ▴' : ' ⇅');
  const filtrado = f.per !== 'tudo' || f.st || f.tipo || f.ben || f.q;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Filtros key={JSON.stringify(f)} valor={f} beneficiarios={beneficiarios} />

      <div className="mb-4 grid gap-2.5 sm:grid-cols-4">
        <Resumo rotulo="No filtro" valor={`${t.n} cobrança${t.n === 1 ? '' : 's'}`} />
        <Resumo rotulo="Recebido" valor={brl(t.rec)} cor="text-emerald-700" />
        <Resumo rotulo="A receber" valor={brl(t.pen)} cor="text-amber-700" />
        <Resumo rotulo="Vencido" valor={brl(t.ven)} cor="text-rose-700" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-2 py-2 font-semibold">
                <Link href={ordenar('emit')}>Emitida{seta('emit')}</Link>
              </th>
              <th className="px-2 py-2 font-semibold">Venda / pagador</th>
              <th className="px-2 py-2 text-right font-semibold">
                <Link href={ordenar('valor')}>Valor{seta('valor')}</Link>
              </th>
              <th className="px-2 py-2 font-semibold">
                <Link href={ordenar('venc')}>Vencimento{seta('venc')}</Link>
              </th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const [txt, cls] = ST_TXT[l.st] ?? ST_TXT.out;
              return (
                <tr key={l.id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{emitidaBR(l.criado_em)}</td>
                  <td className="px-2 py-2.5">
                    {l.diligencia_id ? (
                      <span className="text-slate-900">
                        {curto(l.endereco) || 'Venda'}
                        {l.total_parcelas && l.total_parcelas > 1 ? ` (${l.parcela}/${l.total_parcelas})` : ''}
                      </span>
                    ) : (
                      <span className="font-semibold text-violet-700">Avulsa</span>
                    )}
                    {l.pagador_nome && <div className="text-xs text-slate-500">{l.pagador_nome}</div>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{brl(l.valor)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">{dataBR(l.vencimento)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
                      {txt || l.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    {l.link ? (
                      <a href={l.link} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                        {l.st === 'rec' ? 'comprovante' : 'boleto'}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">{l.asaas_payment_id}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-sm text-slate-500">
                  Nenhuma cobrança neste filtro.
                  {filtrado && (
                    <>
                      {' '}
                      <Link href={url({ per: 'tudo', de: '', ate: '', st: '', tipo: '', ben: '', q: '' })} className="text-blue-700 hover:underline">
                        Ver todas
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {t.n ? `Mostrando ${(pg - 1) * POR_PAGINA + 1}–${Math.min(pg * POR_PAGINA, t.n)} de ${t.n}` : 'Nada a mostrar'}
        </span>
        <span className="flex gap-2">
          {pg > 1 ? (
            <Link href={url({ pg: pg - 1 })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700">
              ‹ Anterior
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">‹ Anterior</span>
          )}
          {pg < paginas ? (
            <Link href={url({ pg: pg + 1 })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700">
              Próxima ›
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">Próxima ›</span>
          )}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        O status vem do Asaas (aviso automático de pagamento). “Vencida” = pendente com vencimento passado. Nas recebidas, o link abre o comprovante.
      </p>
    </section>
  );
}

function Resumo({ rotulo, valor, cor = 'text-slate-900' }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="block text-[11px] uppercase tracking-wider text-slate-500">{rotulo}</span>
      <b className={`text-base ${cor}`}>{valor}</b>
    </div>
  );
}
