'use client';

// Aba "Nova cobrança": escolhe a venda (ou Avulsa), pré-preenche pela ficha
// "Dados do negócio" e emite no Asaas pelo n8n.
import { useState, useTransition } from 'react';
import { dadosDaVenda, emitirCobranca, type DadosVenda, type RespostaEmissao } from './actions';

export type VendaOpcao = { id: string; rotulo: string; cobrancas: number; temComissao: boolean };
export type Beneficiario = { walletId: string; nome: string };

const TARIFA = 1.99;
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-50';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';
const secCls = 'mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-slate-500 first:mt-0';

function num(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const n = Number(/,\d{1,2}$/.test(t) || /\.\d{3}(,|$)/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emTexto = (n: number | null | undefined) => (n ? fmt(n) : '');

function maisDias(d: number) {
  const x = new Date(Date.now() + d * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(x);
}

type Linha = { walletId: string; valor: string };

export default function NovaCobranca({ vendas, beneficiarios }: { vendas: VendaOpcao[]; beneficiarios: Beneficiario[] }) {
  const [venda, setVenda] = useState('');
  const [info, setInfo] = useState<DadosVenda | null>(null);
  const [carregando, startCarga] = useTransition();
  const [emitindo, startEmissao] = useTransition();
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');
  const [email, setEmail] = useState('');
  const [fone, setFone] = useState('');
  const [valor, setValor] = useState('');
  const [venc, setVenc] = useState(maisDias(7));
  const [forma, setForma] = useState<'BOLETO' | 'PIX'>('BOLETO');
  const [desc, setDesc] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([{ walletId: '', valor: '' }]);
  const [res, setRes] = useState<RespostaEmissao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ocupado = carregando || emitindo;
  const valorNum = num(valor);
  const soma = linhas.reduce((a, l) => a + (l.walletId ? num(l.valor) : 0), 0);
  const ville = Math.round((valorNum - soma - TARIFA) * 100) / 100;
  const vendaSel = vendas.find((v) => v.id === venda);

  function limpar() {
    setNome('');
    setDoc('');
    setEmail('');
    setFone('');
    setValor('');
    setDesc('');
    setLinhas([{ walletId: '', valor: '' }]);
    setInfo(null);
  }

  function escolherVenda(id: string) {
    setVenda(id);
    setRes(null);
    setErro(null);
    if (!id) {
      limpar();
      return;
    }
    startCarga(async () => {
      const d = await dadosDaVenda(id);
      setInfo(d);
      if (!d.ok) {
        setErro(d.erro || 'Não consegui ler a venda.');
        return;
      }
      setNome(d.pagador?.nome || '');
      setDoc(d.pagador?.doc || '');
      setFone(d.pagador?.fone || '');
      setEmail('');
      setValor(emTexto(d.valor));
      setDesc(d.descricao);
      setLinhas(d.splits.length ? d.splits.map((s) => ({ walletId: s.walletId, valor: fmt(s.valor) })) : [{ walletId: '', valor: '' }]);
    });
  }

  function emitir() {
    setErro(null);
    setRes(null);
    const faltando: string[] = [];
    if (!nome.trim()) faltando.push('nome do pagador');
    const d = doc.replace(/\D/g, '');
    if (d.length !== 11 && d.length !== 14) faltando.push('CPF/CNPJ do pagador');
    if (valorNum <= 0) faltando.push('valor');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) faltando.push('vencimento');
    if (!desc.trim()) faltando.push('descrição');
    if (faltando.length) {
      setErro('Falta: ' + faltando.join(', ') + '.');
      return;
    }
    if (ville < 0) {
      setErro('A soma dos splits passa do valor da cobrança menos a tarifa do Asaas.');
      return;
    }
    if (info?.ok && info.cobrancas > 0 && !window.confirm(`Esta venda já tem ${info.cobrancas} cobrança(s) ativa(s). Emitir outra mesmo assim?`)) return;
    startEmissao(async () => {
      const r = await emitirCobranca({
        diligencia_id: venda || null,
        pagador_nome: nome.trim(),
        pagador_doc: d,
        pagador_email: email.trim(),
        pagador_fone: fone.replace(/\D/g, ''),
        valor: valorNum,
        vencimento: venc,
        descricao: desc.trim(),
        billing_type: forma,
        splits: linhas
          .filter((l) => l.walletId && num(l.valor) > 0)
          .map((l) => ({
            walletId: l.walletId,
            fixedValue: num(l.valor),
            nome: beneficiarios.find((b) => b.walletId === l.walletId)?.nome || '',
          })),
      });
      setRes(r);
      if (!r.ok) setErro((r.mensagem || 'O Asaas recusou a cobrança.') + (r.detalhes ? ' — ' + r.detalhes : ''));
    });
  }

  if (res?.ok) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-base font-semibold text-emerald-800">Cobrança emitida.</p>
        <p className="mt-1 text-sm text-emerald-900">
          {vendaSel ? vendaSel.rotulo : 'Avulsa (sem venda)'} · R$ {fmt(valorNum)} · vence {venc.split('-').reverse().join('/')}
        </p>
        {res.aviso && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{res.aviso}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {res.link && (
            <a href={res.link} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
              Abrir boleto
            </a>
          )}
          <a href={'/cobranca-split?aba=hist&per=tudo' + (res.cobranca_id ? '&q=' + encodeURIComponent(res.cobranca_id) : '')} className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800">
            Ver no histórico
          </a>
          <button
            type="button"
            onClick={() => {
              setRes(null);
              setVenda('');
              limpar();
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Emitir outra
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={secCls}>Venda</div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <label className={labelCls}>A qual venda esta cobrança pertence?</label>
        <select value={venda} onChange={(e) => escolherVenda(e.target.value)} disabled={ocupado} className={inputCls}>
          <option value="">Avulsa (sem venda)</option>
          {vendas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
              {v.cobrancas ? ` · ${v.cobrancas} cobrança(s)` : ''}
              {v.temComissao ? '' : ' · sem comissão na ficha'}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-blue-800">
          {carregando
            ? 'Lendo a ficha da venda…'
            : 'Ao escolher uma venda, o pagador, o valor da comissão e o split vêm preenchidos da ficha “Dados do negócio”. Dá para ajustar antes de emitir.'}
        </p>
        {info?.ok && info.avisos.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-amber-800">
            {info.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
        {info?.ok && info.fora.length > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            Recebem por fora (não entram nesta cobrança): {info.fora.map((f) => `${f.nome} R$ ${fmt(f.valor)}`).join('; ')}.
          </p>
        )}
        {info?.ok && info.cobrancas > 0 && (
          <p className="mt-2 text-xs font-semibold text-rose-700">Atenção: esta venda já tem {info.cobrancas} cobrança(s) ativa(s) — confira o histórico antes de emitir outra.</p>
        )}
      </div>

      <div className={secCls}>Pagador</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Nome / Razão social *</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={ocupado} className={inputCls} placeholder="Nome de quem vai pagar" />
        </div>
        <div>
          <label className={labelCls}>CPF / CNPJ *</label>
          <input value={doc} onChange={(e) => setDoc(e.target.value)} disabled={ocupado} className={inputCls} placeholder="Somente números" inputMode="numeric" />
        </div>
        <div>
          <label className={labelCls}>E-mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={ocupado} className={inputCls} placeholder="opcional" type="email" />
        </div>
        <div>
          <label className={labelCls}>Celular</label>
          <input value={fone} onChange={(e) => setFone(e.target.value)} disabled={ocupado} className={inputCls} placeholder="11988887777" inputMode="tel" />
        </div>
      </div>

      <div className={secCls}>Cobrança</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Valor total (R$) *</label>
          <input value={valor} onChange={(e) => setValor(e.target.value)} disabled={ocupado} className={inputCls} placeholder="1.000,00" inputMode="decimal" />
        </div>
        <div>
          <label className={labelCls}>Vencimento *</label>
          <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} disabled={ocupado} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Forma</label>
          <select value={forma} onChange={(e) => setForma(e.target.value as 'BOLETO' | 'PIX')} disabled={ocupado} className={inputCls}>
            <option value="BOLETO">Boleto (pagável por Pix no QR)</option>
            <option value="PIX">Só Pix</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label className={labelCls}>Descrição *</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} disabled={ocupado} className={inputCls} placeholder="Ex: Comissão de corretagem — Rua X, 100" />
      </div>

      <div className={secCls}>Split — quem recebe parte do valor</div>
      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_auto] items-end gap-2">
            <div>
              {i === 0 && <label className={labelCls}>Beneficiário (tem subconta)</label>}
              <select
                value={l.walletId}
                onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, walletId: e.target.value } : x)))}
                disabled={ocupado}
                className={inputCls}
              >
                <option value="">Selecione…</option>
                {beneficiarios.map((b) => (
                  <option key={b.walletId} value={b.walletId}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {i === 0 && <label className={labelCls}>Valor (R$)</label>}
              <input
                value={l.valor}
                onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                disabled={ocupado}
                className={inputCls}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <button
              type="button"
              onClick={() => setLinhas(linhas.length > 1 ? linhas.filter((_, j) => j !== i) : [{ walletId: '', valor: '' }])}
              disabled={ocupado}
              className="h-[38px] rounded-lg border border-slate-300 px-3 text-sm text-slate-500 hover:bg-slate-50"
              title="Remover"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLinhas([...linhas, { walletId: '', valor: '' }])}
          disabled={ocupado}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          + adicionar beneficiário
        </button>
      </div>

      <div className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span>Soma dos splits</span>
          <span>R$ {fmt(soma)}</span>
        </div>
        <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span>Tarifa Asaas</span>
          <span>– R$ {fmt(TARIFA)}</span>
        </div>
        <div className={`flex justify-between rounded-lg px-3 py-2 font-semibold ${ville < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50'}`}>
          <span>Fica com a Ville</span>
          <span>R$ {fmt(ville)}</span>
        </div>
      </div>

      {erro && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

      <button
        type="button"
        onClick={emitir}
        disabled={ocupado}
        className="mt-4 w-full rounded-lg bg-red-600 py-3 text-base font-bold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {emitindo ? 'Emitindo no Asaas…' : 'Emitir cobrança'}
      </button>
    </section>
  );
}
