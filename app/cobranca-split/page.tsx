// Cobrança com split (Venda): emitir boleto no Asaas com a comissão já dividida
// e acompanhar o histórico das cobranças emitidas, com status.
//
// O histórico filtra no servidor (vencimento, status, tipo, beneficiário,
// busca), 50 por página — o navegador não recebe a lista inteira. "Vencida" = pendente com
// vencimento passado (ou OVERDUE vindo do Asaas).
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import NovaCobranca, { type VendaOpcao, type Beneficiario } from './nova';
import Filtros, { type FiltrosValor } from './filtros';
import AlterarVencimento from './alterar-vencimento';

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
  _doc?: string;
  _desc?: string;
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

  // As tabelas do Asaas são lidas pela service role (a role do pool, painel_looker,
  // só enxerga diligências).
  const sb = supabaseAdmin();
  const [benR, totR] = await Promise.all([
    sb.from('asaas_participantes').select('asaas_wallet_id,nome').not('asaas_wallet_id', 'is', null).order('nome'),
    sb.from('asaas_cobrancas').select('id', { count: 'exact', head: true }),
  ]);
  const beneficiarios: Beneficiario[] = (benR.data ?? []).map((r) => ({ walletId: String(r.asaas_wallet_id), nome: String(r.nome ?? '') }));
  const totalGeral: number = totR.count ?? 0;

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
  const sb = supabaseAdmin();
  const [r, arq, cob] = await Promise.all([
    pool.query(`
      select d.id::text as id, d.endereco,
             (d.dados_completos->'negocio'->'comissao'->>'total') is not null as tem_comissao
        from diligencias d
       order by tem_comissao desc, d.criado_em desc`),
    sb.from('diligencias_arquivo').select('diligencia_id'),
    sb.from('asaas_cobrancas').select('diligencia_id,status').not('diligencia_id', 'is', null).limit(10000),
  ]);
  const arquivadas = new Set((arq.data ?? []).map((a) => String(a.diligencia_id)));
  const ativas = new Map<string, number>();
  for (const c of cob.data ?? []) {
    if (CANCELADO.includes(String(c.status ?? ''))) continue;
    const k = String(c.diligencia_id);
    ativas.set(k, (ativas.get(k) ?? 0) + 1);
  }
  const vendas: VendaOpcao[] = r.rows
    .filter((x) => !arquivadas.has(String(x.id)))
    .map((x) => ({
      id: String(x.id),
      rotulo: curto(x.endereco) || 'Diligência sem endereço',
      cobrancas: ativas.get(String(x.id)) ?? 0,
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

  // Filtros "grossos" no banco (vencimento, tipo, beneficiário); status
  // derivado, busca, totais, ordem e página no servidor, em memória — o volume
  // é de cobranças de comissão (centenas/ano), então cabe folgado.
  const sb = supabaseAdmin();
  let qb = sb
    .from('asaas_cobrancas')
    .select('id,asaas_payment_id,status,valor,vencimento,criado_em,link,parcela,total_parcelas,pagador_nome,pagador_doc,descricao,diligencia_id')
    .limit(10000);
  const [de, ate] = intervalo(f.per, f.de, f.ate, hoje);
  if (de) qb = qb.gte('vencimento', de);
  if (ate) qb = qb.lt('vencimento', ate);
  if (f.tipo === 'venda') qb = qb.not('diligencia_id', 'is', null);
  if (f.tipo === 'avulsa') qb = qb.is('diligencia_id', null);
  if (f.ben) qb = qb.contains('split', JSON.stringify([{ walletId: f.ben }])); // jsonb: o filtro vai como JSON
  const { data: brutas, error } = await qb;
  if (error) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Não consegui ler as cobranças: {error.message}</p>;
  }

  const ids = [...new Set((brutas ?? []).map((c) => c.diligencia_id).filter(Boolean).map(String))];
  const ends = new Map<string, string>();
  if (ids.length) {
    const r = await pool.query('select id::text as id, endereco from diligencias where id = any($1::uuid[])', [ids]);
    for (const x of r.rows) ends.set(String(x.id), String(x.endereco ?? ''));
  }

  const statusDe = (status: string, venc: string | null): Linha['st'] => {
    if (RECEBIDO.includes(status)) return 'rec';
    if (CANCELADO.includes(status)) return 'can';
    if (status === 'OVERDUE' || (status === 'PENDING' && venc && venc < hoje)) return 'ven';
    if (status === 'PENDING' || status === 'AWAITING_RISK_ANALYSIS') return 'pen';
    return 'out';
  };
  const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const busca = sem(f.q);
  const digitos = f.q.replace(/\D/g, '');

  let todas: Linha[] = (brutas ?? []).map((c) => ({
    id: Number(c.id),
    asaas_payment_id: String(c.asaas_payment_id ?? ''),
    status: String(c.status ?? ''),
    st: statusDe(String(c.status ?? ''), c.vencimento ? String(c.vencimento).slice(0, 10) : null),
    valor: c.valor == null ? null : String(c.valor),
    vencimento: c.vencimento ? String(c.vencimento).slice(0, 10) : null,
    criado_em: String(c.criado_em ?? ''),
    link: c.link ? String(c.link) : null,
    parcela: c.parcela ?? null,
    total_parcelas: c.total_parcelas ?? null,
    pagador_nome: c.pagador_nome ? String(c.pagador_nome) : null,
    endereco: c.diligencia_id ? ends.get(String(c.diligencia_id)) ?? null : null,
    diligencia_id: c.diligencia_id ? String(c.diligencia_id) : null,
    _doc: String(c.pagador_doc ?? ''),
    _desc: String(c.descricao ?? ''),
  }));
  if (['rec', 'pen', 'ven', 'can'].includes(f.st)) todas = todas.filter((l) => l.st === f.st);
  if (busca) {
    todas = todas.filter(
      (l) =>
        sem(`${l.endereco ?? ''} ${l.pagador_nome ?? ''} ${l.asaas_payment_id} ${l._desc ?? ''}`).includes(busca) ||
        (digitos.length >= 3 && (l._doc ?? '').includes(digitos))
    );
  }

  const soma = (st: string) => todas.filter((l) => l.st === st).reduce((a, l) => a + (Number(l.valor) || 0), 0);
  const t = { n: todas.length, rec: soma('rec'), pen: soma('pen'), ven: soma('ven') };

  const [campo, sentido] = f.ord.split('_');
  const chave = (l: Linha): number | string =>
    campo === 'valor' ? Number(l.valor) || 0 : campo === 'emit' ? l.criado_em : l.vencimento ?? '';
  todas.sort((a, b) => {
    const x = chave(a);
    const y = chave(b);
    const c = x < y ? -1 : x > y ? 1 : b.id - a.id;
    return sentido === 'asc' ? c : -c;
  });
  const linhas = todas.slice((pg - 1) * POR_PAGINA, pg * POR_PAGINA);
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
                  <td className="whitespace-nowrap px-2 py-2.5">
                    {dataBR(l.vencimento)}
                    {(l.st === 'pen' || l.st === 'ven') && <AlterarVencimento paymentId={l.asaas_payment_id} atual={l.vencimento} />}
                  </td>
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
