// Lista de ligações — cada corretor monta a sua lista de proprietários, registra
// as ligações e faz o follow-up. O administrador escolhe o corretor.
import Link from 'next/link';
import { exigirPerfil, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  ORIGENS, STATUS, ENCERRADOS, telefoneBr, linkWhats, hojeSP, somarDias, dm,
  type Origem, type Status, type Resultado,
} from '@/lib/ligacoes';
import { novoContato, editarContato, excluirContato, desfazerLigacao } from './actions';
import Registrar from './registrar';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lista de ligações — REMAX Ville' };

type SP = { ver?: string; cor?: string; ok?: string; erro?: string; q?: string };
type Contato = {
  id: number; corretor_id: number; nome: string; telefone: string | null; predio: string | null; unidade: string | null;
  origem: Origem; status: Status; proximo_contato: string | null; observacao: string | null;
};
type Registro = { id: number; contato_id: number; data: string; resultado: Resultado; nota: string | null; criado_em: string };

const OK: Record<string, string> = {
  novo: 'Contato adicionado.', salvo: 'Contato salvo.', excluido: 'Contato excluído.',
  ligacao: 'Ligação registrada.', desfeito: 'Ligação desfeita.',
};
const ERRO: Record<string, string> = {
  'sem-corretor': 'Seu e-mail não está ligado a um corretor associado. Fale com o administrador.',
  nome: 'Preencha o nome do proprietário.',
  resultado: 'Escolha o resultado da ligação.',
  'nao-encontrado': 'Contato não encontrado.',
  gravar: 'Não consegui gravar. Tente de novo.',
};
const EFETIVOS: Resultado[] = ['conversou', 'retornar', 'v1_marcada', 'sem_interesse'];

const CARD = 'rounded-2xl border border-slate-200 p-4 shadow-sm';
const INPUT = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const TAB_ON = '-mb-px border-b-2 border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700';
const TAB_OFF = '-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default async function LigacoesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const perfil = await exigirPerfil();
  const admin = !!perfil.is_admin;
  const eu = await corretorDaPessoa(perfil.email);
  const sb = supabaseAdmin();
  const hoje = hojeSP();

  // Dono da lista mostrada
  let cor: number | null = eu?.id ?? null;
  let corretores: { id: number; nome: string }[] = [];
  if (admin) {
    const { data } = await sb.from('corretores_associados').select('id,nome,status').order('nome');
    corretores = ((data ?? []) as { id: number; nome: string | null; status: string | null }[])
      .filter((c) => (c.status ?? 'ativo') === 'ativo')
      .map((c) => ({ id: Number(c.id), nome: String(c.nome ?? '').split(' - ')[0] }));
    cor = Number(sp.cor) || cor || corretores[0]?.id || null;
  }

  if (!cor) {
    return (
      <Casca>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{ERRO['sem-corretor']}</p>
      </Casca>
    );
  }

  const [con, reg] = await Promise.all([
    sb.from('ligacoes_contatos')
      .select('id,corretor_id,nome,telefone,predio,unidade,origem,status,proximo_contato,observacao')
      .eq('corretor_id', cor).order('proximo_contato', { ascending: true, nullsFirst: true }).limit(3000),
    sb.from('ligacoes_registros')
      .select('id,contato_id,data,resultado,nota,criado_em')
      .eq('corretor_id', cor).order('criado_em', { ascending: false }).limit(5000),
  ]);
  const erroBanco = con.error?.message || reg.error?.message;
  const contatos = (con.data ?? []) as Contato[];
  const registros = (reg.data ?? []) as Registro[];
  const porContato = new Map<number, Registro[]>();
  for (const r of registros) porContato.set(Number(r.contato_id), [...(porContato.get(Number(r.contato_id)) ?? []), r]);

  // Números
  const semana = somarDias(hoje, -6);
  const ativos = contatos.filter((c) => !ENCERRADOS.includes(c.status));
  const paraHoje = ativos.filter((c) => !c.proximo_contato || c.proximo_contato <= hoje);
  const ligHoje = registros.filter((r) => r.data === hoje).length;
  const ligSemana = registros.filter((r) => r.data >= semana).length;
  const efetivos = registros.filter((r) => EFETIVOS.includes(r.resultado)).length;
  const v1 = registros.filter((r) => r.resultado === 'v1_marcada').length;

  // Filtro
  const ver = sp.ver === 'todos' || sp.ver === 'encerrados' ? sp.ver : 'hoje';
  const q = norm(String(sp.q ?? '').trim());
  let lista = ver === 'hoje' ? paraHoje : ver === 'todos' ? ativos : contatos.filter((c) => ENCERRADOS.includes(c.status));
  if (q) lista = lista.filter((c) => norm([c.nome, c.predio, c.unidade, c.telefone].filter(Boolean).join(' ')).includes(q));

  const href = (v: string) => {
    const p = new URLSearchParams({ ver: v });
    if (admin) p.set('cor', String(cor));
    return `/ligacoes?${p.toString()}`;
  };
  const msgOk = sp.ok ? OK[sp.ok] : null;
  const msgErro = sp.erro ? ERRO[sp.erro] ?? 'Algo deu errado.' : null;

  return (
    <Casca>
      {admin && (
        <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs font-medium text-slate-500">Lista do corretor</span>
            <select name="cor" defaultValue={cor} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ver</button>
        </form>
      )}

      {msgOk && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msgOk}</p>}
      {msgErro && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{msgErro}</p>}
      {erroBanco && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Não consegui ler a lista ({erroBanco}). {admin ? 'Rode o sql/2026-11_ligacoes.sql no Supabase.' : 'Fale com o administrador.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Numero titulo="Para ligar hoje" valor={paraHoje.length} destaque />
        <Numero titulo="Ligações hoje" valor={ligHoje} />
        <Numero titulo="Ligações em 7 dias" valor={ligSemana} />
        <Numero titulo="Contatos efetivos" valor={efetivos} />
        <Numero titulo="V1 marcadas" valor={v1} />
      </div>

      <details style={{ backgroundColor: '#ffffff' }} className={`${CARD} mt-6`} open={contatos.length === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">+ Adicionar proprietário à lista</summary>
        <form action={novoContato} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="corretor_id" value={cor} />
          <CamposContato />
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Adicionar</button>
          </div>
        </form>
      </details>

      <nav className="mt-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-1">
          <Link href={href('hoje')} className={ver === 'hoje' ? TAB_ON : TAB_OFF}>Para hoje ({paraHoje.length})</Link>
          <Link href={href('todos')} className={ver === 'todos' ? TAB_ON : TAB_OFF}>Em andamento ({ativos.length})</Link>
          <Link href={href('encerrados')} className={ver === 'encerrados' ? TAB_ON : TAB_OFF}>Encerrados ({contatos.length - ativos.length})</Link>
        </div>
        <form method="get" className="mb-2">
          <input type="hidden" name="ver" value={ver} />
          {admin && <input type="hidden" name="cor" value={cor} />}
          <input type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Buscar nome, prédio, telefone" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        </form>
      </nav>

      <ul className="mt-4 space-y-3">
        {lista.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {ver === 'hoje' ? 'Nenhuma ligação pendente para hoje.' : 'Nenhum contato aqui.'}
          </li>
        )}
        {lista.map((c) => {
          const hist = porContato.get(Number(c.id)) ?? [];
          const zap = linkWhats(c.telefone);
          const atrasado = c.proximo_contato && c.proximo_contato < hoje && !ENCERRADOS.includes(c.status);
          return (
            <li key={c.id} style={{ backgroundColor: '#ffffff' }} className={CARD}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {c.nome}{' '}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cor}`}>{STATUS[c.status].rotulo}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {[c.predio, c.unidade].filter(Boolean).join(' · ') || 'Sem prédio'} · {ORIGENS[c.origem]}
                  </p>
                  {c.observacao && <p className="mt-1 text-xs text-slate-500">{c.observacao}</p>}
                </div>
                <div className="text-right text-sm">
                  {c.telefone ? (
                    <p className="flex items-center justify-end gap-2">
                      <a href={`tel:+${c.telefone.startsWith('55') ? c.telefone : '55' + c.telefone}`} className="font-medium text-blue-700 hover:underline">{telefoneBr(c.telefone)}</a>
                      {zap && <a href={zap} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 hover:underline">WhatsApp</a>}
                    </p>
                  ) : (
                    <p className="text-slate-400">Sem telefone</p>
                  )}
                  <p className={`mt-0.5 text-xs ${atrasado ? 'font-semibold text-rose-700' : 'text-slate-500'}`}>
                    {ENCERRADOS.includes(c.status) ? '' : c.proximo_contato ? `Próximo contato: ${dm(c.proximo_contato)}` : 'Ligar'}
                  </p>
                </div>
              </div>

              {!ENCERRADOS.includes(c.status) && (
                <details className="mt-3 rounded-xl bg-slate-50 p-3" open={ver === 'hoje'}>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Registrar ligação</summary>
                  <div className="mt-3"><Registrar id={Number(c.id)} hoje={hoje} /></div>
                </details>
              )}

              {hist.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-500">Histórico ({hist.length} ligaç{hist.length === 1 ? 'ão' : 'ões'})</summary>
                  <ul className="mt-2 space-y-1">
                    {hist.map((r, i) => (
                      <li key={r.id} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="w-12 shrink-0 tabular-nums text-slate-400">{dm(r.data)}</span>
                        <span className="flex-1">
                          <span className="font-medium text-slate-700">{STATUS[r.resultado].rotulo}</span>
                          {r.nota ? ` — ${r.nota}` : ''}
                        </span>
                        {i === 0 && (
                          <form action={desfazerLigacao}>
                            <input type="hidden" name="registro_id" value={r.id} />
                            <button type="submit" className="text-slate-400 hover:text-rose-700" title="Desfazer esta ligação">desfazer</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-500">Editar contato</summary>
                <form action={editarContato} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={c.id} />
                  <CamposContato c={c} />
                  <label className="text-sm">
                    <span className="block text-xs font-medium text-slate-500">Próximo contato</span>
                    <input type="date" name="proximo_contato" defaultValue={c.proximo_contato ?? ''} className={INPUT} />
                  </label>
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900">Salvar</button>
                  </div>
                </form>
                <form action={excluirContato} className="mt-2">
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="text-xs text-rose-700 hover:underline">Excluir contato da lista</button>
                </form>
              </details>
            </li>
          );
        })}
      </ul>
    </Casca>
  );
}

function CamposContato({ c }: { c?: Contato }) {
  return (
    <>
      <label className="text-sm">
        <span className="block text-xs font-medium text-slate-500">Nome do proprietário</span>
        <input name="nome" required defaultValue={c?.nome ?? ''} className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="block text-xs font-medium text-slate-500">Telefone</span>
        <input name="telefone" inputMode="tel" defaultValue={c?.telefone ?? ''} placeholder="(11) 98765-4321" className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="block text-xs font-medium text-slate-500">Prédio ou endereço</span>
        <input name="predio" defaultValue={c?.predio ?? ''} className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="block text-xs font-medium text-slate-500">Unidade</span>
        <input name="unidade" defaultValue={c?.unidade ?? ''} placeholder="ex.: apto 82" className={INPUT} />
      </label>
      <label className="text-sm">
        <span className="block text-xs font-medium text-slate-500">De onde veio</span>
        <select name="origem" defaultValue={c?.origem ?? 'iconatus'} className={INPUT}>
          {(Object.keys(ORIGENS) as Origem[]).map((o) => (
            <option key={o} value={o}>{ORIGENS[o]}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-xs font-medium text-slate-500">Observação</span>
        <input name="observacao" defaultValue={c?.observacao ?? ''} className={INPUT} />
      </label>
    </>
  );
}

function Numero({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className={`rounded-2xl border p-4 shadow-sm ${destaque ? 'border-blue-300' : 'border-slate-200'}`}>
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${destaque ? 'text-blue-700' : 'text-slate-900'}`}>{valor}</p>
    </div>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Lista de ligações</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          Monte a sua lista de proprietários, registre cada ligação e não perca nenhum retorno.
        </p>
        {children}
      </main>
    </div>
  );
}
