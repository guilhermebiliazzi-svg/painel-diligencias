'use client';

// Partes da ficha que precisam do navegador: região (lista ou nova),
// contatos do prédio (linhas que entram e saem) e o botão "Puxar do ITBI".
import { useState, useTransition } from 'react';
import { buscarItbi } from './actions';
import { FUNCOES, TURNOS, type Contato } from '@/lib/posicionamento';
import type { MercadoItbi } from '@/lib/posicionamento-itbi';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600';
const NOVA = '__nova__';

export function RegiaoCampo({ regioes, padrao }: { regioes: string[]; padrao: string }) {
  const [sel, setSel] = useState(regioes.length ? (regioes.includes(padrao) ? padrao : regioes[0]) : NOVA);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelCls}>Região <span className="text-rose-600">*</span></label>
        <select name="regiao" value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
          {regioes.map((r) => (<option key={r} value={r}>{r}</option>))}
          <option value={NOVA}>+ Nova região…</option>
        </select>
      </div>
      {sel === NOVA && (
        <div>
          <label className={labelCls}>Nome da nova região <span className="text-rose-600">*</span></label>
          <input name="regiao_nova" required placeholder="Ex.: Jardim Paulista — Al. Santos × R. Estados Unidos" className={inputCls} />
          <p className="mt-1 text-[11px] text-slate-400">Use um nome que você vá reconhecer. Os próximos prédios escolhem da lista.</p>
        </div>
      )}
    </div>
  );
}

const vazio = (): Contato => ({ nome: '', funcao: 'Zelador', turno: '', whatsapp: '', autorizou: false });

export function ContatosCampo({ iniciais }: { iniciais: Contato[] }) {
  const [lista, setLista] = useState<Contato[]>(iniciais.length ? iniciais : [vazio()]);
  const muda = (i: number, k: keyof Contato, v: string | boolean) =>
    setLista((l) => l.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return (
    <div className="space-y-3">
      <input type="hidden" name="contatos" value={JSON.stringify(lista.filter((c) => c.nome.trim() || c.whatsapp.trim()))} />
      {lista.map((c, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr_auto]">
          <div>
            <label className={labelCls}>Nome</label>
            <input value={c.nome} onChange={(e) => muda(i, 'nome', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Função</label>
            <select value={c.funcao} onChange={(e) => muda(i, 'funcao', e.target.value)} className={inputCls}>
              {FUNCOES.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Turno</label>
            <select value={c.turno} onChange={(e) => muda(i, 'turno', e.target.value)} className={inputCls}>
              {TURNOS.map((t) => (<option key={t} value={t}>{t || '—'}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>WhatsApp</label>
            <input value={c.whatsapp} onChange={(e) => muda(i, 'whatsapp', e.target.value)} inputMode="tel" className={inputCls} />
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
              <input type="checkbox" checked={c.autorizou} onChange={(e) => muda(i, 'autorizou', e.target.checked)} />
              autorizou e já mandei a mensagem
            </label>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} className="rounded-lg px-2 py-2 text-xs text-rose-600 hover:bg-rose-50">
              Remover
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setLista((l) => [...l, vazio()])} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
        + Adicionar contato
      </button>
      <p className="text-[11px] text-slate-400">Só anote o telefone de quem autorizou. Contatos de funcionários do prédio, nunca de moradores.</p>
    </div>
  );
}

const brl = (n: number | null) => (n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR'));
const mesAno = (iso: string | null) => (iso ? iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');

export function ItbiBotao() {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [rodando, start] = useTransition();

  function puxar(ev: React.MouseEvent<HTMLButtonElement>) {
    const form = ev.currentTarget.form;
    if (!form) return;
    const campo = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null;
    const endereco = (campo('endereco')?.value ?? '').trim();
    if (!endereco) {
      setMsg({ ok: false, texto: 'Preencha primeiro o endereço (rua e número) em Dados do condomínio.' });
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await buscarItbi(endereco);
      if ('erro' in r) {
        setMsg({ ok: false, texto: r.erro });
        return;
      }
      const m = r as MercadoItbi;
      const br = (v: number | null) => (v == null ? '' : String(v));
      // mercado: sempre do ITBI; dados do prédio: só se estiverem vazios
      const sempre: [string, string][] = [
        ['vendas_12m', br(m.vendas12m)], ['valor_m2_min', br(m.m2Min)], ['valor_m2_max', br(m.m2Max)],
      ];
      const seVazio: [string, string][] = [
        ['metragem_min', br(m.metragemMin)], ['metragem_max', br(m.metragemMax)], ['ano_entrega', br(m.ano)],
        ['padrao', m.padrao ?? ''], ['bairro', m.bairro ?? ''], ['cep', m.cep ?? ''],
      ];
      for (const [n, v] of sempre) { const c = campo(n); if (c && v) c.value = v; }
      for (const [n, v] of seVazio) { const c = campo(n); if (c && v && !c.value) c.value = v; }
      setMsg({
        ok: true,
        texto:
          `${m.logradouro}, ${m.numero} · ITBI até ${mesAno(m.baseAte)}: ${m.vendas12m} venda${m.vendas12m === 1 ? '' : 's'} em 12 meses, ` +
          `${m.vendas24m} em 24 meses (${m.totalVendas} no total). ` +
          (m.m2Mediana ? `m² de ${brl(m.m2Min)} a ${brl(m.m2Max)}, mediana ${brl(m.m2Mediana)}. ` : 'Sem vendas em 24 meses para calcular o m². ') +
          (m.padraoIptu ? `IPTU: ${m.padraoIptu}. ` : '') +
          'Metragens do ITBI são área construída total (IPTU). Confira e salve.',
      });
    });
  }

  return (
    <div className="sm:col-span-2">
      <button type="button" onClick={puxar} disabled={rodando} className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 disabled:opacity-60">
        {rodando ? 'Consultando o ITBI…' : 'Puxar do ITBI'}
      </button>
      {msg && <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{msg.texto}</p>}
    </div>
  );
}
