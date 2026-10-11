'use client';

import { useActionState, useMemo, useState } from 'react';
import type { Perfil } from '@/lib/perfil';
import { AREAS, TELAS } from '@/lib/acesso';
import {
  convidarUsuario,
  salvarUsuario,
  reenviarConvite,
  removerUsuario,
  salvarPerfilAcesso,
  excluirPerfilAcesso,
  type AcaoState,
  type PerfilAcessoRow,
} from './actions';

const INPUT = 'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
const BOTAO = 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60';
const TELA_TITULO = new Map(TELAS.map((t) => [t.chave as string, t.titulo]));

function resumoAlcance(p: PerfilAcessoRow): string[] {
  if (p.admin) return ['Tudo, inclusive usuários e perfis'];
  const out: string[] = [];
  if (p.telas.includes('diligencias')) out.push(p.escopo_diligencias === 'proprias' ? 'Diligências: só as próprias' : 'Diligências: todas');
  if (p.telas.includes('sdr')) out.push(p.escopo_sdr === 'proprio' ? 'SDR: só o próprio funil' : 'SDR: funil completo');
  return out;
}

function Mensagem({ state, okTexto }: { state: AcaoState; okTexto: string }) {
  if (state?.erro) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.erro}</p>;
  if (state?.aviso) return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{state.aviso}</p>;
  if (state?.ok) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{okTexto}</p>;
  return null;
}

// Formulário de perfil (novo ou edição)
function FormPerfil({ p, onFechar }: { p?: PerfilAcessoRow; onFechar?: () => void }) {
  const [state, salvar, salvando] = useActionState<AcaoState, FormData>(salvarPerfilAcesso, undefined);
  const [telas, setTelas] = useState<string[]>(p?.telas ?? []);
  const alterna = (t: string) => setTelas((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  return (
    <form action={salvar} className="space-y-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="nome" defaultValue={p?.nome ?? ''} required={!p} disabled={!!p?.sistema} placeholder="Nome do perfil (ex.: Jurídico, Financeiro)" className={`${INPUT} disabled:bg-slate-50 disabled:text-slate-500`} />
        <input name="descricao" defaultValue={p?.descricao ?? ''} placeholder="Para quem é (opcional)" className={INPUT} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((a) => {
          const daArea = TELAS.filter((t) => t.area === a.chave && !t.soAdmin);
          if (!daArea.length) return null;
          return (
            <fieldset key={a.chave} className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{a.titulo}</legend>
              <div className="space-y-1.5">
                {daArea.map((t) => (
                  <label key={t.chave} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="telas" value={t.chave} checked={telas.includes(t.chave)} onChange={() => alterna(t.chave)} className="size-4 rounded border-slate-300" />
                    {t.titulo}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      {(telas.includes('diligencias') || telas.includes('sdr')) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {telas.includes('diligencias') && (
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Diligências</legend>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="escopo_diligencias" value="todas" defaultChecked={p?.escopo_diligencias !== 'proprias'} className="mt-0.5" />
                <span>Todas, com emissão, parecer, CCV e cobrança</span>
              </label>
              <label className="mt-1.5 flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="escopo_diligencias" value="proprias" defaultChecked={p?.escopo_diligencias === 'proprias'} className="mt-0.5" />
                <span>Só as próprias (criou ou está no split), para acompanhar, enviar arquivo e preencher a ficha do negócio</span>
              </label>
            </fieldset>
          )}
          {telas.includes('sdr') && (
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Funil do SDR</legend>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="escopo_sdr" value="todos" defaultChecked={p?.escopo_sdr !== 'proprio'} className="mt-0.5" />
                <span>Funil completo, com fila, descarte e referência</span>
              </label>
              <label className="mt-1.5 flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="escopo_sdr" value="proprio" defaultChecked={p?.escopo_sdr === 'proprio'} className="mt-0.5" />
                <span>Só o próprio funil (leads oferecidos ao corretor)</span>
              </label>
            </fieldset>
          )}
        </div>
      )}

      <Mensagem state={state} okTexto="Perfil salvo." />
      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className={BOTAO}>{salvando ? 'Salvando…' : p ? 'Salvar perfil' : 'Criar perfil'}</button>
        {onFechar && (
          <button type="button" onClick={onFechar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Fechar</button>
        )}
      </div>
    </form>
  );
}

function CartaoPerfil({ p, pessoas }: { p: PerfilAcessoRow; pessoas: number }) {
  const [editando, setEditando] = useState(false);
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">
            {p.nome}
            {p.sistema && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase text-slate-500">padrão</span>}
          </p>
          {p.descricao && <p className="text-xs text-slate-500">{p.descricao}</p>}
        </div>
        <span className="text-xs text-slate-500">{pessoas} pessoa{pessoas === 1 ? '' : 's'}</span>
      </div>

      {!editando && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(p.admin ? TELAS.map((t) => t.chave as string) : p.telas).map((t) => (
              <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{TELA_TITULO.get(t) ?? t}</span>
            ))}
          </div>
          {resumoAlcance(p).length > 0 && <p className="mt-2 text-xs text-slate-600">{resumoAlcance(p).join(' · ')}</p>}
          <div className="mt-3 flex gap-2">
            {!p.admin && (
              <button type="button" onClick={() => setEditando(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Editar</button>
            )}
            {!p.sistema && pessoas === 0 && (
              <form action={excluirPerfilAcesso}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50">Excluir</button>
              </form>
            )}
          </div>
        </>
      )}
      {editando && (
        <div className="mt-4">
          <FormPerfil p={p} onFechar={() => setEditando(false)} />
          {pessoas > 0 && <p className="mt-2 text-xs text-slate-500">Ao salvar, as {pessoas} pessoa(s) deste perfil passam a valer as regras novas.</p>}
        </div>
      )}
    </div>
  );
}

function SelectPerfil({ perfis, defaultValue, legado }: { perfis: PerfilAcessoRow[]; defaultValue?: string; legado?: boolean }) {
  return (
    <select name="perfil_acesso_id" defaultValue={defaultValue ?? ''} required className={`${INPUT} py-1.5`}>
      {legado ? <option value="legado">Sem perfil (permissões antigas)</option> : <option value="" disabled>Perfil de acesso…</option>}
      {perfis.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
    </select>
  );
}

export default function UsuariosClient({ lista, perfis, meuEmail }: { lista: Perfil[]; perfis: PerfilAcessoRow[]; meuEmail: string }) {
  const [state, convidar, enviando] = useActionState<AcaoState, FormData>(convidarUsuario, undefined);
  const [novoPerfil, setNovoPerfil] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of lista) if (u.perfil_acesso_id) m.set(u.perfil_acesso_id, (m.get(u.perfil_acesso_id) ?? 0) + 1);
    return m;
  }, [lista]);
  const nomePerfil = new Map(perfis.map((p) => [p.id, p.nome]));
  const corretor = perfis.find((p) => p.sistema === 'corretor');
  const visiveis = lista.filter((u) => {
    if (filtro === 'legado' && u.perfil_acesso_id) return false;
    if (filtro && filtro !== 'legado' && u.perfil_acesso_id !== filtro) return false;
    const q = busca.trim().toLowerCase();
    return !q || (u.nome ?? '').toLowerCase().includes(q) || u.email.includes(q);
  });

  return (
    <div className="mt-6 space-y-8">
      {/* Perfis */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Perfis de acesso ({perfis.length})</h2>
            <p className="text-xs text-slate-500">Cada pessoa tem um perfil. Mudou o perfil, muda para todo mundo nele.</p>
          </div>
          {!novoPerfil && (
            <button type="button" onClick={() => setNovoPerfil(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">+ Novo perfil</button>
          )}
        </div>
        {novoPerfil && (
          <div style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-blue-200 p-5 shadow-sm">
            <h3 className="mb-3 text-base font-semibold text-slate-900">Novo perfil personalizado</h3>
            <FormPerfil onFechar={() => setNovoPerfil(false)} />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {perfis.map((p) => (<CartaoPerfil key={p.id} p={p} pessoas={contagem.get(p.id) ?? 0} />))}
        </div>
      </section>

      {/* Convite */}
      <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Convidar pessoa</h2>
        <p className="mt-1 text-sm text-slate-600">
          A pessoa recebe um e-mail de acesso e entra com o Google (mesmo e-mail). Corretores do cadastro entram sozinhos com o perfil Corretor.
        </p>
        <form action={convidar} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="email" type="email" required placeholder="email@daempresa.com" className={INPUT} />
            <input name="nome" type="text" placeholder="Nome (opcional)" className={INPUT} />
            <SelectPerfil perfis={perfis} defaultValue={corretor?.id} />
          </div>
          <Mensagem state={state} okTexto="Convite enviado." />
          <button type="submit" disabled={enviando} className={BOTAO}>{enviando ? 'Enviando…' : 'Convidar'}</button>
        </form>
      </section>

      {/* Pessoas */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pessoas ({visiveis.length} de {lista.length})</h2>
          <div className="flex gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail" className={`${INPUT} py-1.5`} />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={`${INPUT} py-1.5`}>
              <option value="">Todos os perfis</option>
              {perfis.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
              <option value="legado">Sem perfil</option>
            </select>
          </div>
        </div>
        {visiveis.map((u) => {
          const souEu = u.email === meuEmail;
          return (
            <div key={u.email} style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <form action={salvarUsuario} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="email" value={u.email} />
                {souEu && <input type="hidden" name="ativo" value="on" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {u.nome || u.email}
                    {!u.ativo && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase text-slate-600">inativo</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email}
                    {!u.perfil_acesso_id && <span className="ml-1 text-amber-700">· sem perfil{u.is_admin ? ' (admin)' : ''}</span>}
                    {u.perfil_acesso_id && <span className="ml-1">· {nomePerfil.get(u.perfil_acesso_id) ?? 'perfil'}</span>}
                  </p>
                </div>
                <SelectPerfil perfis={perfis} defaultValue={u.perfil_acesso_id ?? 'legado'} legado={!u.perfil_acesso_id} />
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" name="ativo" defaultChecked={u.ativo} disabled={souEu} className="size-4 rounded border-slate-300 disabled:opacity-50" />
                  Ativo
                </label>
                <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Salvar</button>
              </form>
              <div className="mt-1 flex flex-wrap gap-1">
                <form action={reenviarConvite}>
                  <input type="hidden" name="email" value={u.email} />
                  <button type="submit" className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">Reenviar convite</button>
                </form>
                {!souEu && (
                  <form action={removerUsuario}>
                    <input type="hidden" name="email" value={u.email} />
                    <button type="submit" className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50">Remover</button>
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
