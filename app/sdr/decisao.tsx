'use client';

// Painel de decisão de UM lead: tocar nos corretores na ordem da fila e
// Ofertar / Segurar / Descartar. Sem texto livre, sem chance de cair em outro lead.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ofertar, ofertarCaptacao, segurar, descartar, descartarCaptacao, referenciar, type Resultado } from './actions';

export type CorretorOpc = { phone: string; nome: string; apelido: string | null; foto_url: string | null };
export type ImovelRef = { ref: string; rotulo: string; parceiro: string | null };

type Props = {
  modo: 'lead' | 'captacao';
  id: string;
  corretores: CorretorOpc[];
  filaAtual: string[];
  podeOfertar: boolean;
  podeSegurar: boolean;
  podeDescartar: boolean;
  emCascata: boolean;
  imoveisRef?: ImovelRef[];
};

const nz = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function Decisao({ modo, id, corretores, filaAtual, podeOfertar, podeSegurar, podeDescartar, emCascata, imoveisRef = [] }: Props) {
  const router = useRouter();
  const [fila, setFila] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [pend, start] = useTransition();
  const [res, setRes] = useState<Resultado | null>(null);
  const [confirmaDescarte, setConfirmaDescarte] = useState(false);
  const [refEscolhida, setRefEscolhida] = useState(imoveisRef[0]?.ref ?? '');
  const [confirmaRef, setConfirmaRef] = useState(false);

  const porPhone = useMemo(() => new Map(corretores.map((c) => [c.phone, c])), [corretores]);
  const visiveis = useMemo(() => {
    const q = nz(busca.trim());
    return corretores.filter((c) => !q || nz(c.nome).includes(q) || nz(c.apelido ?? '').includes(q));
  }, [busca, corretores]);

  const alternar = (p: string) => setFila((f) => (f.includes(p) ? f.filter((x) => x !== p) : [...f, p]));
  const rotulo = (p: string) => { const c = porPhone.get(p); return c ? (c.apelido?.trim() || c.nome.split(' ')[0]) : p; };

  const rodar = (fn: () => Promise<Resultado>) => {
    setRes(null);
    start(async () => {
      const r = await fn();
      setRes(r);
      if (r.ok) {
        setFila([]);
        setConfirmaDescarte(false);
        setConfirmaRef(false);
        if (r.leadId) router.replace('/sdr/lead/' + r.leadId);
        else router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {res && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm ${res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
          {res.ok ? '✅ ' + (res.msg ?? 'Feito.') : res.erro}
        </p>
      )}

      {podeOfertar && (
        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {emCascata ? 'Adicionar corretores ao fim da fila' : 'Fila de corretores'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">Toque na ordem: o 1º recebe a oferta, 15 min sem resposta passa ao próximo.</p>

          <div className="mt-3 flex min-h-10 flex-wrap gap-2">
            {fila.length === 0 && <span className="text-sm text-slate-400">Ninguém escolhido ainda.</span>}
            {fila.map((p, i) => (
              <button key={p} type="button" onClick={() => alternar(p)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                <span className="tabular-nums">{i + 1}º</span> {rotulo(p)} <span aria-hidden>×</span>
              </button>
            ))}
          </div>

          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar corretor"
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />

          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visiveis.map((c) => {
              const pos = fila.indexOf(c.phone);
              const naFila = filaAtual.includes(c.phone);
              return (
                <li key={c.phone}>
                  <button type="button" onClick={() => alternar(c.phone)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm ${pos >= 0 ? 'border-slate-900 bg-slate-100' : 'border-slate-200'}`}>
                    {c.foto_url
                      ? <img src={c.foto_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">{c.nome.slice(0, 1)}</span>}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{c.apelido?.trim() || c.nome.split(' ')[0]}</span>
                      <span className="block truncate text-xs text-slate-500">{naFila ? 'já está na fila' : c.nome}</span>
                    </span>
                    {pos >= 0 && <span className="ml-auto text-xs font-semibold tabular-nums text-slate-900">{pos + 1}º</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          <button type="button" disabled={pend || fila.length === 0}
            onClick={() => rodar(() => (modo === 'captacao' ? ofertarCaptacao(id, fila) : ofertar(id, fila)))}
            className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Gravando…' : fila.length ? `Ofertar para ${fila.map(rotulo).join(' → ')}` : 'Ofertar'}
          </button>
        </section>
      )}

      {modo === 'lead' && podeDescartar && imoveisRef.length > 0 && (
        <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Referenciar ao corretor do imóvel</h2>
          <p className="mt-1 text-xs text-slate-500">Para cliente fora da nossa região: o corretor da outra unidade recebe o pedido de aceite (25% sobre a perna da indicação). Se aceitar, o lead é arquivado aqui como referenciado.</p>
          <div className="mt-3 space-y-2">
            {imoveisRef.map((i) => (
              <label key={i.ref} className="flex items-start gap-2 text-sm text-slate-800">
                <input type="radio" name="ref" className="mt-1" checked={refEscolhida === i.ref} onChange={() => { setRefEscolhida(i.ref); setConfirmaRef(false); }} />
                <span className="min-w-0 break-words">{i.rotulo}{i.parceiro ? ' — ' + i.parceiro : ''} <span className="text-slate-400">(ref. {i.ref})</span></span>
              </label>
            ))}
          </div>
          {!confirmaRef ? (
            <button type="button" disabled={pend || !refEscolhida} onClick={() => setConfirmaRef(true)}
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-40">
              Referenciar
            </button>
          ) : (
            <button type="button" disabled={pend} onClick={() => rodar(() => referenciar(id, refEscolhida))}
              className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
              {pend ? 'Enviando…' : 'Confirmar: enviar pedido de aceite'}
            </button>
          )}
        </section>
      )}

      {(podeSegurar || podeDescartar) && (
        <div className="grid grid-cols-2 gap-2">
          {podeSegurar && (
            <button type="button" disabled={pend} onClick={() => rodar(() => segurar(id))}
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-40">
              Segurar
            </button>
          )}
          {podeDescartar && !confirmaDescarte && (
            <button type="button" disabled={pend} onClick={() => setConfirmaDescarte(true)}
              className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40">
              Descartar
            </button>
          )}
          {podeDescartar && confirmaDescarte && (
            <button type="button" disabled={pend} onClick={() => rodar(() => (modo === 'captacao' ? descartarCaptacao(id) : descartar(id)))}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
              Confirmar descarte
            </button>
          )}
        </div>
      )}
    </div>
  );
}
