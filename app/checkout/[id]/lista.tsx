'use client';

// Lista do check-out: caixa de marcar nas tarefas de check-out; nas demais, como entregar ao Max.
import { useState, useTransition } from 'react';
import { marcarCheckout } from '../actions';

export type ItemCheckout = {
  id: number; titulo: string; dia: number; hora: string; checkout: boolean; comprovacao: string | null;
  quiz: boolean; link: string | null; status: string; marcadaAqui: boolean;
};
type Grupo = { titulo: string; itens: ItemCheckout[] };

const FEITO = ['aprovada', 'dispensada', 'entregue'];

function Linha({ novatoId, it }: { novatoId: string; it: ItemCheckout }) {
  const [status, setStatus] = useState(it.status);
  const [aqui, setAqui] = useState(it.marcadaAqui);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const feito = FEITO.includes(status);
  const travada = feito && !aqui; // avaliada pelo Max: não desmarca aqui

  function alternar() {
    if (!it.checkout || travada || pending) return;
    setErro(null);
    start(async () => {
      const r = await marcarCheckout(novatoId, it.id, !feito);
      if (!r.ok) { setErro(r.erro ?? 'Não consegui marcar. Tente de novo.'); return; }
      setStatus(r.status ?? status);
      setAqui(!feito);
    });
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {it.checkout ? (
        <button
          type="button"
          onClick={alternar}
          disabled={pending || travada}
          aria-pressed={feito}
          aria-label={feito ? `Desmarcar ${it.titulo}` : `Marcar ${it.titulo} como concluída`}
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold transition ${
            feito ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent'
          } ${pending ? 'opacity-50' : ''}`}
        >
          ✓
        </button>
      ) : (
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs ${feito ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
          {feito ? '✓' : '•'}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${feito ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>
          {it.hora && <span className="mr-1.5 tabular-nums text-xs text-slate-400">{it.hora}</span>}
          {it.titulo}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {it.checkout
            ? status === 'entregue' && it.quiz
              ? 'Marcado. Agora peça o quiz ao Max no WhatsApp.'
              : feito ? (aqui ? 'Marcado por você.' : 'Concluída.') : it.quiz ? 'Marque quando terminar; depois o Max manda o quiz.' : 'Marque quando terminar.'
            : feito ? 'Concluída com o Max.' : `No WhatsApp com o Max${it.comprovacao ? `: ${it.comprovacao}` : ''}.`}
          {it.link && <> · <a href={it.link} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">abrir</a></>}
        </p>
        {erro && <p className="mt-1 text-xs text-rose-700">{erro}</p>}
      </div>
    </li>
  );
}

export default function Lista({ novatoId, grupos }: { novatoId: string; grupos: Grupo[] }) {
  const comItens = grupos.filter((g) => g.itens.length);
  if (!comItens.length) {
    return <p className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Nenhuma tarefa para hoje. Bom descanso!</p>;
  }
  return (
    <div className="mt-5 space-y-5">
      {comItens.map((g) => (
        <section key={g.titulo}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.titulo}</h2>
          <ul style={{ backgroundColor: '#ffffff' }} className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 shadow-sm">
            {g.itens.map((it) => <Linha key={it.id} novatoId={novatoId} it={it} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
