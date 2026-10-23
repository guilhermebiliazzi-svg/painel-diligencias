// Posicionamento — visão geral da equipe (só administrador): ranking dos
// corretores, cobertura da agência por bairro, conflitos de território e
// prédios prioridade A parados. Lê a mesma tabela dos mapas individuais.
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resumir, prioridade, completude, int, type Condominio } from '@/lib/posicionamento';

const DIAS_PARADO = 30;

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Nome comparável do prédio: sem acento, sem "condomínio/edifício/residencial".
const chavePredio = (nome: string) =>
  sem(nome)
    .replace(/\b(condominio|cond\.?|edificio|ed\.?|residencial|res\.?|predio)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const chaveBairro = (b: string | null) => sem(b ?? '').replace(/\s+/g, ' ').trim();
const dataBR = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const diasDesde = (iso: string, hoje: string) =>
  Math.floor((new Date(hoje + 'T12:00:00Z').getTime() - new Date(iso.slice(0, 10) + 'T12:00:00Z').getTime()) / 86400000);

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Card({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default async function VisaoGeral({ hoje }: { hoje: string }) {
  const sb = supabaseAdmin();
  const [{ data, error }, { data: cors }] = await Promise.all([
    sb.from('posicionamento_condominios').select('*').limit(20000),
    sb.from('corretores_associados').select('id,nome,status'),
  ]);
  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Não consegui ler os mapas: {error.message}</p>;

  const rows = (data ?? []) as Condominio[];
  const nomes = new Map<number, { nome: string; ativo: boolean }>();
  for (const c of (cors ?? []) as { id: number; nome: string | null; status: string | null }[]) {
    nomes.set(Number(c.id), { nome: String(c.nome ?? '').split(' - ')[0] || `Corretor ${c.id}`, ativo: (c.status ?? 'ativo') === 'ativo' });
  }
  const nomeDe = (id: number) => nomes.get(Number(id))?.nome ?? `Corretor ${id}`;
  const mapa = (id: number, reg?: string) =>
    `/posicionamento?aba=painel&cor=${id}${reg ? `&reg=${encodeURIComponent(reg)}` : ''}`;

  if (!rows.length) {
    return (
      <p style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        Nenhum corretor mapeou condomínios ainda.
      </p>
    );
  }

  // 1. Ranking por corretor
  const porCorretor = new Map<number, Condominio[]>();
  for (const r of rows) {
    const k = Number(r.corretor_id);
    if (!porCorretor.has(k)) porCorretor.set(k, []);
    porCorretor.get(k)!.push(r);
  }
  const ranking = [...porCorretor.entries()]
    .map(([id, lista]) => {
      const r = resumir(lista, hoje);
      const ultima = lista.reduce((m, c) => (c.atualizado_em > m ? c.atualizado_em : m), lista[0].atualizado_em);
      return {
        id, nome: nomeDe(id), ativo: nomes.get(id)?.ativo ?? true,
        regioes: [...new Set(lista.map((c) => c.regiao))],
        r, ultima, parado: diasDesde(ultima, hoje),
      };
    })
    .sort((a, b) => b.r.dominio - a.r.dominio || b.r.total - a.r.total);

  // 2. Cobertura por bairro (ou região, quando a ficha não tem bairro)
  const porBairro = new Map<string, { rotulo: string; predios: Set<string>; unidades: number; corretores: Set<number>; comRel: number }>();
  const vistosUnid = new Set<string>();
  for (const c of rows) {
    const rotulo = (c.bairro || '').trim() || '(sem bairro)';
    const k = chaveBairro(rotulo);
    if (!porBairro.has(k)) porBairro.set(k, { rotulo, predios: new Set(), unidades: 0, corretores: new Set(), comRel: 0 });
    const b = porBairro.get(k)!;
    const pk = chavePredio(c.nome);
    if (!b.predios.has(pk)) {
      b.predios.add(pk);
      b.unidades += c.unidades ?? 0;
    }
    b.corretores.add(Number(c.corretor_id));
    if ((c.status_relacionamento === 'em_relacionamento' || c.status_relacionamento === 'referencia') && !vistosUnid.has(k + '|' + pk)) {
      vistosUnid.add(k + '|' + pk);
      b.comRel++;
    }
  }
  const bairros = [...porBairro.values()].sort((a, b) => b.predios.size - a.predios.size);

  // Totais da agência (prédio contado uma vez, mesmo se dois corretores o mapearam)
  const prediosUnicos = new Map<string, Condominio>();
  for (const c of rows) {
    const k = chavePredio(c.nome) + '|' + chaveBairro(c.bairro);
    if (!prediosUnicos.has(k)) prediosUnicos.set(k, c);
  }
  const unidadesAgencia = [...prediosUnicos.values()].reduce((a, c) => a + (c.unidades ?? 0), 0);

  // 3. Conflitos: mesmo prédio (nome + bairro) com mais de um corretor
  const grupos = new Map<string, Condominio[]>();
  for (const c of rows) {
    const k = chavePredio(c.nome) + '|' + chaveBairro(c.bairro);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(c);
  }
  const conflitos = [...grupos.values()]
    .filter((g) => new Set(g.map((c) => Number(c.corretor_id))).size > 1)
    .sort((a, b) => a[0].nome.localeCompare(b[0].nome, 'pt-BR'));
  const bairrosDisputados = bairros.filter((b) => b.rotulo !== '(sem bairro)' && b.corretores.size > 1);

  // 4. Prioridade A sem contato há mais de 30 dias (ou nunca)
  const parados = rows
    .filter((c) => prioridade(c) === 'A' && (!c.ultimo_contato || diasDesde(c.ultimo_contato, hoje) > DIAS_PARADO))
    .sort((a, b) => String(a.ultimo_contato ?? '').localeCompare(String(b.ultimo_contato ?? '')));

  const comMapa = ranking.length;
  const ativosSemMapa = [...nomes.entries()].filter(([id, n]) => n.ativo && !porCorretor.has(id)).length;
  const th = 'px-3 py-2 text-left font-medium';
  const td = 'px-3 py-2.5';

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Corretores com mapa" valor={int(comMapa)} sub={`${ativosSemMapa} ativos ainda sem nenhum prédio`} />
        <Card titulo="Condomínios mapeados" valor={int(prediosUnicos.size)} sub={`${int(rows.length)} fichas no total`} />
        <Card titulo="Unidades cobertas" valor={int(unidadesAgencia)} sub={`em ${bairros.length} bairro${bairros.length > 1 ? 's' : ''}`} />
        <Card titulo="Pontos de atenção" valor={int(conflitos.length + parados.length)} sub={`${conflitos.length} conflitos · ${parados.length} prédios A parados`} />
      </div>

      <Secao titulo="Ranking dos corretores" sub="Ordenado pelo domínio da região. Clique no nome para abrir o mapa do corretor.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={th}>Corretor</th>
                <th className={th}>Regiões</th>
                <th className={th}>Prédios</th>
                <th className={th}>Unidades</th>
                <th className={th}>Domínio</th>
                <th className={th}>Fichas completas</th>
                <th className={th}>Relac. · Referência</th>
                <th className={th}>Ações atrasadas</th>
                <th className={th}>Última atualização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranking.map((x) => (
                <tr key={x.id} className="align-top hover:bg-slate-50">
                  <td className={td}>
                    <Link href={mapa(x.id)} className="font-medium text-slate-900 hover:text-blue-700">{x.nome}</Link>
                    {!x.ativo && <span className="ml-1 text-[11px] text-slate-400">(inativo)</span>}
                  </td>
                  <td className={`${td} max-w-[14rem] text-xs text-slate-600`}>
                    {x.regioes.map((rg, i) => (
                      <span key={rg}>{i > 0 && ' · '}<Link href={mapa(x.id, rg)} className="hover:text-blue-700">{rg}</Link></span>
                    ))}
                  </td>
                  <td className={td}>{int(x.r.total)}</td>
                  <td className={td}>{int(x.r.unidades)}</td>
                  <td className={td}>
                    <div className="w-20">
                      <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${x.r.dominio}%` }} /></div>
                      <p className="mt-1 text-[11px] font-semibold text-slate-700">{x.r.dominio}%</p>
                    </div>
                  </td>
                  <td className={td}>{x.r.completos}/{x.r.total} <span className="text-[11px] text-slate-400">({x.r.completudeMedia}%)</span></td>
                  <td className={td}>{x.r.comRelacao} · {x.r.referencia}</td>
                  <td className={td}>
                    {x.r.acoesAtrasadas.length ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{x.r.acoesAtrasadas.length}</span> : <span className="text-slate-400">0</span>}
                  </td>
                  <td className={td}>
                    <span className={x.parado > 14 ? 'font-semibold text-amber-700' : 'text-slate-700'}>{dataBR(x.ultima)}</span>
                    <p className="text-[11px] text-slate-400">{x.parado === 0 ? 'hoje' : `há ${x.parado} dia${x.parado > 1 ? 's' : ''}`}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Última atualização em laranja: mapa parado há mais de 14 dias.</p>
      </Secao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo="Conflitos de território" sub="Mesmo condomínio (nome + bairro) mapeado por mais de um corretor.">
          {conflitos.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {conflitos.map((g) => (
                <li key={g[0].id} className="py-2">
                  <p className="font-medium text-slate-900">{g[0].nome}<span className="ml-1 text-xs font-normal text-slate-500">{g[0].bairro ? `· ${g[0].bairro}` : ''}</span></p>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {g.map((c) => (
                      <li key={c.id}>
                        <Link href={`/posicionamento/${c.id}`} className="hover:text-blue-700">{nomeDe(c.corretor_id)}</Link>
                        {' — '}{c.status_relacionamento.replace('_', ' ')}{c.ultimo_contato ? `, último contato ${dataBR(c.ultimo_contato)}` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nenhum prédio disputado.</p>
          )}
          {bairrosDisputados.length > 0 && (
            <p className="mt-3 text-xs text-slate-600">
              <b>Bairros com mais de um corretor:</b>{' '}
              {bairrosDisputados.map((b) => `${b.rotulo} (${[...b.corretores].map(nomeDe).join(', ')})`).join(' · ')}
            </p>
          )}
        </Secao>

        <Secao titulo={`Prédios A sem contato há mais de ${DIAS_PARADO} dias`} sub="Prioridade alta parada: cobrar o corretor ou redistribuir.">
          {parados.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {parados.slice(0, 30).map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <Link href={`/posicionamento/${c.id}`} className="font-medium text-slate-900 hover:text-blue-700">{c.nome}</Link>
                    <p className="text-xs text-slate-500">{nomeDe(c.corretor_id)} · {int(c.unidades)} unid. · ficha {completude(c)}%</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    {c.ultimo_contato ? `há ${diasDesde(c.ultimo_contato, hoje)} dias` : 'nunca'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nenhum prédio A parado.</p>
          )}
        </Secao>
      </div>

      <Secao titulo="Cobertura da agência por bairro" sub="Cada prédio conta uma vez, mesmo se dois corretores o mapearam.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className={th}>Bairro</th>
                <th className={th}>Prédios</th>
                <th className={th}>Unidades</th>
                <th className={th}>Com relacionamento</th>
                <th className={th}>Corretores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bairros.map((b) => (
                <tr key={b.rotulo}>
                  <td className={`${td} font-medium text-slate-900`}>{b.rotulo}</td>
                  <td className={td}>{b.predios.size}</td>
                  <td className={td}>{int(b.unidades)}</td>
                  <td className={td}>{b.comRel} <span className="text-[11px] text-slate-400">({Math.round((b.comRel / b.predios.size) * 100)}%)</span></td>
                  <td className={`${td} text-xs text-slate-600`}>{[...b.corretores].map(nomeDe).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  );
}
