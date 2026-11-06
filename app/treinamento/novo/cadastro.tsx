'use client';

// Seleção dos corretores que entram na trilha do Max: data de início comum,
// padrinho por corretor e boas-vindas pelo Max.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { cadastrarNovatos, type ResultadoCadastro } from '../actions';

export type Opcao = { id: number; nome: string; temCelular: boolean; trilha: string | null };

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function proximoDiaUtil(): string {
  const d = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()) + 'T12:00:00Z');
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export default function Cadastro({ corretores, padrinhos }: { corretores: Opcao[]; padrinhos: { id: number; nome: string }[] }) {
  const [busca, setBusca] = useState('');
  const [escolhidos, setEscolhidos] = useState<Map<number, number | null>>(new Map());
  const [inicio, setInicio] = useState(proximoDiaUtil);
  const [boas, setBoas] = useState(true);
  const [res, setRes] = useState<ResultadoCadastro | null>(null);
  const [pending, start] = useTransition();

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return corretores.filter((c) => !q || norm(c.nome).includes(q));
  }, [busca, corretores]);
  const nome = useMemo(() => new Map(corretores.map((c) => [c.id, c.nome])), [corretores]);

  function alternar(id: number) {
    setEscolhidos((m) => {
      const n = new Map(m);
      if (n.has(id)) n.delete(id);
      else n.set(id, null);
      return n;
    });
  }

  function cadastrar() {
    if (!escolhidos.size || !inicio) return;
    const [y, m, d] = inicio.split('-');
    if (!window.confirm(`Cadastrar ${escolhidos.size} corretor(es) na trilha do Max, com início em ${d}/${m}/${y}${boas ? ', e mandar as boas-vindas' : ''}?`)) return;
    setRes(null);
    start(async () => {
      const r = await cadastrarNovatos([...escolhidos].map(([corretor_id, padrinho_id]) => ({ corretor_id, padrinho_id })), inicio, boas);
      setRes(r);
      if (r.cadastrados.length) setEscolhidos(new Map());
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <span className="block text-xs font-medium text-slate-500">Corretores</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
          {lista.map((c) => {
            const bloqueado = !c.temCelular;
            return (
              <li key={c.id}>
                <label className={`flex items-center gap-3 px-3 py-2 text-sm ${bloqueado ? 'cursor-default text-slate-400' : 'cursor-pointer hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={escolhidos.has(c.id)} disabled={bloqueado} onChange={() => alternar(c.id)} className="size-4" />
                  <span className="flex-1">{c.nome}</span>
                  {bloqueado && <span className="text-xs">sem celular no cadastro</span>}
                  {!bloqueado && c.trilha && <span className="text-xs text-amber-700">já na trilha ({c.trilha})</span>}
                </label>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Nenhum corretor com esse nome.</li>}
        </ul>
        <p className="mt-1 text-xs text-slate-500">Cadastrar de novo quem já está na trilha reinicia a data de início dele.</p>
      </div>

      {escolhidos.size > 0 && (
        <div>
          <span className="block text-xs font-medium text-slate-500">Padrinho de cada um</span>
          <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {[...escolhidos].map(([id, padr]) => (
              <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 font-medium text-slate-900">{nome.get(id)}</span>
                <select
                  value={padr ?? ''}
                  onChange={(e) => setEscolhidos((m) => new Map(m).set(id, e.target.value ? Number(e.target.value) : null))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Padrinho a definir</option>
                  {padrinhos.filter((p) => p.id !== id).map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-500">Início da trilha</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={boas} onChange={(e) => setBoas(e.target.checked)} className="size-4" />
          Mandar as boas-vindas pelo Max
        </label>
      </div>

      <button
        type="button"
        onClick={cadastrar}
        disabled={pending || escolhidos.size === 0 || !inicio}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Cadastrando…' : `Cadastrar${escolhidos.size ? ` (${escolhidos.size})` : ''}`}
      </button>

      {res && (
        <div className="space-y-2 text-sm">
          {res.cadastrados.length > 0 && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
              Na trilha: {res.cadastrados.join(', ')}. <Link href="/treinamento" className="font-medium underline">Ver no treinamento</Link>
            </p>
          )}
          {res.falhas.map((f, i) => (
            <p key={i} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{f.nome}: {f.erro}</p>
          ))}
        </div>
      )}
    </div>
  );
}
