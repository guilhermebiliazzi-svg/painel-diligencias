'use client';

// Formulário de nova diligência do rquatro. Os campos seguem o formulário da
// Ville (WF-01): estado civil, regime, cônjuge (com a participação no bem) e,
// na empresa, o vínculo (vendedora ou empresa do vendedor) e os signatários.
// Tudo isso fica gravado na diligência para o contrato depois.
import { useActionState, useState } from 'react';
import { criarDiligencia } from '../actions';

type Conjuge = {
  participacao: string;
  registro: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  email: string;
};
type PF = {
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  email: string;
  estado_civil: string;
  regime: string;
  conjuge: Conjuge;
};
type Rep = {
  papel: string;
  certidoes: boolean;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  genero: string;
  mae: string;
  nacionalidade: string;
  profissao: string;
  estado_civil: string;
  email: string;
};
type PJ = { vinculo: string; nome: string; cnpj: string; reps: Rep[] };
type Mat = { numero: string; cartorio: string; sql: string };

const conjVazio = (): Conjuge => ({
  participacao: '', registro: '', nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '',
  nacionalidade: 'brasileiro(a)', profissao: '', email: '',
});
const pfVazia = (): PF => ({
  nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '', nacionalidade: 'brasileiro(a)', profissao: '',
  email: '', estado_civil: '', regime: '', conjuge: conjVazio(),
});
const repVazio = (): Rep => ({
  papel: '', certidoes: false, nome: '', cpf: '', rg: '', nascimento: '', genero: '', mae: '',
  nacionalidade: 'brasileiro(a)', profissao: '', estado_civil: '', email: '',
});
const pjVazia = (): PJ => ({ vinculo: '', nome: '', cnpj: '', reps: [repVazio()] });
const matVazia = (): Mat => ({ numero: '', cartorio: '', sql: '' });

export const temConjuge = (ec: string) => ec === 'casado' || ec === 'uniao_estavel';

const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const rotulo = 'block text-sm font-medium text-slate-700';
const botaoMais = 'ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50';
const remover = 'ml-auto text-xs font-semibold text-slate-500 underline hover:text-red-700';

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

const ESTADO_CIVIL = [
  ['solteiro', 'Solteiro(a)'],
  ['casado', 'Casado(a)'],
  ['uniao_estavel', 'União estável'],
  ['divorciado', 'Divorciado(a)'],
  ['viuvo', 'Viúvo(a)'],
  ['separado', 'Separado(a) judicialmente'],
];
const REGIMES = [
  ['comunhao_parcial', 'Comunhão parcial'],
  ['comunhao_universal', 'Comunhão universal'],
  ['separacao_total', 'Separação total/obrigatória'],
  ['participacao_final', 'Participação final nos aquestos'],
];
const PARTICIPACAO = [
  ['coproprietario', 'Coproprietário — bem comum do casal (é parte vendedora)'],
  ['anuente_anterior', 'Apenas anuente — bem adquirido antes do casamento'],
  ['anuente_gratuito', 'Apenas anuente — bem recebido em doação ou herança'],
  ['indeterminado', 'A determinar'],
];

function Sel({ valor, muda, opcoes, vazio = 'Escolha…' }: { valor: string; muda: (v: string) => void; opcoes: string[][]; vazio?: string }) {
  return (
    <select value={valor} onChange={(e) => muda(e.target.value)} className={campo}>
      <option value="">{vazio}</option>
      {opcoes.map(([v, t]) => (
        <option key={v} value={v}>{t}</option>
      ))}
    </select>
  );
}

/** Campos pessoais comuns (titular, cônjuge e signatário). */
function DadosPessoa<T extends { nome: string; cpf: string; rg: string; nascimento: string; genero: string; mae: string; nacionalidade: string; profissao: string; email: string }>({
  p,
  muda,
  obrig,
}: {
  p: T;
  muda: (k: keyof T, v: string) => void;
  obrig: boolean;
}) {
  const a = obrig ? ' *' : '';
  return (
    <>
      <label className={`${rotulo} sm:col-span-2`}>Nome completo *<input value={p.nome} onChange={(e) => muda('nome', e.target.value)} className={campo} /></label>
      <label className={rotulo}>CPF *<input value={p.cpf} onChange={(e) => muda('cpf', mascaraCpf(e.target.value))} className={campo} inputMode="numeric" /></label>
      <label className={rotulo}>RG<input value={p.rg} onChange={(e) => muda('rg', e.target.value)} className={campo} /></label>
      <label className={rotulo}>Data de nascimento{a}<input type="date" value={p.nascimento} onChange={(e) => muda('nascimento', e.target.value)} className={campo} /></label>
      <label className={rotulo}>
        Gênero{a}
        <Sel valor={p.genero} muda={(v) => muda('genero', v)} opcoes={[['F', 'Feminino'], ['M', 'Masculino']]} />
      </label>
      <label className={`${rotulo} sm:col-span-2`}>Nome da mãe{a}<input value={p.mae} onChange={(e) => muda('mae', e.target.value)} className={campo} /></label>
      <label className={rotulo}>Nacionalidade<input value={p.nacionalidade} onChange={(e) => muda('nacionalidade', e.target.value)} className={campo} /></label>
      <label className={rotulo}>Profissão<input value={p.profissao} onChange={(e) => muda('profissao', e.target.value)} className={campo} /></label>
      <label className={`${rotulo} sm:col-span-2`}>E-mail<input type="email" value={p.email} onChange={(e) => muda('email', e.target.value)} className={campo} /></label>
    </>
  );
}

export function FormularioNova({ unidades }: { unidades: { id: string; nome: string }[] | null }) {
  const [r, acao, enviando] = useActionState(criarDiligencia, null);
  const [pf, setPf] = useState<PF[]>([pfVazia()]);
  const [pj, setPj] = useState<PJ[]>([]);
  const [mat, setMat] = useState<Mat[]>([matVazia()]);
  const mudaMat = (i: number, k: keyof Mat, v: string) => setMat((a) => a.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  const mudaPf = (i: number, k: keyof PF, v: string) => setPf((a) => a.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const mudaConj = (i: number, k: keyof Conjuge, v: string) =>
    setPf((a) => a.map((p, j) => (j === i ? { ...p, conjuge: { ...p.conjuge, [k]: v } } : p)));
  const mudaPj = (i: number, k: 'vinculo' | 'nome' | 'cnpj', v: string) => setPj((a) => a.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const mudaRep = (i: number, ri: number, k: keyof Rep, v: string | boolean) =>
    setPj((a) =>
      a.map((p, j) => {
        if (j !== i) return p;
        const reps = p.reps.map((x, y) => {
          if (y !== ri) return x;
          const novo = { ...x, [k]: v } as Rep;
          if (k === 'papel') novo.certidoes = v === 'socio_adm';
          return novo;
        });
        return { ...p, reps };
      })
    );

  return (
    <form action={acao} className="space-y-6">
      <input type="hidden" name="pf" value={JSON.stringify(pf)} />
      <input type="hidden" name="pj" value={JSON.stringify(pj)} />
      <input type="hidden" name="mat" value={JSON.stringify(mat)} />

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
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-slate-700">Matrículas</p>
          <button type="button" onClick={() => setMat((a) => [...a, matVazia()])} className={botaoMais}>+ Matrícula (vaga, depósito…)</button>
        </div>
        {mat.map((m, i) => (
          <div key={i} className="mt-3 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
            <label className={rotulo}>Nº da matrícula *<input value={m.numero} onChange={(e) => mudaMat(i, 'numero', e.target.value)} className={campo} inputMode="numeric" /></label>
            <label className={rotulo}>Cartório<input value={m.cartorio} onChange={(e) => mudaMat(i, 'cartorio', e.target.value)} className={campo} placeholder="Ex.: 4º RI de São Paulo" /></label>
            <label className={rotulo}>
              SQL do IPTU
              <input value={m.sql} onChange={(e) => mudaMat(i, 'sql', e.target.value)} className={campo} inputMode="numeric" placeholder="000.000.0000-0" />
            </label>
            {mat.length > 1 && (
              <button type="button" onClick={() => setMat((a) => a.filter((_, j) => j !== i))} className={`${remover} sm:col-span-3`}>remover matrícula</button>
            )}
          </div>
        ))}
        <p className="mt-2 text-xs text-slate-500">
          Com o SQL, o sistema emite a certidão de débitos de IPTU de cada matrícula. A matrícula atualizada fica como documento a juntar pela unidade.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Vendedores — pessoa física</h2>
          <button type="button" onClick={() => setPf((a) => [...a, pfVazia()])} className={botaoMais}>+ Pessoa física</button>
        </div>
        {pf.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma pessoa física.</p>}
        {pf.map((p, i) => (
          <div key={i} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center">
              <p className="text-sm font-semibold text-slate-700">Vendedor(a) {i + 1}</p>
              <button type="button" onClick={() => setPf((a) => a.filter((_, j) => j !== i))} className={remover}>remover</button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <DadosPessoa p={p} muda={(k, v) => mudaPf(i, k, v)} obrig />
              <label className={rotulo}>
                Estado civil *
                <Sel valor={p.estado_civil} muda={(v) => mudaPf(i, 'estado_civil', v)} opcoes={ESTADO_CIVIL} />
              </label>
              {temConjuge(p.estado_civil) && (
                <label className={rotulo}>
                  Regime de bens *
                  <Sel valor={p.regime} muda={(v) => mudaPf(i, 'regime', v)} opcoes={REGIMES} />
                </label>
              )}
            </div>

            {temConjuge(p.estado_civil) && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">{p.estado_civil === 'casado' ? 'Cônjuge' : 'Companheiro(a)'}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className={`${rotulo} sm:col-span-2`}>
                    Participação no bem *
                    <Sel valor={p.conjuge.participacao} muda={(v) => mudaConj(i, 'participacao', v)} opcoes={PARTICIPACAO} />
                  </label>
                  {(p.conjuge.participacao === 'anuente_anterior' || p.conjuge.participacao === 'anuente_gratuito') && (
                    <label className={`${rotulo} sm:col-span-2`}>
                      Registro na matrícula que comprova
                      <input value={p.conjuge.registro} onChange={(e) => mudaConj(i, 'registro', e.target.value)} className={campo} placeholder="Ex.: R.5/16.707" />
                    </label>
                  )}
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    As certidões do cônjuge são emitidas em qualquer hipótese. Coproprietário entra no contrato como parte vendedora; anuente só assina concordando.
                  </p>
                  <DadosPessoa p={p.conjuge} muda={(k, v) => mudaConj(i, k, v)} obrig />
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Empresas</h2>
          <button type="button" onClick={() => setPj((a) => [...a, pjVazia()])} className={botaoMais}>+ Empresa</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Inclua a empresa vendedora e também as empresas em que o vendedor é sócio (as certidões delas entram na diligência).
        </p>
        {pj.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma empresa.</p>}
        {pj.map((p, i) => (
          <div key={i} className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center">
              <p className="text-sm font-semibold text-slate-700">Empresa {i + 1}</p>
              <button type="button" onClick={() => setPj((a) => a.filter((_, j) => j !== i))} className={remover}>remover</button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={`${rotulo} sm:col-span-2`}>
                Vínculo da empresa *
                <Sel
                  valor={p.vinculo}
                  muda={(v) => mudaPj(i, 'vinculo', v)}
                  opcoes={[
                    ['vendedora', 'Vendedora — é parte no contrato'],
                    ['participacao', 'Empresa do vendedor — só entra na diligência'],
                  ]}
                />
              </label>
              <label className={rotulo}>Razão social *<input value={p.nome} onChange={(e) => mudaPj(i, 'nome', e.target.value)} className={campo} /></label>
              <label className={rotulo}>CNPJ *<input value={p.cnpj} onChange={(e) => mudaPj(i, 'cnpj', mascaraCnpj(e.target.value))} className={campo} inputMode="numeric" /></label>
            </div>
            {p.vinculo === 'participacao' && (
              <p className="mt-2 text-xs text-slate-500">Puxa as certidões do CNPJ para a diligência, mas não entra no contrato e não precisa de signatário.</p>
            )}

            {p.vinculo === 'vendedora' && (
              <div className="mt-4 space-y-3">
                {p.reps.map((rep, ri) => (
                  <div key={ri} className="rounded-xl bg-slate-50 p-4">
                    <div className="flex items-center">
                      <p className="text-sm font-semibold text-slate-700">Signatário {ri + 1} (quem assina pela empresa)</p>
                      {p.reps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPj((a) => a.map((x, j) => (j === i ? { ...x, reps: x.reps.filter((_, y) => y !== ri) } : x)))}
                          className={remover}
                        >
                          remover
                        </button>
                      )}
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className={rotulo}>
                        Papel na empresa *
                        <Sel
                          valor={rep.papel}
                          muda={(v) => mudaRep(i, ri, 'papel', v)}
                          opcoes={[
                            ['socio_adm', 'Sócio administrador'],
                            ['adm_nao_socio', 'Administrador (não sócio)'],
                            ['procurador', 'Procurador'],
                          ]}
                        />
                      </label>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                        <input type="checkbox" checked={rep.certidoes} onChange={(e) => mudaRep(i, ri, 'certidoes', e.target.checked)} />
                        Emitir certidões pessoais do signatário
                      </label>
                      <DadosPessoa p={rep} muda={(k, v) => mudaRep(i, ri, k, v)} obrig={rep.certidoes} />
                      <label className={rotulo}>
                        Estado civil
                        <Sel valor={rep.estado_civil} muda={(v) => mudaRep(i, ri, 'estado_civil', v)} opcoes={ESTADO_CIVIL} vazio="—" />
                      </label>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPj((a) => a.map((x, j) => (j === i ? { ...x, reps: [...x.reps, repVazio()] } : x)))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  + Signatário
                </button>
              </div>
            )}
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
