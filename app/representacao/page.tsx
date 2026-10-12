// Contrato de representação (Venda): preencher o contrato do proprietário,
// conferir o PDF e enviar para assinatura (Clicksign); e acompanhar os enviados.
// O corretor vê só os contratos dele; o administrador vê todos.
import Link from 'next/link';
import { exigirTela, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import NovoContrato from './novo';
import AtualizarStatus from './atualizar-status';
import type { CorretorOpcao } from './actions';

export const metadata = { title: 'Contrato de representação — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;
const CONTRATADA = 'guilherme biliazzi';

type SP = { aba?: string; per?: string; st?: string; cor?: string; q?: string; pg?: string };
type Sig = { nome?: string; papel?: string; assinou?: boolean };
type Row = {
  envelope_id: string;
  status: string;
  phone_corretor: string | null;
  imovel_endereco: string | null;
  signatarios: Sig[] | string | null;
  painel_url: string | null;
  criado_em: string;
  atualizado_em: string;
};

const dig = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const fim8 = (v: unknown) => dig(v).slice(-8);
const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sigs = (v: Row['signatarios']): Sig[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const a = JSON.parse(v);
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }
  return [];
};
const dataBR = (v: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));

const ST: Record<string, [string, string]> = {
  aguardando_assinatura: ['Aguardando', 'bg-amber-100 text-amber-700'],
  parcial: ['Em andamento', 'bg-blue-100 text-blue-700'],
  assinado: ['Assinado por todos', 'bg-emerald-100 text-emerald-700'],
  cancelado: ['Cancelado', 'bg-slate-100 text-slate-500'],
};

export default async function Representacao({ searchParams }: { searchParams: Promise<SP> }) {
  const perfil = await exigirTela('representacao');
  const sp = await searchParams;
  const aba = sp.aba === 'env' ? 'env' : 'novo';
  const admin = !!perfil.is_admin;
  const sb = supabaseAdmin();

  const [{ data: cors }, eu] = await Promise.all([
    sb.from('corretores_associados').select('id,nome,creci,cpf,email,phone,status').order('nome'),
    corretorDaPessoa(perfil.email),
  ]);
  const todos = (cors ?? []) as { id: number; nome: string; creci: string | null; cpf: string | null; email: string | null; phone: string | null; status: string | null }[];
  const opcao = (c: (typeof todos)[number]): CorretorOpcao => ({
    id: Number(c.id),
    nome: String(c.nome ?? '').split(' - ')[0],
    creci: String(c.creci ?? ''),
    cpf: String(c.cpf ?? ''),
    temEmail: !!String(c.email ?? '').trim(),
    temFone: !!dig(c.phone),
  });
  const ativos = todos.filter((c) => (c.status ?? 'ativo') === 'ativo');
  const corretores: CorretorOpcao[] = admin ? ativos.map(opcao) : todos.filter((c) => c.id === eu?.id).map(opcao);

  const { count } = await sb.from('assinaturas_representacao').select('envelope_id', { count: 'exact', head: true }).like('contrato_id', 'modelo_%');

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Contrato de representação</h1>
        <p className="mt-1 text-sm text-slate-600">Preencher o contrato, conferir o PDF e enviar para assinatura eletrônica (Clicksign).</p>

        <nav className="mb-5 mt-6 flex gap-1 border-b border-slate-200">
          <Link
            href="/representacao"
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === 'novo' ? 'border-blue-700 font-semibold text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            Novo contrato
          </Link>
          <Link
            href="/representacao?aba=env"
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === 'env' ? 'border-blue-700 font-semibold text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
          >
            Contratos enviados{admin && count != null ? ` (${count})` : ''}
          </Link>
        </nav>

        {aba === 'novo' ? (
          <NovoContrato admin={admin} corretores={corretores} corretorPadrao={eu && corretores.some((c) => c.id === eu.id) ? eu.id : null} />
        ) : (
          <Enviados sp={sp} admin={admin} meuFone={eu?.phone ?? null} todos={todos} />
        )}
      </main>
    </div>
  );
}

async function Enviados({
  sp,
  admin,
  meuFone,
  todos,
}: {
  sp: SP;
  admin: boolean;
  meuFone: string | null;
  todos: { id: number; nome: string; phone: string | null; status: string | null }[];
}) {
  const per = sp.per || '90d';
  const st = sp.st || '';
  const cor = admin ? sp.cor || '' : '';
  const q = (sp.q || '').trim();
  const pg = Math.max(1, Number(sp.pg) || 1);

  let qb = supabaseAdmin()
    .from('assinaturas_representacao')
    .select('envelope_id,status,phone_corretor,imovel_endereco,signatarios,painel_url,criado_em,atualizado_em')
    .like('contrato_id', 'modelo_%')
    .order('criado_em', { ascending: false })
    .limit(5000);
  const agora = Date.now();
  const desde =
    per === 'mes'
      ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      : per === 'ano'
        ? new Date(new Date().getFullYear(), 0, 1)
        : per === 'tudo'
          ? null
          : new Date(agora - 90 * 86400000);
  if (desde) qb = qb.gte('criado_em', desde.toISOString());
  if (st) qb = qb.eq('status', st);
  const { data, error } = await qb;
  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Não consegui ler os contratos: {error.message}</p>;

  // nome do corretor pelo telefone (é como o envio guarda quem mandou)
  const porFone = new Map<string, string>();
  for (const c of todos) if (fim8(c.phone)) porFone.set(fim8(c.phone), String(c.nome ?? '').split(' - ')[0]);

  let rows = (data ?? []) as Row[];
  if (!admin) {
    const meu = fim8(meuFone);
    rows = meu ? rows.filter((r) => fim8(r.phone_corretor) === meu) : [];
  } else if (cor) {
    const alvo = fim8(todos.find((c) => String(c.id) === cor)?.phone);
    rows = rows.filter((r) => alvo && fim8(r.phone_corretor) === alvo);
  }
  if (q) {
    const b = sem(q);
    rows = rows.filter((r) => sem(`${r.imovel_endereco ?? ''} ${sigs(r.signatarios).map((s) => s.nome).join(' ')}`).includes(b));
  }
  const total = rows.length;
  const pagina = rows.slice((pg - 1) * POR_PAGINA, pg * POR_PAGINA);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // andamento no Clicksign: consulta os em aberto desta página sempre que a lista abre
  // (assinatura ou cancelamento feito no Clicksign aparece logo; intervalo mínimo de 30 s)
  const consultar = pagina
    .filter((r) => (r.status === 'aguardando_assinatura' || r.status === 'parcial') && agora - new Date(r.atualizado_em).getTime() > 30000)
    .map((r) => r.envelope_id)
    .slice(0, 25);

  const url = (mud: Partial<SP>) => {
    const v = { per, st, cor, q, ...mud };
    const p = new URLSearchParams({ aba: 'env' });
    if (v.per && v.per !== '90d') p.set('per', v.per);
    if (v.st) p.set('st', v.st);
    if (v.cor) p.set('cor', v.cor);
    if (v.q) p.set('q', v.q);
    if (mud.pg && Number(mud.pg) > 1) p.set('pg', String(mud.pg));
    return '/representacao?' + p.toString();
  };
  const sel = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  const lab = 'mb-1 block text-xs font-medium text-slate-600';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="aba" value="env" />
        <div>
          <label className={lab}>Enviado em</label>
          <select name="per" defaultValue={per} className={sel}>
            <option value="90d">Últimos 90 dias</option>
            <option value="mes">Este mês</option>
            <option value="ano">Este ano</option>
            <option value="tudo">Tudo</option>
          </select>
        </div>
        <div>
          <label className={lab}>Status</label>
          <select name="st" defaultValue={st} className={sel}>
            <option value="">Todos</option>
            <option value="aguardando_assinatura">Aguardando</option>
            <option value="parcial">Em andamento</option>
            <option value="assinado">Assinado por todos</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        {admin && (
          <div>
            <label className={lab}>Corretor</label>
            <select name="cor" defaultValue={cor} className={sel}>
              <option value="">Todos</option>
              {todos
                .filter((c) => (c.status ?? 'ativo') === 'ativo')
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {String(c.nome ?? '').split(' - ')[0]}
                  </option>
                ))}
            </select>
          </div>
        )}
        <div className={admin ? '' : 'lg:col-span-2'}>
          <label className={lab}>Buscar</label>
          <input name="q" defaultValue={q} placeholder="Endereço ou proprietário" className={sel} />
        </div>
        <div className="flex items-end">
          <button type="submit" className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
            Filtrar
          </button>
        </div>
      </form>

      <AtualizarStatus envelopes={consultar} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-2 py-2 font-semibold">Enviado</th>
              <th className="px-2 py-2 font-semibold">Imóvel / proprietários</th>
              <th className="px-2 py-2 font-semibold">Corretor</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              {admin && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {pagina.map((r) => {
              const s = sigs(r.signatarios);
              const donos = s.filter((x) => x.papel === 'sign' && sem(String(x.nome ?? '')) !== CONTRATADA).map((x) => x.nome);
              const assinaram = s.filter((x) => x.assinou).length;
              const faltam = s.filter((x) => !x.assinou).map((x) => x.nome);
              const [txt, cls] = ST[r.status] ?? [r.status, 'bg-slate-100 text-slate-600'];
              return (
                <tr key={r.envelope_id} className="border-b border-slate-100 align-top">
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{dataBR(r.criado_em)}</td>
                  <td className="px-2 py-2.5">
                    <span className="text-slate-900">{r.imovel_endereco || '—'}</span>
                    {donos.length > 0 && <div className="text-xs text-slate-500">{donos.join(' · ')}</div>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-slate-700">{porFone.get(fim8(r.phone_corretor)) || '—'}</td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
                      {r.status === 'parcial' && s.length ? `${assinaram} de ${s.length} assinaram` : txt}
                    </span>
                    {(r.status === 'parcial' || r.status === 'aguardando_assinatura') && faltam.length > 0 && (
                      <div className="mt-0.5 text-xs text-slate-500">Falta: {faltam.join(', ')}</div>
                    )}
                  </td>
                  {admin && (
                    <td className="whitespace-nowrap px-2 py-2.5">
                      {r.painel_url ? (
                        <a href={r.painel_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                          Clicksign
                        </a>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
            {pagina.length === 0 && (
              <tr>
                <td colSpan={admin ? 5 : 4} className="px-2 py-8 text-center text-sm text-slate-500">
                  Nenhum contrato neste filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>{total ? `Mostrando ${(pg - 1) * POR_PAGINA + 1}–${Math.min(pg * POR_PAGINA, total)} de ${total}` : 'Nada a mostrar'}</span>
        <span className="flex gap-2">
          {pg > 1 ? (
            <Link href={url({ pg: String(pg - 1) })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700">
              ‹ Anterior
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">‹ Anterior</span>
          )}
          {pg < paginas ? (
            <Link href={url({ pg: String(pg + 1) })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700">
              Próxima ›
            </Link>
          ) : (
            <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">Próxima ›</span>
          )}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Inclui os contratos enviados pela EVA no WhatsApp. O andamento é consultado no Clicksign ao abrir a lista.
      </p>
    </section>
  );
}
