'use client';

// 05/11: ações de um candidato no funil de recrutamento.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mudarEtapaCandidato, encaminharCandidato, chamarCandidato, type ResultadoRec } from './recrutamento-actions';
import { MOTIVOS_DESCARTE, type EtapaRec } from '@/lib/recrutamento';

type Painel = '' | 'encaminhar' | 'entrevista' | 'descartar' | 'mensagem';
const btn = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const btnOn = 'rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white';
const campo = 'min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default function AcoesCandidato({ tel, etapa, fora, corretores }: { tel: string; etapa: EtapaRec; fora: boolean; corretores: { id: number; nome: string }[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Painel>('');
  const [res, setRes] = useState<ResultadoRec | null>(null);
  const [pend, start] = useTransition();
  const [cor, setCor] = useState('');
  const [quando, setQuando] = useState('');
  const [motivo, setMotivo] = useState(fora ? 'Fora de SP' : '');
  const [texto, setTexto] = useState('');

  const rodar = (f: () => Promise<ResultadoRec>) => {
    setRes(null);
    start(async () => { const r = await f(); setRes(r); if (r.ok) { setAberto(''); router.refresh(); } });
  };
  const alternar = (p: Painel) => { setRes(null); setAberto(aberto === p ? '' : p); };

  const encerrado = etapa === 'entrou' || etapa === 'descartado';
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {!encerrado && <button type="button" className={aberto === 'encaminhar' ? btnOn : btn} onClick={() => alternar('encaminhar')}>Encaminhar</button>}
        {!encerrado && <button type="button" className={aberto === 'entrevista' ? btnOn : btn} onClick={() => alternar('entrevista')}>{etapa === 'entrevista' ? 'Remarcar entrevista' : 'Marcar entrevista'}</button>}
        {(etapa === 'contato' || etapa === 'entrevista') && (
          <button type="button" disabled={pend} className={btn} onClick={() => rodar(() => mudarEtapaCandidato(tel, 'entrou'))}>Entrou</button>
        )}
        <button type="button" className={aberto === 'mensagem' ? btnOn : btn} onClick={() => alternar('mensagem')}>Mensagem pela Eva</button>
        {!encerrado && <button type="button" className={aberto === 'descartar' ? btnOn : btn} onClick={() => alternar('descartar')}>Descartar</button>}
        {(encerrado || etapa !== 'decidir') && (
          <button type="button" disabled={pend} className={btn} onClick={() => rodar(() => mudarEtapaCandidato(tel, 'decidir'))}>Voltar para decidir</button>
        )}
      </div>

      {aberto === 'encaminhar' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={cor} onChange={(e) => setCor(e.target.value)} className={campo}>
            <option value="">Para quem?</option>
            <option value="eu">Eu mesmo (sem mensagem)</option>
            {corretores.map((c) => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
          </select>
          <button type="button" disabled={pend || !cor} className={btnOn}
            onClick={() => rodar(() => encaminharCandidato(tel, cor === 'eu' ? null : Number(cor)))}>
            {pend ? 'Enviando…' : cor && cor !== 'eu' ? 'Encaminhar e avisar no WhatsApp' : 'Confirmar'}
          </button>
        </div>
      )}

      {aberto === 'entrevista' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={campo} />
          <button type="button" disabled={pend || !quando} className={btnOn}
            onClick={() => rodar(() => mudarEtapaCandidato(tel, 'entrevista', { entrevista_em: quando }))}>{pend ? 'Gravando…' : 'Gravar'}</button>
        </div>
      )}

      {aberto === 'descartar' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}>
            <option value="">Motivo</option>
            {MOTIVOS_DESCARTE.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" disabled={pend || !motivo} className={btnOn}
            onClick={() => rodar(() => mudarEtapaCandidato(tel, 'descartado', { motivo }))}>{pend ? 'Gravando…' : 'Descartar'}</button>
        </div>
      )}

      {aberto === 'mensagem' && (
        <div className="mt-2 space-y-2">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={900}
            placeholder="A Eva envia exatamente este texto para o candidato"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          <button type="button" disabled={pend || !texto.trim()} className={btnOn}
            onClick={() => rodar(() => chamarCandidato(tel, texto))}>{pend ? 'Enviando…' : 'Enviar pela Eva'}</button>
        </div>
      )}

      {res && <p className={`mt-1 text-xs ${res.ok ? 'text-emerald-700' : 'text-red-700'}`}>{res.ok ? res.msg : res.erro}</p>}
    </div>
  );
}
