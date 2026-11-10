'use client';

import { useActionState } from 'react';
import { criarUnidade, redefinirSenha, type Resultado } from './actions';

function Aviso({ r }: { r: Resultado | null }) {
  if (!r) return null;
  if (!r.ok) return <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.msg}</p>;
  return (
    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <p className="font-semibold">{r.msg}</p>
      {r.senha && (
        <p className="mt-1">
          Acesso: <b>{r.email}</b> · senha provisória <code className="rounded bg-white px-1.5 py-0.5 font-mono">{r.senha}</code>
          <br />
          <span className="text-emerald-800">Copie agora: ela não aparece de novo. No primeiro acesso a pessoa cria a própria senha.</span>
        </p>
      )}
    </div>
  );
}

const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function NovaUnidade() {
  const [r, acao, enviando] = useActionState(criarUnidade, null);
  return (
    <form action={acao} className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold">Nova unidade</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Nome da unidade *<input name="nome" required className={campo} placeholder="REMAX Exemplo" /></label>
        <label className="text-sm font-medium text-slate-700">CNPJ<input name="cnpj" className={campo} inputMode="numeric" /></label>
        <label className="text-sm font-medium text-slate-700">Razão social<input name="razao_social" className={campo} /></label>
        <label className="text-sm font-medium text-slate-700">E-mail de cobrança<input name="email_cobranca" type="email" className={campo} /></label>
        <label className="text-sm font-medium text-slate-700">Responsável (nome) *<input name="admin_nome" required className={campo} /></label>
        <label className="text-sm font-medium text-slate-700">Responsável (e-mail de acesso) *<input name="admin_email" type="email" required className={campo} /></label>
      </div>
      <button disabled={enviando} className="mt-4 rounded-lg bg-[#0F1B2D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-60">
        {enviando ? 'Criando…' : 'Criar unidade e acesso'}
      </button>
      <Aviso r={r} />
    </form>
  );
}

export function RedefinirSenha({ usuarioId }: { usuarioId: string }) {
  const [r, acao, enviando] = useActionState(redefinirSenha, null);
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
