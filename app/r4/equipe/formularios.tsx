'use client';

import { useActionState } from 'react';
import { criarCorretor, novaSenhaCorretor, salvarFerramentasCorretor, type ResultadoEquipe } from './actions';

type Ferramenta = { codigo: string; nome: string };
const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

function Aviso({ r }: { r: ResultadoEquipe }) {
  if (!r) return null;
  if (!r.ok) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.msg}</p>;
  return (
    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <p className="font-semibold">{r.msg}</p>
      {r.senha && (
        <p className="mt-1">
          Acesso: <b>{r.email}</b> · senha provisória <code className="rounded bg-white px-1.5 py-0.5 font-mono">{r.senha}</code>
          <br />
          <span className="text-emerald-800">
            Copie agora: ela não aparece de novo. Mande para a pessoa entrar em www.rquatro.com.br; no primeiro acesso ela cria a própria senha.
          </span>
        </p>
      )}
    </div>
  );
}

function Marcar({ ferramentas, marcadas }: { ferramentas: Ferramenta[]; marcadas: string[] }) {
  if (!ferramentas.length) return <p className="text-xs text-slate-500">Sua unidade ainda não tem ferramentas liberadas.</p>;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {ferramentas.map((f) => (
        <label key={f.codigo} className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="ferramentas" value={f.codigo} defaultChecked={marcadas.includes(f.codigo)} />
          {f.nome}
        </label>
      ))}
    </div>
  );
}

export function NovoCorretor({ ferramentas }: { ferramentas: Ferramenta[] }) {
  const [r, acao, enviando] = useActionState(criarCorretor, null);
  return (
    <form action={acao} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold">Cadastrar corretor</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Nome *<input name="nome" required className={campo} /></label>
        <label className="text-sm font-medium text-slate-700">E-mail de acesso *<input name="email" type="email" required className={campo} /></label>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">Ferramentas que ele(a) pode usar</p>
      <div className="mt-2">
        <Marcar ferramentas={ferramentas} marcadas={ferramentas.map((f) => f.codigo)} />
      </div>
      <button disabled={enviando} className="mt-4 rounded-lg bg-[#0F1B2D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-60">
        {enviando ? 'Cadastrando…' : 'Cadastrar e gerar senha'}
      </button>
      <Aviso r={r} />
    </form>
  );
}

export function AcessosCorretor({ usuarioId, ferramentas, marcadas }: { usuarioId: string; ferramentas: Ferramenta[]; marcadas: string[] }) {
  const [r, acao, enviando] = useActionState(salvarFerramentasCorretor, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <Marcar ferramentas={ferramentas} marcadas={marcadas} />
      {ferramentas.length > 0 && (
        <button disabled={enviando} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
          {enviando ? 'salvando…' : 'Salvar acessos'}
        </button>
      )}
      {r && <span className={`text-xs ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>{r.msg}</span>}
    </form>
  );
}

export function NovaSenhaCorretor({ usuarioId }: { usuarioId: string }) {
  const [r, acao, enviando] = useActionState(novaSenhaCorretor, null);
  return (
    <form action={acao} className="inline">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <button disabled={enviando} className="text-xs font-semibold text-slate-600 underline hover:text-slate-900">
        {enviando ? 'gerando…' : 'nova senha provisória'}
      </button>
      <Aviso r={r} />
    </form>
  );
}
