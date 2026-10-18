'use client';

// Caixa de envio de mensagem pelo Max (número 5192-8192). Serve para um novato
// (página do novato) ou para vários (página "Enviar mensagem").
import { useState, useTransition } from 'react';
import { enviarMensagem, type ResultadoEnvio } from './actions';

export type Destinatario = { id: string; nome: string; status: string; janela: boolean };

const LIMITE = 1000;

export default function EnviarMensagem({ destinatarios, multiplo = false }: { destinatarios: Destinatario[]; multiplo?: boolean }) {
  const [texto, setTexto] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(multiplo ? [] : destinatarios.map((d) => d.id)));
  const [res, setRes] = useState<ResultadoEnvio | null>(null);
  const [pending, start] = useTransition();

  const escolhidos = destinatarios.filter((d) => marcados.has(d.id));
  const foraJanela = escolhidos.filter((d) => !d.janela).length;
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarStatus = (filtro: (d: Destinatario) => boolean) => setMarcados(new Set(destinatarios.filter(filtro).map((d) => d.id)));

  function enviar() {
    if (!texto.trim() || !escolhidos.length) return;
    const quem = escolhidos.length === 1 ? escolhidos[0].nome : `${escolhidos.length} corretores`;
    if (!window.confirm(`Enviar pelo Max para ${quem}?`)) return;
    setRes(null);
    start(async () => {
      const r = await enviarMensagem(escolhidos.map((d) => d.id), texto);
      setRes(r);
      if (r.enviados.length && !r.falhas.length) setTexto('');
    });
  }

  return (
    <div className="space-y-3">
      {multiplo && (
        <div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" onClick={() => marcarStatus(() => true)} className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50">Todos</button>
            <button type="button" onClick={() => marcarStatus((d) => d.status === 'ativo')} className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50">Em treinamento</button>
            <button type="button" onClick={() => marcarStatus((d) => d.status !== 'ativo')} className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-700 hover:bg-slate-50">Já passaram</button>
            <button type="button" onClick={() => setMarcados(new Set())} className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-500 hover:bg-slate-50">Limpar</button>
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {destinatarios.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={marcados.has(d.id)} onChange={() => alternar(d.id)} />
                  <span className="flex-1 truncate text-slate-800">{d.nome}</span>
                  <span className="text-[11px] text-slate-400">{d.status}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, LIMITE))}
        rows={4}
        placeholder="Escreva a mensagem que o Max vai mandar…"
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none focus:border-slate-400"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {escolhidos.length === 0
            ? 'Escolha quem recebe.'
            : foraJanela === 0
              ? 'Vai como mensagem normal (conversa aberta nas últimas 24h).'
              : `${foraJanela === escolhidos.length ? 'Vai' : `${foraJanela} de ${escolhidos.length} vão`} pelo modelo aprovado onb_aviso, porque não houve conversa nas últimas 24h. As quebras de linha viram " | ".`}
          <span className="ml-1 text-slate-400">{texto.length}/{LIMITE}</span>
        </p>
        <button
          type="button"
          onClick={enviar}
          disabled={pending || !texto.trim() || !escolhidos.length}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? 'Enviando…' : 'Enviar pelo Max'}
        </button>
      </div>

      {res && (
        <div className={`rounded-xl border p-3 text-sm ${res.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {res.enviados.length > 0 && <p>Enviada para: {res.enviados.join(', ')}.</p>}
          {res.falhas.map((f, i) => <p key={i}>{f.nome === '—' ? f.erro : `Não foi para ${f.nome}: ${f.erro}`}</p>)}
        </div>
      )}
    </div>
  );
}
