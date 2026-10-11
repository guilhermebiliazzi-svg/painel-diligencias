'use client';

// Filtros do histórico. Tudo vai para a URL (o servidor filtra no banco), então
// dá para recarregar, voltar e mandar o link de um filtro para alguém.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type FiltrosValor = { per: string; de: string; ate: string; st: string; tipo: string; ben: string; q: string; ord: string };

const sel = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const lab = 'mb-1 block text-xs font-medium text-slate-600';

export default function Filtros({ valor, beneficiarios }: { valor: FiltrosValor; beneficiarios: { walletId: string; nome: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState(valor);

  function ir(novo: FiltrosValor) {
    const p = new URLSearchParams({ aba: 'hist' });
    if (novo.per) p.set('per', novo.per);
    if (novo.per === 'datas') {
      if (novo.de) p.set('de', novo.de);
      if (novo.ate) p.set('ate', novo.ate);
    }
    for (const k of ['st', 'tipo', 'ben', 'q', 'ord'] as const) if (novo[k]) p.set(k, novo[k]);
    router.push('/cobranca-split?' + p.toString());
  }
  function muda(k: keyof FiltrosValor, v: string, aplicar = true) {
    const novo = { ...f, [k]: v };
    setF(novo);
    if (aplicar) ir(novo);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        ir(f);
      }}
      className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <label className={lab}>Vencimento</label>
        <select value={f.per} onChange={(e) => muda('per', e.target.value, e.target.value !== 'datas')} className={sel}>
          <option value="mes">Este mês</option>
          <option value="prox30">Próximos 30 dias</option>
          <option value="mespassado">Mês passado</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="ano">Este ano</option>
          <option value="datas">Escolher datas…</option>
          <option value="tudo">Tudo</option>
        </select>
      </div>
      {f.per === 'datas' && (
        <div className="sm:col-span-2 lg:col-span-1">
          <label className={lab}>Vencimento de — até</label>
          <div className="flex gap-1.5">
            <input type="date" value={f.de} onChange={(e) => muda('de', e.target.value, false)} className={sel} />
            <input type="date" value={f.ate} onChange={(e) => muda('ate', e.target.value, false)} className={sel} />
            <button type="submit" className="rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white">
              OK
            </button>
          </div>
        </div>
      )}
      <div>
        <label className={lab}>Status</label>
        <select value={f.st} onChange={(e) => muda('st', e.target.value)} className={sel}>
          <option value="">Todos</option>
          <option value="rec">Recebida</option>
          <option value="pen">Pendente</option>
          <option value="ven">Vencida</option>
          <option value="can">Cancelada</option>
        </select>
      </div>
      <div>
        <label className={lab}>Tipo</label>
        <select value={f.tipo} onChange={(e) => muda('tipo', e.target.value)} className={sel}>
          <option value="">Vendas e avulsas</option>
          <option value="venda">Só vendas</option>
          <option value="avulsa">Só avulsas</option>
        </select>
      </div>
      <div>
        <label className={lab}>Beneficiário (no split)</label>
        <select value={f.ben} onChange={(e) => muda('ben', e.target.value)} className={sel}>
          <option value="">Todos</option>
          {beneficiarios.map((b) => (
            <option key={b.walletId} value={b.walletId}>
              {b.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className={lab}>Buscar</label>
        <div className="flex gap-1.5">
          <input
            value={f.q}
            onChange={(e) => muda('q', e.target.value, false)}
            placeholder="Endereço, pagador, CPF/CNPJ ou código do Asaas"
            className={sel}
          />
          <button type="submit" className="rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white">
            Buscar
          </button>
        </div>
      </div>
    </form>
  );
}
