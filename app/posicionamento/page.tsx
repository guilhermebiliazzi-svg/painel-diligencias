// Posicionamento (Venda): o corretor mapeia os condomínios de uma região e o
// painel mostra o quanto ele já domina dela. Pensado para os novatos construírem
// o território; serve para qualquer corretor. O corretor vê só o mapa dele; o
// administrador escolhe o corretor.
import Link from 'next/link';
import { exigirTela, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  resumir, prioridade, completude, pitch, brl0, int,
  STATUS_REL, COR_PRIORIDADE, type Condominio, type Prioridade,
} from '@/lib/posicionamento';
import Ficha from './ficha';
import VisaoGeral from './visao-geral';
import Seletor from './seletor';

export const metadata = { title: 'Posicionamento — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

type SP = { aba?: string; cor?: string; reg?: string; ord?: string; ok?: string; erro?: string };
type Aba = 'equipe' | 'mapa' | 'novo';

const hojeSP = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);

const ERROS: Record<string, string> = {
  'sem-corretor': 'Seu e-mail não está ligado a um corretor associado. Fale com o administrador.',
  obrigatorio: 'Preencha a região e o nome do condomínio.',
  'nao-encontrado': 'Condomínio não encontrado.',
};

// Abas: o corretor tem "Meu mapa" e "+ Adicionar prédio"; o administrador tem
// "Equipe" (visão geral) e "Por corretor" (o mapa de um corretor escolhido).
// Links antigos (geral, painel, lista) continuam funcionando.
function lerAba(v: string | undefined, admin: boolean): Aba {
  if (v === 'novo') return 'novo';
  if (v === 'mapa' || v === 'painel' || v === 'lista') return 'mapa';
  if (admin && (v === 'equipe' || v === 'geral')) return 'equipe';
  return admin ? 'equipe' : 'mapa';
}

const TAB_ON = '-mb-px border-b-2 border-blue-700 px-4 py-2.5 text-sm font-semibold text-blue-700';
const TAB_OFF = '-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm text-slate-600 hover:text-slate-900';

export default async function Posicionamento({ searchParams }: { searchParams: Promise<SP> }) {
  const perfil = await exigirTela('posicionamento');
  const sp = await searchParams;
  const admin = !!perfil.is_admin;
  const sb = supabaseAdmin();
  const eu = await corretorDaPessoa(perfil.email);
  // admin sem ?aba nem ?cor abre na Equipe; com ?cor (link do ranking) abre o mapa
  const aba: Aba = admin && !sp.aba && sp.cor ? 'mapa' : lerAba(sp.aba, admin);

  if (admin && aba === 'equipe') {
    return (
      <Casca>
        <nav className="mb-5 flex gap-1 border-b border-slate-200">
          <span className={TAB_ON}>Equipe</span>
          <Link href="/posicionamento?aba=mapa" className={TAB_OFF}>Por corretor</Link>
        </nav>
        <VisaoGeral hoje={hojeSP()} />
      </Casca>
    );
  }

  // Quem é o dono do mapa mostrado
  let corId: number | null = eu?.id ?? null;
  let opcoesCorretor: { id: number; nome: string; n: number }[] = [];
  if (admin) {
    const [{ data: cors }, { data: donos }] = await Promise.all([
      sb.from('corretores_associados').select('id,nome,status').order('nome'),
      sb.from('posicionamento_condominios').select('corretor_id').limit(20000),
    ]);
    const n = new Map<number, number>();
    for (const d of (donos ?? []) as { corretor_id: number }[]) n.set(Number(d.corretor_id), (n.get(Number(d.corretor_id)) ?? 0) + 1);
    opcoesCorretor = ((cors ?? []) as { id: number; nome: string | null; status: string | null }[])
      .map((c) => ({ id: Number(c.id), nome: String(c.nome ?? '').split(' - ')[0], n: n.get(Number(c.id)) ?? 0, ativo: (c.status ?? 'ativo') === 'ativo' }))
      .filter((c) => c.ativo || c.n > 0)
      // quem tem mapa primeiro, depois por nome
      .sort((a, b) => (b.n > 0 ? 1 : 0) - (a.n > 0 ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const pedido = Number(sp.cor);
    corId = opcoesCorretor.some((c) => c.id === pedido) ? pedido : (opcoesCorretor.find((c) => c.n > 0) ?? opcoesCorretor[0])?.id ?? null;
  }

  if (!corId) {
    return (
      <Casca>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {admin ? 'Nenhum corretor ativo encontrado.' : ERROS['sem-corretor']}
        </p>
      </Casca>
    );
  }

  const { data, error } = await sb
    .from('posicionamento_condominios')
    .select('*')
    .eq('corretor_id', corId)
    .order('nome')
    .limit(2000);
  if (error) {
    return (
      <Casca>
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Não consegui ler o mapa: {error.message}</p>
      </Casca>
    );
  }
  const todos = (data ?? []) as Condominio[];
  const regioes = [...new Set(todos.map((c) => c.regiao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  // sem região escolhida = visão geral do corretor (todas as regiões juntas)
  const reg = sp.reg && regioes.includes(sp.reg) ? sp.reg : regioes.length === 1 ? regioes[0] : '';
  const lista = reg ? todos.filter((c) => c.regiao === reg) : todos;
  const opcoesRegiao = [
    { valor: '', texto: `Todas as regiões (${regioes.length})`, href: url0({ reg: '', ord: '' }) },
    ...regioes.map((r) => ({ valor: r, texto: `${r} (${todos.filter((c) => c.regiao === r).length})`, href: url0({ reg: r, ord: '' }) })),
  ];
  const nomeCorretor = opcoesCorretor.find((c) => c.id === corId)?.nome ?? '';

  const url = (m: Partial<SP>) => url0({ reg, ...m });
  function url0(m: Partial<SP>) {
    const v = { aba: aba as string, cor: admin ? String(corId) : '', reg: '', ...m };
    const p = new URLSearchParams();
    if (admin || v.aba !== 'mapa') p.set('aba', v.aba);
    if (v.cor) p.set('cor', v.cor);
    if (v.reg) p.set('reg', v.reg);
    if (v.ord) p.set('ord', v.ord);
    const s = p.toString();
    return '/posicionamento' + (s ? '?' + s : '');
  }

  return (
    <Casca>
      {sp.ok && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Condomínio salvo no mapa.</p>}
      {sp.erro && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{ERROS[sp.erro] ?? sp.erro}</p>}

      {admin ? (
        <>
          <nav className="mb-5 flex gap-1 border-b border-slate-200">
            <Link href="/posicionamento" className={TAB_OFF}>Equipe</Link>
            <span className={TAB_ON}>Por corretor</span>
          </nav>
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <Seletor
              rotulo="Corretor"
              valor={String(corId)}
              opcoes={opcoesCorretor.map((c) => ({
                valor: String(c.id),
                texto: c.n ? `${c.nome} (${c.n} prédio${c.n > 1 ? 's' : ''})` : `${c.nome} — sem prédios`,
                href: `/posicionamento?aba=mapa&cor=${c.id}`,
              }))}
            />
            {regioes.length > 1 && aba === 'mapa' && (
              <Seletor rotulo="Região" valor={reg} opcoes={opcoesRegiao} />
            )}
            <div className="flex-1" />
            {aba === 'mapa' ? (
              <Link href={url({ aba: 'novo' })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Adicionar prédio para {nomeCorretor.split(' ')[0]}</Link>
            ) : (
              <Link href={url({ aba: 'mapa' })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">← Voltar ao mapa</Link>
            )}
          </div>
        </>
      ) : (
        <>
          <nav className="mb-5 flex gap-1 border-b border-slate-200">
            <Link href="/posicionamento" className={aba === 'mapa' ? TAB_ON : TAB_OFF}>Meu mapa{todos.length ? ` (${todos.length})` : ''}</Link>
            <Link href="/posicionamento?aba=novo" className={aba === 'novo' ? TAB_ON : TAB_OFF}>+ Adicionar prédio</Link>
          </nav>
          {regioes.length > 1 && aba === 'mapa' && (
            <div className="mb-5">
              <Seletor rotulo="Região" valor={reg} opcoes={opcoesRegiao} />
            </div>
          )}
        </>
      )}

      {aba === 'novo' ? (
        <Ficha c={null} regioes={regioes} regiaoPadrao={reg || regioes[0] || ''} corretores={null} corretorPadrao={corId} corretorFixo={admin ? corId : null} />
      ) : !todos.length ? (
        admin ? (
          <p style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {nomeCorretor || 'Este corretor'} ainda não mapeou nenhum condomínio.
          </p>
        ) : (
          <BoasVindas />
        )
      ) : (
        <div className="space-y-8">
          <Painel lista={lista} regiao={reg} regioes={regioes} url={url} />
          {!reg && <PorRegiao todos={todos} regioes={regioes} url={url} />}
          <div id="predios" className="scroll-mt-4">
            <h2 className="mb-3 text-base font-semibold text-slate-900">{reg ? `Prédios de ${reg}` : 'Todos os prédios'} ({lista.length})</h2>
            <Lista lista={lista} ord={sp.ord || 'prioridade'} url={url} comRegiao={!reg} />
          </div>
        </div>
      )}
    </Casca>
  );
}

function BoasVindas() {
  const passos: [string, string][] = [
    ['Mapear', 'Escolha uma região de poucos quarteirões e cadastre aqui os prédios, ainda da mesa: endereço, m², vendas, anúncios.'],
    ['Abordar', 'Na portaria, peça para falar com o zelador. Se ele não puder na hora, agende 15 minutos.'],
    ['Pesquisar', 'Faça a pesquisa sobre o prédio, anote na ficha e saia com o contato salvo dos dois lados.'],
    ['Manter', 'Visitas curtas e frequentes. Cada contato registrado aqui, com a próxima ação e a data.'],
  ];
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Comece o seu mapa</h2>
      <p className="mt-1 text-sm text-slate-600">Seu posicionamento é construído prédio a prédio, em quatro passos:</p>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2">
        {passos.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{i + 1}</span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{t}</p>
              <p className="text-sm text-slate-600">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/posicionamento?aba=novo" className="mt-6 inline-block rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
        Adicionar o primeiro prédio
      </Link>
    </section>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">← Voltar ao painel</Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Posicionamento</h1>
        <p className="mt-1 mb-6 text-sm text-slate-600">
          Mapeie os condomínios da sua região — prédio, mercado, concorrência e relacionamento. Quanto mais completo o mapa, mais forte o seu posicionamento.
        </p>
        {children}
      </main>
    </div>
  );
}

function Card({ titulo, valor, sub, destaque }: { titulo: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className={`rounded-2xl border p-4 shadow-sm ${destaque ? 'border-blue-300' : 'border-slate-200'}`}>
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold ${destaque ? 'text-blue-700' : 'text-slate-900'}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Barra({ pct, cor = 'bg-blue-600' }: { pct: number; cor?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${cor}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}

function juntar(xs: string[]) {
  return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1];
}

function PorRegiao({ todos, regioes, url }: { todos: Condominio[]; regioes: string[]; url: (m: Partial<SP>) => string }) {
  const hoje = hojeSP();
  const linhas = regioes
    .map((g) => {
      const l = todos.filter((c) => c.regiao === g);
      return { g, r: resumir(l, hoje), a: l.filter((c) => prioridade(c) === 'A').length };
    })
    .sort((x, y) => y.r.total - x.r.total);
  return (
    <Secao titulo="Por região">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              {['Região', 'Prédios', 'Unidades', 'Domínio', 'Com relacionamento', 'Fichas completas', 'Prior. A', 'Ações atrasadas'].map((t) => (
                <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map(({ g, r, a }) => (
              <tr key={g} className="hover:bg-slate-50">
                <td className="px-3 py-2"><Link href={url({ reg: g, ord: '' })} className="font-medium text-slate-900 hover:text-blue-700">{g}</Link></td>
                <td className="px-3 py-2 text-slate-700">{r.total}</td>
                <td className="px-3 py-2 text-slate-700">{int(r.unidades)}</td>
                <td className="w-40 px-3 py-2">
                  <Barra pct={r.dominio} />
                  <p className="mt-1 text-[11px] text-slate-500">{r.dominio}%{r.dominioBase === 'predios' ? ' (por prédios)' : ''}</p>
                </td>
                <td className="px-3 py-2 text-slate-700">{r.comRelacao} de {r.total}</td>
                <td className="px-3 py-2 text-slate-700">{r.completos}/{r.total} · {r.completudeMedia}%</td>
                <td className="px-3 py-2 text-slate-700">{a}</td>
                <td className={`px-3 py-2 ${r.acoesAtrasadas.length ? 'font-semibold text-rose-700' : 'text-slate-700'}`}>{r.acoesAtrasadas.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Secao>
  );
}

function Painel({ lista, regiao, regioes, url }: { lista: Condominio[]; regiao: string; regioes: string[]; url: (m: Partial<SP>) => string }) {
  const hoje = hojeSP();
  const r = resumir(lista, hoje);
  const texto = pitch(regiao || juntar(regioes), r);
  const geral = !regiao && regioes.length > 1;
  const pct = (n: number) => (r.total ? Math.round((n / r.total) * 100) : 0);
  const topA = lista.filter((c) => prioridade(c) === 'A').slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo={geral ? 'Domínio (todas as regiões)' : 'Domínio da região'} valor={`${r.dominio}%`} sub={r.dominioBase === 'unidades' ? 'das unidades mapeadas estão em prédios onde você tem relacionamento' : 'dos prédios mapeados têm relacionamento (preencha o total de unidades para medir por unidades)'} destaque />
        <Card titulo="Condomínios mapeados" valor={int(r.total)} sub={`${int(r.unidades)} unidades`} />
        <Card titulo="Fichas completas" valor={`${r.completos}/${r.total}`} sub={`completude média de ${r.completudeMedia}%`} />
        <Card titulo="Proprietários que você conhece" valor={int(r.proprietarios)} sub={`${int(r.negociosVille)} negócios da Ville nesses prédios`} />
      </div>

      <Secao titulo="Presença nos prédios">
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['Com relacionamento (em relacionamento ou referência)', r.comRelacao, 'bg-blue-600'],
            ['Você é a referência do prédio', r.referencia, 'bg-emerald-600'],
            ['Zelador / gerente predial conhecido', r.zeladores, 'bg-violet-600'],
            ['Síndico conhecido', r.sindicos, 'bg-amber-500'],
          ] as [string, number, string][]).map(([t, n, cor]) => (
            <div key={t}>
              <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{t}</span><span className="font-semibold">{n} de {r.total} · {pct(n)}%</span></div>
              <Barra pct={pct(n)} cor={cor} />
            </div>
          ))}
        </div>
      </Secao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo={geral ? 'Mercado (todas as regiões)' : 'Mercado da região'}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">m² (mín – máx)</dt><dd className="font-semibold text-slate-900">{r.m2Min ? `${brl0(r.m2Min)} – ${brl0(r.m2Max)}` : '—'}</dd></div>
            <div><dt className="text-xs text-slate-500">m² médio</dt><dd className="font-semibold text-slate-900">{brl0(r.m2Medio)}</dd></div>
            <div><dt className="text-xs text-slate-500">À venda agora</dt><dd className="font-semibold text-slate-900">{int(r.anuncios)} unidades</dd></div>
            <div><dt className="text-xs text-slate-500">Vendas em 12 meses</dt><dd className="font-semibold text-slate-900">{int(r.vendas12m)}</dd></div>
            <div><dt className="text-xs text-slate-500">Giro anual</dt><dd className="font-semibold text-slate-900">{r.unidades ? `${((r.vendas12m / r.unidades) * 100).toFixed(1).replace('.', ',')}%` : '—'}</dd></div>
            <div><dt className="text-xs text-slate-500">Tempo médio de venda</dt><dd className="font-semibold text-slate-900">{r.tempoMedio ? `${int(r.tempoMedio)} dias` : '—'}</dd></div>
          </dl>
        </Secao>

        <Secao titulo="Concorrência mais presente">
          {r.concorrentes.length ? (
            <ul className="space-y-2">
              {r.concorrentes.map(([n, q]) => (
                <li key={n}>
                  <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{n}</span><span className="font-semibold">{q} prédio{q > 1 ? 's' : ''}</span></div>
                  <Barra pct={pct(q)} cor="bg-rose-500" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Preencha “Imobiliárias atuando” nas fichas para ver quem disputa a região com você.</p>
          )}
        </Secao>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo="Prioridades">
          <div className="mb-4 flex gap-3">
            {(['A', 'B', 'C'] as Prioridade[]).map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className={`inline-flex size-7 items-center justify-center rounded-lg text-sm font-bold ${COR_PRIORIDADE[p]}`}>{p}</span>
                <span className="text-sm text-slate-700">{r.prioridades[p]}</span>
              </div>
            ))}
          </div>
          {topA.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {topA.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <Link href={`/posicionamento/${c.id}`} className="font-medium text-slate-800 hover:text-blue-700">{c.nome}</Link>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_REL[c.status_relacionamento][1]}`}>{STATUS_REL[c.status_relacionamento][0]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nenhum prédio prioridade A ainda.</p>
          )}
          <p className="mt-3 text-[11px] text-slate-400">A = foco agora · B = manter presença · C = monitorar.</p>
        </Secao>

        <Secao titulo="Agenda de ações">
          {r.acoesAtrasadas.length + r.acoesSemana.length === 0 ? (
            <p className="text-sm text-slate-500">Nada marcado para os próximos 7 dias.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {[...r.acoesAtrasadas.map((c) => [c, true] as const), ...r.acoesSemana.map((c) => [c, false] as const)].map(([c, atrasada]) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <Link href={`/posicionamento/${c.id}`} className="font-medium text-slate-800 hover:text-blue-700">{c.nome}</Link>
                    <p className="text-xs text-slate-500">{c.proxima_acao || 'Ação sem descrição'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${atrasada ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                    {atrasada ? 'atrasada · ' : ''}{dm(c.proxima_acao_data!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {r.semAcao > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              {r.semAcao} prédio{r.semAcao > 1 ? 's' : ''} sem próxima ação marcada. <Link href={url({ ord: 'acao' }) + '#predios'} className="underline">Ver</Link>
            </p>
          )}
        </Secao>
      </div>

      <Secao titulo="Seu discurso de posicionamento">
        {texto ? (
          <>
            <p className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">“{texto}”</p>
            <p className="mt-2 text-[11px] text-slate-400">Montado com o que você já mapeou. Use na apresentação ao proprietário, no WhatsApp e nas redes. Quanto mais completo o mapa, mais forte o texto.</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Adicione condomínios para montar o texto.</p>
        )}
      </Secao>
    </div>
  );
}

function Lista({ lista, ord, url, comRegiao }: { lista: Condominio[]; ord: string; url: (m: Partial<SP>) => string; comRegiao?: boolean }) {
  const PESO: Record<Prioridade, number> = { A: 0, B: 1, C: 2 };
  const rows = [...lista].sort((a, b) =>
    ord === 'nome'
      ? a.nome.localeCompare(b.nome, 'pt-BR')
      : ord === 'acao'
        ? String(a.proxima_acao_data ?? '9999').localeCompare(String(b.proxima_acao_data ?? '9999'))
        : ord === 'unidades'
          ? (b.unidades ?? 0) - (a.unidades ?? 0)
          : PESO[prioridade(a)] - PESO[prioridade(b)] || (b.unidades ?? 0) - (a.unidades ?? 0)
  );
  const th = (k: string, t: string) => (
    <th className="px-3 py-2 text-left font-medium">
      <Link href={url({ ord: k }) + '#predios'} className={ord === k ? 'text-blue-700' : 'hover:text-slate-900'}>{t}</Link>
    </th>
  );
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            {th('prioridade', 'Prior.')}
            {th('nome', 'Condomínio')}
            {th('unidades', 'Unid.')}
            <th className="px-3 py-2 text-left font-medium">m² (R$)</th>
            <th className="px-3 py-2 text-left font-medium">À venda · vendas 12m</th>
            <th className="px-3 py-2 text-left font-medium">Concorrência</th>
            <th className="px-3 py-2 text-left font-medium">Relacionamento</th>
            {th('acao', 'Próxima ação')}
            <th className="px-3 py-2 text-left font-medium">Ficha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => {
            const p = prioridade(c);
            const comp = completude(c);
            return (
              <tr key={c.id} className="align-top hover:bg-slate-50">
                <td className="px-3 py-2.5">
                  <span title={c.prioridade_manual ? 'Definida por você' : 'Sugerida'} className={`inline-flex size-6 items-center justify-center rounded-md text-xs font-bold ${COR_PRIORIDADE[p]}`}>{p}</span>
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/posicionamento/${c.id}`} className="font-medium text-slate-900 hover:text-blue-700">{c.nome}</Link>
                  <p className="text-xs text-slate-500">{[comRegiao ? c.regiao : '', c.endereco, c.bairro].filter(Boolean).join(' · ') || '—'}</p>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{int(c.unidades)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                  {c.valor_m2_min || c.valor_m2_max ? `${brl0(c.valor_m2_min)} – ${brl0(c.valor_m2_max)}` : '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-700">{int(c.anuncios_ativos)} · {int(c.vendas_12m)}</td>
                <td className="max-w-[14rem] px-3 py-2.5 text-xs text-slate-600">
                  {c.imobiliarias || '—'}
                  {c.exclusividades_conc ? <span className="ml-1 text-rose-600">({c.exclusividades_conc} excl.)</span> : null}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_REL[c.status_relacionamento][1]}`}>{STATUS_REL[c.status_relacionamento][0]}</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-600">
                  {c.proxima_acao_data ? <b>{dm(c.proxima_acao_data)}</b> : null} {c.proxima_acao || (c.proxima_acao_data ? '' : '—')}
                </td>
                <td className="w-24 px-3 py-2.5">
                  <Barra pct={comp} cor={comp >= 80 ? 'bg-emerald-500' : comp >= 50 ? 'bg-amber-500' : 'bg-rose-400'} />
                  <p className="mt-1 text-[11px] text-slate-500">{comp}%</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
