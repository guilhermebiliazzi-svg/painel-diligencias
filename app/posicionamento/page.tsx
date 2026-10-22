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

export const metadata = { title: 'Posicionamento — Painel REMAX Ville' };
export const dynamic = 'force-dynamic';

type SP = { aba?: string; cor?: string; reg?: string; ord?: string; ok?: string; erro?: string };

const hojeSP = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dm = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);

const ERROS: Record<string, string> = {
  'sem-corretor': 'Seu e-mail não está ligado a um corretor associado. Fale com o administrador.',
  obrigatorio: 'Preencha a região e o nome do condomínio.',
  'nao-encontrado': 'Condomínio não encontrado.',
};

export default async function Posicionamento({ searchParams }: { searchParams: Promise<SP> }) {
  const perfil = await exigirTela('posicionamento');
  const sp = await searchParams;
  const admin = !!perfil.is_admin;
  const sb = supabaseAdmin();
  const eu = await corretorDaPessoa(perfil.email);

  let corretores: { id: number; nome: string }[] | null = null;
  if (admin) {
    const { data } = await sb.from('corretores_associados').select('id,nome,status').order('nome');
    corretores = ((data ?? []) as { id: number; nome: string; status: string | null }[])
      .filter((c) => (c.status ?? 'ativo') === 'ativo' || Number(c.id) === Number(sp.cor))
      .map((c) => ({ id: Number(c.id), nome: String(c.nome ?? '').split(' - ')[0] }));
  }
  const corId = admin ? Number(sp.cor) || eu?.id || corretores?.[0]?.id || null : eu?.id ?? null;

  if (!corId) {
    return (
      <Casca>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{ERROS['sem-corretor']}</p>
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
  const reg = sp.reg && regioes.includes(sp.reg) ? sp.reg : regioes[0] ?? '';
  const lista = todos.filter((c) => c.regiao === reg);
  const aba = sp.aba === 'lista' || sp.aba === 'novo' ? sp.aba : regioes.length ? 'painel' : 'novo';

  const url = (m: Partial<SP>) => {
    const v = { aba, cor: admin ? String(corId) : '', reg, ...m };
    const p = new URLSearchParams();
    if (v.aba && v.aba !== 'painel') p.set('aba', v.aba);
    if (v.cor) p.set('cor', v.cor);
    if (v.reg) p.set('reg', v.reg);
    if (v.ord) p.set('ord', v.ord);
    const s = p.toString();
    return '/posicionamento' + (s ? '?' + s : '');
  };
  const tab = (chave: string, rotulo: string) => (
    <Link
      href={url({ aba: chave })}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${aba === chave ? 'border-blue-700 font-semibold text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
    >
      {rotulo}
    </Link>
  );
  const sel = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';

  return (
    <Casca>
      {sp.ok && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Condomínio salvo no mapa.</p>}
      {sp.erro && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{ERROS[sp.erro] ?? sp.erro}</p>}

      {(admin || regioes.length > 1) && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          {aba !== 'painel' && <input type="hidden" name="aba" value={aba} />}
          {admin && corretores && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Corretor</label>
              <select name="cor" defaultValue={String(corId)} className={sel}>
                {corretores.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
              </select>
            </div>
          )}
          {regioes.length > 1 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Região</label>
              <select name="reg" defaultValue={reg} className={sel}>
                {regioes.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>
          )}
          <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ver</button>
        </form>
      )}

      <nav className="mb-5 flex gap-1 border-b border-slate-200">
        {tab('painel', 'Meu posicionamento')}
        {tab('lista', `Condomínios${lista.length ? ` (${lista.length})` : ''}`)}
        {tab('novo', '+ Adicionar condomínio')}
      </nav>

      {aba === 'novo' ? (
        <Ficha c={null} regioes={regioes} regiaoPadrao={reg} corretores={corretores} corretorPadrao={corId} />
      ) : !regioes.length ? null : aba === 'lista' ? (
        <Lista lista={lista} ord={sp.ord || 'prioridade'} url={url} />
      ) : (
        <Painel lista={lista} regiao={reg} url={url} />
      )}
    </Casca>
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

function Painel({ lista, regiao, url }: { lista: Condominio[]; regiao: string; url: (m: Partial<SP>) => string }) {
  const hoje = hojeSP();
  const r = resumir(lista, hoje);
  const texto = pitch(regiao, r);
  const pct = (n: number) => (r.total ? Math.round((n / r.total) * 100) : 0);
  const topA = lista.filter((c) => prioridade(c) === 'A').slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Domínio da região" valor={`${r.dominio}%`} sub="das unidades mapeadas estão em prédios onde você tem relacionamento" destaque />
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
        <Secao titulo="Mercado da região">
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
              {r.semAcao} prédio{r.semAcao > 1 ? 's' : ''} sem próxima ação marcada. <Link href={url({ aba: 'lista', ord: 'acao' })} className="underline">Ver</Link>
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

function Lista({ lista, ord, url }: { lista: Condominio[]; ord: string; url: (m: Partial<SP>) => string }) {
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
      <Link href={url({ aba: 'lista', ord: k })} className={ord === k ? 'text-blue-700' : 'hover:text-slate-900'}>{t}</Link>
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
                  <p className="text-xs text-slate-500">{[c.endereco, c.bairro].filter(Boolean).join(' · ') || '—'}</p>
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
