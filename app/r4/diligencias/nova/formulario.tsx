'use client';

import { useActionState, useState } from 'react';
import { criarDiligencia } from '../actions';

type PF = { nome: string; cpf: string; rg: string; nascimento: string; genero: string; mae: string; estado_civil: string };
type PJ = { nome: string; cnpj: string };

const pfVazia = (): PF => ({ nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '', estado_civil: '' });
const pjVazia = (): PJ => ({ nome: '', cnpj: '' });

const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const rotulo = 'block text-sm font-medium text-slate-700';

function mascaraCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function mascaraCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function FormularioNova({ unidades }: { unidades: { id: string; nome: string }[] | null }) {
  const [r, acao, enviando] = useActionState(criarDiligencia, null);
  const [pf, setPf] = useState<PF[]>([pfVazia()]);
  const [pj, setPj] = useState<PJ[]>([]);

  const mudaPf = (i: number, k: keyof PF, v: string) => setPf((a) => a.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const mudaPj = (i: number, k: keyof PJ, v: string) => setPj((a) => a.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <form action={acao} className="space-y-6">
      <input type="hidden" name="pf" value={JSON.stringify(pf)} />
      <input type="hidden" name="pj" value={JSON.stringify(pj)} />

      {unidades && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <label className={rotulo}>
            Unidade *
            <select name="unidade_id" required className={campo} defaultValue="">
              <option value="" disabled>Escolha…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold">Imóvel</h2>
        <div className="mt-3 grid gap-3">
          <label className={rotulo}>
            Endereço completo *
            <input name="endereco" required className={campo} placeholder="Rua Exemplo, 123, apto 45 — Bairro, São Paulo/SP" />
          </label>
          <label className={rotulo}>
            SQL do IPTU (número do contribuinte)
            <input name="sql_iptu" className={campo} inputMode="numeric" placeholder="000.000.0000-0 — se tiver mais de um, separe por vírgula" />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Com o SQL, o sistema emite a certidão de débitos de IPTU. A matrícula fica por conta da unidade.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Proprietários — pessoa física</h2>
          <button type="button" onClick={() => setPf((a) => [...a, pfVazia()])} className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
            + Pessoa física
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Inclua o cônjuge como outra pessoa: as certidões dele também são emitidas.</p>
        {pf.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma pessoa física.</p>}
        {pf.map((p, i) => (
          <div key={i} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center">
              <p className="text-sm font-semibold text-slate-700">Pessoa física {i + 1}</p>
              <button type="button" onClick={() => setPf((a) => a.filter((_, j) => j !== i))} className="ml-auto text-xs font-semibold text-slate-500 underline hover:text-red-700">
                remover
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={`${rotulo} sm:col-span-2`}>Nome completo *<input value={p.nome} onChange={(e) => mudaPf(i, 'nome', e.target.value)} className={campo} /></label>
              <label className={rotulo}>CPF *<input value={p.cpf} onChange={(e) => mudaPf(i, 'cpf', mascaraCpf(e.target.value))} className={campo} inputMode="numeric" /></label>
              <label className={rotulo}>RG<input value={p.rg} onChange={(e) => mudaPf(i, 'rg', e.target.value)} className={campo} /></label>
              <label className={rotulo}>Data de nascimento *<input type="date" value={p.nascimento} onChange={(e) => mudaPf(i, 'nascimento', e.target.value)} className={campo} /></label>
              <label className={rotulo}>
                Gênero *
                <select value={p.genero} onChange={(e) => mudaPf(i, 'genero', e.target.value)} className={campo}>
                  <option value="">Escolha…</option>
                  <option value="F">Feminino</option>
                  <option value="M">Masculino</option>
                </select>
              </label>
              <label className={`${rotulo} sm:col-span-2`}>Nome da mãe *<input value={p.mae} onChange={(e) => mudaPf(i, 'mae', e.target.value)} className={campo} /></label>
              <label className={rotulo}>
                Estado civil
                <select value={p.estado_civil} onChange={(e) => mudaPf(i, 'estado_civil', e.target.value)} className={campo}>
                  <option value="">—</option>
                  <option>Solteiro(a)</option>
                  <option>Casado(a)</option>
                  <option>Divorciado(a)</option>
                  <option>Viúvo(a)</option>
                  <option>União estável</option>
                  <option>Separado(a)</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Proprietários — empresa</h2>
          <button type="button" onClick={() => setPj((a) => [...a, pjVazia()])} className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
            + Empresa
          </button>
        </div>
        {pj.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma empresa.</p>}
        {pj.map((p, i) => (
          <div key={i} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center">
              <p className="text-sm font-semibold text-slate-700">Empresa {i + 1}</p>
              <button type="button" onClick={() => setPj((a) => a.filter((_, j) => j !== i))} className="ml-auto text-xs font-semibold text-slate-500 underline hover:text-red-700">
                remover
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={rotulo}>Razão social *<input value={p.nome} onChange={(e) => mudaPj(i, 'nome', e.target.value)} className={campo} /></label>
              <label className={rotulo}>CNPJ *<input value={p.cnpj} onChange={(e) => mudaPj(i, 'cnpj', mascaraCnpj(e.target.value))} className={campo} inputMode="numeric" /></label>
            </div>
          </div>
        ))}
      </section>

      {r && !r.ok && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.msg}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={enviando} className="rounded-lg bg-[#0F1B2D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2c45] disabled:opacity-60">
          {enviando ? 'Iniciando as certidões… (pode levar até 1 minuto)' : 'Iniciar diligência'}
        </button>
        <p className="text-xs text-slate-500">R$ 2,00 por certidão emitida pelo sistema. Certidões que falharem não são cobradas.</p>
      </div>
    </form>
  );
}
