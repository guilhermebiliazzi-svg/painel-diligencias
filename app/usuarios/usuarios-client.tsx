'use client';

import { useActionState } from 'react';
import type { Perfil } from '@/lib/perfil';
import { convidarUsuario, salvarUsuario, reenviarConvite, removerUsuario, type AcaoState } from './actions';

const TELAS = [
  ['pode_diligencias', 'Diligências'],
  ['pode_cobrancas', 'Cobranças'],
  ['pode_repasse', 'Repasse'],
  ['pode_notas', 'Notas'],
  ['pode_pagamentos', 'Pagamentos'],
] as const;

type TelaKey = (typeof TELAS)[number][0];

function Checkbox({ name, defaultChecked, disabled, children }: {
  name: string; defaultChecked?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled}
        className="size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:opacity-50" />
      {children}
    </label>
  );
}

export default function UsuariosClient({ lista, meuEmail }: { lista: Perfil[]; meuEmail: string }) {
  const [state, convidar, enviando] = useActionState<AcaoState, FormData>(convidarUsuario, undefined);

  return (
    <div className="mt-6 space-y-6">
      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Convidar pessoa</h2>
        <p className="mt-1 text-sm text-slate-600">A pessoa recebe um e-mail de acesso e entra com o Google (mesmo e-mail).</p>
        <form action={convidar} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="email" type="email" required placeholder="email@daempresa.com"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
            <input name="nome" type="text" placeholder="Nome (opcional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {TELAS.map(([key, label]) => (<Checkbox key={key} name={key}>{label}</Checkbox>))}
          </div>
          {state?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.erro}</p>}
          {state?.aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{state.aviso}</p>}
          {state?.ok && !state?.aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Convite enviado.</p>}
          <button type="submit" disabled={enviando}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
            {enviando ? 'Enviando…' : 'Convidar'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Pessoas ({lista.length})</h2>
        {lista.map((u) => {
          const souEu = u.email === meuEmail;
          return (
            <div key={u.email} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{u.nome || u.email}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {u.is_admin && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Admin</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${u.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
              <form action={salvarUsuario} className="mt-4">
                <input type="hidden" name="email" value={u.email} />
                {souEu && <input type="hidden" name="ativo" value="on" />}
                {souEu && <input type="hidden" name="is_admin" value="on" />}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Checkbox name="ativo" defaultChecked={u.ativo} disabled={souEu}>Ativo</Checkbox>
                  <Checkbox name="is_admin" defaultChecked={u.is_admin} disabled={souEu}>Admin</Checkbox>
                  <span className="mx-1 h-4 w-px bg-slate-200" />
                  {TELAS.map(([key, label]) => (<Checkbox key={key} name={key} defaultChecked={u[key as TelaKey]}>{label}</Checkbox>))}
                </div>
                <div className="mt-3">
                  <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Salvar</button>
                </div>
              </form>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={reenviarConvite}>
                  <input type="hidden" name="email" value={u.email} />
                  <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">Reenviar convite</button>
                </form>
                {!souEu && (
                  <form action={removerUsuario}>
                    <input type="hidden" name="email" value={u.email} />
                    <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50">Remover</button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
