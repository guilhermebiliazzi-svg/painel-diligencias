'use client';

// 25/11/2026: formulário do agendamento do planejamento 2027 (identifica pelo WhatsApp e escolhe o grupo).
import { useState, useTransition } from 'react';
import { agendar, identificar } from './actions';

type G = { n: number; rotulo: string; aberto: boolean };

export default function Agendar({ grupos }: { grupos: G[] }) {
  const [whats, setWhats] = useState('');
  const [nome, setNome] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [atual, setAtual] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [pend, start] = useTransition();

  const buscar = () => start(async () => {
    setErro(''); setOk('');
    const r = await identificar(whats);
    if (!r.ok) { setErro(r.erro); setNome(null); return; }
    setNome(r.nome); setAtual(r.grupo); setEscolhido(r.grupo);
  });

  const salvar = () => start(async () => {
    if (!escolhido) return;
    setErro(''); setOk('');
    const r = await agendar(whats, escolhido);
    if (!r.ok) { setErro(r.erro); return; }
    setAtual(escolhido); setOk(r.msg);
  });

  if (!nome) {
    return (
      <div className="mt-5 grid gap-2">
        <label htmlFor="whats" className="text-sm font-medium text-slate-700">Seu WhatsApp (com DDD)</label>
        <input id="whats" inputMode="tel" autoComplete="tel" value={whats} onChange={(e) => setWhats(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
          placeholder="(11) 98765-4321" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base" />
        <button type="button" disabled={pend || whats.replace(/\D/g, '').length < 10} onClick={buscar}
          className="rounded-xl bg-[#003DA5] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {pend ? 'Procurando…' : 'Continuar'}
        </button>
        {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-3">
      <p className="text-sm text-slate-700">
        Olá, <strong>{nome}</strong>! {atual ? <>Você está no <strong>Grupo {atual}</strong>. Se quiser, troque abaixo.</> : 'Escolha o seu horário:'}
      </p>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Grupos</legend>
        {grupos.map((g) => (
          <label key={g.n}
            className={'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ' +
              (!g.aberto ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : escolhido === g.n ? 'border-[#003DA5] bg-blue-50 text-slate-900' : 'border-slate-300 text-slate-800')}>
            <input type="radio" name="grupo" className="mt-0.5" disabled={!g.aberto || pend} checked={escolhido === g.n} onChange={() => setEscolhido(g.n)} />
            <span><strong>Grupo {g.n}</strong><br />{g.rotulo}{!g.aberto && ' (já passou)'}</span>
          </label>
        ))}
      </fieldset>
      <button type="button" disabled={pend || !escolhido || escolhido === atual} onClick={salvar}
        className="rounded-xl bg-[#003DA5] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {pend ? 'Gravando…' : atual ? 'Trocar de grupo' : 'Confirmar horário'}
      </button>
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">{ok}</p>}
      {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
    </div>
  );
}
