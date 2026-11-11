'use client';

import { useActionState } from 'react';
import { criarUnidade, redefinirSenha, salvarFerramentasUnidade, salvarPastaDrive, type Resultado } from './actions';

type Ferramenta = { codigo: string; nome: string };

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

export function NovaUnidade({ ferramentas }: { ferramentas: Ferramenta[] }) {
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
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Pasta do Google Drive da unidade (link)
          <input name="pasta_drive" className={campo} placeholder="https://drive.google.com/drive/folders/…" />
          <span className="mt-1 block text-xs font-normal text-slate-500">Pode deixar para depois. Sem a pasta, a unidade não consegue iniciar diligências.</span>
        </label>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">Ferramentas liberadas para a unidade</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {ferramentas.map((f) => (
          <label key={f.codigo} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="ferramentas" value={f.codigo} defaultChecked />
            {f.nome}
          </label>
        ))}
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

export function PastaDrive({ unidadeId, atual }: { unidadeId: string; atual: string | null }) {
  const [r, acao, enviando] = useActionState(salvarPastaDrive, null);
  return (
    <form action={acao} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="unidade_id" value={unidadeId} />
      <span className="font-medium text-slate-700">Pasta do Drive:</span>
      {atual ? (
        <a href={`https://drive.google.com/drive/folders/${atual}`} target="_blank" rel="noreferrer" className="text-xs text-[#0F1B2D] underline">abrir ↗</a>
      ) : (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">não configurada</span>
      )}
      <input name="pasta_drive" defaultValue={atual ? `https://drive.google.com/drive/folders/${atual}` : ''} placeholder="link da pasta" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <button disabled={enviando} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
        {enviando ? 'salvando…' : 'Salvar'}
      </button>
      {r && <span className={`w-full text-xs ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>{r.msg}</span>}
    </form>
  );
}

export function FerramentasUnidade({ unidadeId, ferramentas, marcadas }: { unidadeId: string; ferramentas: Ferramenta[]; marcadas: string[] }) {
  const [r, acao, enviando] = useActionState(salvarFerramentasUnidade, null);
  return (
    <form action={acao} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <input type="hidden" name="unidade_id" value={unidadeId} />
      <span className="font-medium text-slate-700">Ferramentas:</span>
      {ferramentas.map((f) => (
        <label key={f.codigo} className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" name="ferramentas" value={f.codigo} defaultChecked={marcadas.includes(f.codigo)} />
          {f.nome}
        </label>
      ))}
      <button disabled={enviando} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60">
        {enviando ? 'salvando…' : 'Salvar'}
      </button>
      {r && <span className={`text-xs ${r.ok ? 'text-emerald-700' : 'text-red-700'}`}>{r.msg}</span>}
    </form>
  );
}
