'use client';

// app/admin/FichaNegocio.tsx
// Ficha "Dados do negócio" da diligência: preço, parcelas, comissão (com pagador,
// alínea de abatimento e split por corretor) e contas de crédito da PARTE
// VENDEDORA com rateio percentual (vários vendedores/herdeiros).
// Salva em diligencias.dados_completos.negocio — a fonte dos FATOS do CCV.

import { useState, useTransition } from 'react';
import { carregarNegocio, salvarNegocio } from './actions';

type Parcela = { tipo: string; rotulo: string; valor: string; momento: string };
type SplitItem = { credor: string; documento: string; creci: string; valor: string };
type Conta = {
  titular: string;
  cpf_cnpj: string;
  banco: string;
  agencia: string;
  conta: string;
  percentual: string;
};

const TIPOS_PARCELA = [
  { v: 'sinal', label: 'Sinal e princípio de pagamento' },
  { v: 'recursos_proprios', label: 'Recursos próprios' },
  { v: 'fgts', label: 'FGTS' },
  { v: 'financiamento', label: 'Financiamento bancário' },
  { v: 'a_vista', label: 'Saldo à vista' },
];

const ALINEAS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

function num(s: string): number | null {
  if (s === '' || s === null || s === undefined) return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}
function numSimples(s: string): number | null {
  if (s === '' || s === null || s === undefined) return null;
  const n = Number(String(s).replace(',', '.'));
  return isFinite(n) ? n : null;
}
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

const inputCls =
  'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50';
const labelCls = 'mb-1 block text-xs font-medium text-slate-700';
const btnAddCls =
  'rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50';
const btnDelCls =
  'shrink-0 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50';

export function FichaNegocio({ diligenciaId }: { diligenciaId: string }) {
  const [open, setOpen] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [vendedores, setVendedores] = useState<{ nome: string; cpf: string }[]>([]);

  const [preco, setPreco] = useState('');
  const [parcelas, setParcelas] = useState<Parcela[]>([
    { tipo: 'sinal', rotulo: '', valor: '', momento: 'pagos neste ato' },
  ]);
  const [comTotal, setComTotal] = useState('');
  const [comPct, setComPct] = useState('');
  const [comCond, setComCond] = useState('');
  const [comPagador, setComPagador] = useState('');
  const [comAlinea, setComAlinea] = useState('');
  const [split, setSplit] = useState<SplitItem[]>([
    {
      credor: 'VILLE JARDINS NEGOCIOS IMOBILIARIOS LTDA',
      documento: '41.132.782/0001-08',
      creci: '037196-J',
      valor: '',
    },
  ]);
  const [contas, setContas] = useState<Conta[]>([
    { titular: '', cpf_cnpj: '', banco: '', agencia: '', conta: '', percentual: '100' },
  ]);

  async function abrir() {
    setOpen(true);
    setErro(null);
    setSalvo(false);
    setCarregando(true);
    try {
      const r = await carregarNegocio(diligenciaId);
      if (r.ok) {
        setVendedores(r.vendedores || []);
        const n = (r.negocio || {}) as Record<string, unknown>;
        const pag = (n.pagamento || {}) as Record<string, unknown>;
        const com = (n.comissao || {}) as Record<string, unknown>;
        const pcs = Array.isArray(pag.parcelas) ? (pag.parcelas as Record<string, unknown>[]) : [];
        const spl = Array.isArray(com.split) ? (com.split as Record<string, unknown>[]) : [];
        const cts = Array.isArray(n.contas_vendedoras)
          ? (n.contas_vendedoras as Record<string, unknown>[])
          : [];

        setPreco(str(n.preco ?? r.preco ?? ''));
        if (pcs.length)
          setParcelas(
            pcs.map((p) => ({
              tipo: str(p.tipo) || 'recursos_proprios',
              rotulo: str(p.rotulo),
              valor: str(p.valor),
              momento: str(p.momento),
            }))
          );
        setComTotal(str(com.total));
        setComPct(str(com.percentual));
        setComCond(str(com.condicao_pagamento));
        setComPagador(str(com.pagador));
        setComAlinea(str(com.parcela_abatimento));
        if (spl.length)
          setSplit(
            spl.map((s) => ({
              credor: str(s.credor),
              documento: str(s.documento),
              creci: str(s.creci),
              valor: str(s.valor),
            }))
          );
        if (cts.length)
          setContas(
            cts.map((c) => ({
              titular: str(c.titular),
              cpf_cnpj: str(c.cpf_cnpj),
              banco: str(c.banco),
              agencia: str(c.agencia),
              conta: str(c.conta),
              percentual: str(c.percentual),
            }))
          );
      }
    } catch {
      /* mantém defaults */
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    if (pending) return;
    setOpen(false);
    setErro(null);
  }

  function salvar() {
    setErro(null);
    setSalvo(false);
    const negocio = {
      preco: num(preco),
      pagamento: {
        tem_sinal: parcelas.some((p) => p.tipo === 'sinal' && num(p.valor) !== null),
        parcelas: parcelas
          .filter((p) => num(p.valor) !== null)
          .map((p) => ({
            tipo: p.tipo,
            rotulo: p.rotulo || null,
            valor: num(p.valor),
            momento: p.momento || null,
          })),
      },
      contas_vendedoras: contas
        .filter((c) => c.titular || c.banco || c.conta)
        .map((c) => ({
          titular: c.titular || null,
          cpf_cnpj: c.cpf_cnpj || null,
          banco: c.banco || null,
          agencia: c.agencia || null,
          conta: c.conta || null,
          percentual: numSimples(c.percentual),
        })),
      comissao: {
        total: num(comTotal),
        percentual: numSimples(comPct),
        condicao_pagamento: comCond || null,
        pagador: comPagador || null,
        parcela_abatimento: comPagador === 'comprador' ? comAlinea || null : null,
        split: split
          .filter((s) => s.credor)
          .map((s) => ({
            credor: s.credor,
            documento: s.documento || null,
            creci: s.creci || null,
            valor: num(s.valor) ?? 0,
          })),
      },
    };
    startTransition(async () => {
      const r = await salvarNegocio(diligenciaId, negocio);
      if (r.ok) {
        setSalvo(true);
      } else {
        setErro(r.error || 'erro ao salvar');
      }
    });
  }

  const somaParcelas = parcelas.reduce((a, p) => a + (num(p.valor) ?? 0), 0);
  const somaSplit = split.reduce((a, s) => a + (num(s.valor) ?? 0), 0);
  const somaPct = contas.reduce((a, c) => a + (numSimples(c.percentual) ?? 0), 0);
  const precoNum = num(preco);
  const comTotalNum = num(comTotal);
  const parcelasOk = precoNum === null || Math.abs(somaParcelas - precoNum) <= 0.5;
  const splitOk = comTotalNum === null || Math.abs(somaSplit - comTotalNum) <= 0.5;
  const pctOk = contas.length <= 1 || Math.abs(somaPct - 100) <= 0.01;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
        title="Preço, parcelas, comissão (pagador, alínea e split) e contas de crédito da parte vendedora — fonte dos FATOS do CCV"
      >
        💼 Dados do negócio
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
          onClick={fechar}
        >
          <div
            className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Dados do negócio</h2>
              <button
                type="button"
                onClick={fechar}
                disabled={pending}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              ℹ Estes dados alimentam o Item 3 (preço e parcelas), o Item 3.1 (contas e rateio do
              crédito) e o Item 6 (comissão) do CCV. O que ficar vazio sai como [a completar] no
              rascunho.
            </p>

            {carregando ? (
              <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
            ) : (
              <div className="space-y-5">
                {/* ---------------- Preço e parcelas ---------------- */}
                <section>
                  <div className="mb-2 flex items-baseline justify-between border-b border-slate-200 pb-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Preço e parcelas (Item 3)
                    </h3>
                    <span
                      className={`text-[11px] font-medium ${parcelasOk ? 'text-slate-500' : 'text-rose-600'}`}
                    >
                      soma parcelas R$ {fmt(somaParcelas)}
                      {precoNum !== null && !parcelasOk && <> ≠ preço R$ {fmt(precoNum)}</>}
                    </span>
                  </div>
                  <div className="mb-3 w-48">
                    <label className={labelCls}>Preço total (R$)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={preco}
                      onChange={(e) => setPreco(e.target.value)}
                      disabled={pending}
                      placeholder="2000000"
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-2">
                    {parcelas.map((p, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <span className="w-5 pb-2 text-xs font-bold text-slate-500">
                          {ALINEAS[i] || '?'})
                        </span>
                        <div className="w-52">
                          {i === 0 && <label className={labelCls}>Origem</label>}
                          <select
                            value={p.tipo}
                            onChange={(e) => {
                              const v = [...parcelas];
                              v[i] = { ...v[i], tipo: e.target.value };
                              setParcelas(v);
                            }}
                            disabled={pending}
                            className={inputCls}
                          >
                            {TIPOS_PARCELA.map((t) => (
                              <option key={t.v} value={t.v}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-36">
                          {i === 0 && <label className={labelCls}>Valor (R$)</label>}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.valor}
                            onChange={(e) => {
                              const v = [...parcelas];
                              v[i] = { ...v[i], valor: e.target.value };
                              setParcelas(v);
                            }}
                            disabled={pending}
                            placeholder="100000"
                            className={inputCls}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          {i === 0 && <label className={labelCls}>Momento do pagamento</label>}
                          <input
                            type="text"
                            value={p.momento}
                            onChange={(e) => {
                              const v = [...parcelas];
                              v[i] = { ...v[i], momento: e.target.value };
                              setParcelas(v);
                            }}
                            disabled={pending}
                            placeholder="Ex.: na assinatura do instrumento definitivo"
                            className={inputCls}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setParcelas(parcelas.filter((_, j) => j !== i))}
                          disabled={pending || parcelas.length <= 1}
                          className={`${btnDelCls} disabled:opacity-40`}
                          title="Remover parcela"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setParcelas([
                        ...parcelas,
                        { tipo: 'recursos_proprios', rotulo: '', valor: '', momento: '' },
                      ])
                    }
                    disabled={pending || parcelas.length >= ALINEAS.length}
                    className={`mt-2 ${btnAddCls}`}
                  >
                    + Parcela
                  </button>
                </section>

                {/* ---------------- Contas da vendedora ---------------- */}
                <section>
                  <div className="mb-2 flex items-baseline justify-between border-b border-slate-200 pb-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Contas da parte vendedora (Item 3.1)
                    </h3>
                    <span
                      className={`text-[11px] font-medium ${pctOk ? 'text-slate-500' : 'text-rose-600'}`}
                    >
                      soma {fmt(somaPct)}%{!pctOk && ' ≠ 100%'}
                    </span>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">
                    Com mais de um vendedor (ex.: herdeiros), inclua uma conta por recebedor e o %
                    que cabe a cada um.
                  </p>
                  <datalist id="fn-vendedores">
                    {vendedores.map((v) => (
                      <option key={v.cpf || v.nome} value={v.nome} />
                    ))}
                  </datalist>
                  <div className="space-y-2">
                    {contas.map((c, i) => (
                      <div key={i} className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
                        <div className="mb-2 flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <label className={labelCls}>Titular da conta</label>
                            <input
                              type="text"
                              list="fn-vendedores"
                              value={c.titular}
                              onChange={(e) => {
                                const v = [...contas];
                                v[i] = { ...v[i], titular: e.target.value };
                                setContas(v);
                              }}
                              disabled={pending}
                              placeholder="Nome do vendedor recebedor"
                              className={inputCls}
                            />
                          </div>
                          <div className="w-44">
                            <label className={labelCls}>CPF/CNPJ</label>
                            <input
                              type="text"
                              value={c.cpf_cnpj}
                              onChange={(e) => {
                                const v = [...contas];
                                v[i] = { ...v[i], cpf_cnpj: e.target.value };
                                setContas(v);
                              }}
                              disabled={pending}
                              placeholder="000.000.000-00"
                              className={inputCls}
                            />
                          </div>
                          <div className="w-24">
                            <label className={labelCls}>%</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={c.percentual}
                              onChange={(e) => {
                                const v = [...contas];
                                v[i] = { ...v[i], percentual: e.target.value };
                                setContas(v);
                              }}
                              disabled={pending}
                              placeholder="25"
                              className={inputCls}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setContas(contas.filter((_, j) => j !== i))}
                            disabled={pending || contas.length <= 1}
                            className={`${btnDelCls} disabled:opacity-40`}
                            title="Remover conta"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={c.banco}
                              onChange={(e) => {
                                const v = [...contas];
                                v[i] = { ...v[i], banco: e.target.value };
                                setContas(v);
                              }}
                              disabled={pending}
                              placeholder="Banco"
                              className={inputCls}
                            />
                          </div>
                          <div className="w-32">
                            <input
                              type="text"
                              value={c.agencia}
                              onChange={(e) => {
                                const v = [...contas];
                                v[i] = { ...v[i], agencia: e.target.value };
                                setContas(v);
                              }}
                              disabled={pending}
                              placeholder="Agência"
                              className={inputCls}
                            />
                          </div>
                          <div className="w-44">
                            <input
                              type="text"
                              value={c.conta}
                              onChange={(e) => {
                                const v = [...contas];
                                v[i] = { ...v[i], conta: e.target.value };
                                setContas(v);
                              }}
                              disabled={pending}
                              placeholder="Conta"
                              className={inputCls}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setContas([
                        ...contas,
                        { titular: '', cpf_cnpj: '', banco: '', agencia: '', conta: '', percentual: '' },
                      ])
                    }
                    disabled={pending}
                    className={`mt-2 ${btnAddCls}`}
                  >
                    + Conta
                  </button>
                </section>

                {/* ---------------- Comissão ---------------- */}
                <section>
                  <div className="mb-2 flex items-baseline justify-between border-b border-slate-200 pb-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Comissão (Item 6)
                    </h3>
                    <span
                      className={`text-[11px] font-medium ${splitOk ? 'text-slate-500' : 'text-rose-600'}`}
                    >
                      soma split R$ {fmt(somaSplit)}
                      {comTotalNum !== null && !splitOk && <> ≠ total R$ {fmt(comTotalNum)}</>}
                    </span>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelCls}>Total (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={comTotal}
                        onChange={(e) => setComTotal(e.target.value)}
                        disabled={pending}
                        placeholder="120000"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Percentual (%)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={comPct}
                        onChange={(e) => setComPct(e.target.value)}
                        disabled={pending}
                        placeholder="6"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Quem paga</label>
                      <select
                        value={comPagador}
                        onChange={(e) => setComPagador(e.target.value)}
                        disabled={pending}
                        className={inputCls}
                      >
                        <option value="">— selecionar —</option>
                        <option value="comprador">Comprador</option>
                        <option value="vendedor">Vendedor</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Abatida da alínea</label>
                      <select
                        value={comAlinea}
                        onChange={(e) => setComAlinea(e.target.value)}
                        disabled={pending || comPagador !== 'comprador'}
                        className={inputCls}
                        title={
                          comPagador === 'comprador'
                            ? 'Alínea do Item 3 da qual a comissão será abatida'
                            : 'Só se aplica quando o comprador paga'
                        }
                      >
                        <option value="">— selecionar —</option>
                        {parcelas.map((p, i) => (
                          <option key={i} value={ALINEAS[i]}>
                            {ALINEAS[i]}) {TIPOS_PARCELA.find((t) => t.v === p.tipo)?.label ?? p.tipo}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className={labelCls}>Momento/condição do pagamento</label>
                    <input
                      type="text"
                      value={comCond}
                      onChange={(e) => setComCond(e.target.value)}
                      disabled={pending}
                      placeholder="Ex.: na data da assinatura do contrato de financiamento"
                      className={inputCls}
                    />
                  </div>
                  <p className="mb-1 text-[11px] font-medium text-slate-600">
                    Split — partícipes e credores:
                  </p>
                  <div className="space-y-2">
                    {split.map((s, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          {i === 0 && <label className={labelCls}>Credor</label>}
                          <input
                            type="text"
                            value={s.credor}
                            onChange={(e) => {
                              const v = [...split];
                              v[i] = { ...v[i], credor: e.target.value };
                              setSplit(v);
                            }}
                            disabled={pending}
                            placeholder="Nome / razão social"
                            className={inputCls}
                          />
                        </div>
                        <div className="w-44">
                          {i === 0 && <label className={labelCls}>CPF/CNPJ</label>}
                          <input
                            type="text"
                            value={s.documento}
                            onChange={(e) => {
                              const v = [...split];
                              v[i] = { ...v[i], documento: e.target.value };
                              setSplit(v);
                            }}
                            disabled={pending}
                            placeholder="00.000.000/0000-00"
                            className={inputCls}
                          />
                        </div>
                        <div className="w-28">
                          {i === 0 && <label className={labelCls}>CRECI</label>}
                          <input
                            type="text"
                            value={s.creci}
                            onChange={(e) => {
                              const v = [...split];
                              v[i] = { ...v[i], creci: e.target.value };
                              setSplit(v);
                            }}
                            disabled={pending}
                            placeholder="000000-F"
                            className={inputCls}
                          />
                        </div>
                        <div className="w-32">
                          {i === 0 && <label className={labelCls}>Valor (R$)</label>}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={s.valor}
                            onChange={(e) => {
                              const v = [...split];
                              v[i] = { ...v[i], valor: e.target.value };
                              setSplit(v);
                            }}
                            disabled={pending}
                            placeholder="24000"
                            className={inputCls}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setSplit(split.filter((_, j) => j !== i))}
                          disabled={pending || split.length <= 1}
                          className={`${btnDelCls} disabled:opacity-40`}
                          title="Remover partícipe"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSplit([...split, { credor: '', documento: '', creci: '', valor: '' }])
                    }
                    disabled={pending}
                    className={`mt-2 ${btnAddCls}`}
                  >
                    + Partícipe
                  </button>
                </section>

                {erro && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {erro}
                  </div>
                )}
                {salvo && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    ✓ Dados do negócio salvos. Gere (ou re-gere) o CCV para refletir.
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={fechar}
                    disabled={pending}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={salvar}
                    disabled={pending}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
                      pending ? 'cursor-not-allowed bg-slate-400' : 'bg-violet-600 hover:bg-violet-700'
                    }`}
                  >
                    {pending ? 'Salvando…' : 'Salvar dados do negócio'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
