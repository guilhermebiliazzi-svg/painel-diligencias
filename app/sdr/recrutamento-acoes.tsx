'use client';

// 05/11: ações de um candidato no funil de recrutamento.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mudarEtapaCandidato, encaminharCandidato, chamarCandidato, agendarEntrevista, type ResultadoRec } from './recrutamento-actions';
import { MOTIVOS_DESCARTE, type EtapaRec } from '@/lib/recrutamento';

type Painel = '' | 'encaminhar' | 'entrevista' | 'entrevista2' | 'pensando' | 'descartar' | 'mensagem';
// 18/11: dados das entrevistas já marcadas (para remarcar com o que já estava preenchido)
export type EntInfo = { em1: string | null; f1: string | null; em2: string | null; f2: string | null; email: string | null };
const localSp = (iso: string | null) => iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(' ', 'T') : '';
const btn = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const btnOn = 'rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white';
const campo = 'min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm';

export default function AcoesCandidato({ tel, etapa, fora, corretores, ent }: { tel: string; etapa: EtapaRec; fora: boolean; corretores: { id: number; nome: string }[]; ent?: EntInfo }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Painel>('');
  const [res, setRes] = useState<ResultadoRec | null>(null);
  const [pend, start] = useTransition();
  const [cor, setCor] = useState('');
  const [quando, setQuando] = useState('');
  const [retomar, setRetomar] = useState('');
  const [motivo, setMotivo] = useState(fora ? 'Fora de SP' : '');
  const [texto, setTexto] = useState('');
  const [formato, setFormato] = useState('');
  const [email, setEmail] = useState(ent?.email ?? '');

  const rodar = (f: () => Promise<ResultadoRec>) => {
    setRes(null);
    start(async () => { const r = await f(); setRes(r); if (r.ok) { setAberto(''); router.refresh(); } });
  };
  const alternar = (p: Painel) => {
    setRes(null);
    if (p === 'entrevista' || p === 'entrevista2') {
      const dois = p === 'entrevista2';
      setQuando(localSp(dois ? ent?.em2 ?? null : ent?.em1 ?? null));
      setFormato((dois ? ent?.f2 : ent?.f1) ?? '');
      setEmail(ent?.email ?? '');
    }
    setAberto(aberto === p ? '' : p);
  };

  const encerrado = etapa === 'entrou' || etapa === 'descartado';
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {!encerrado && <button type="button" className={aberto === 'encaminhar' ? btnOn : btn} onClick={() => alternar('encaminhar')}>Encaminhar</button>}
        {!encerrado && <button type="button" className={aberto === 'entrevista' ? btnOn : btn} onClick={() => alternar('entrevista')}>{ent?.em1 ? 'Remarcar entrevista' : 'Marcar entrevista'}</button>}
        {!encerrado && ent?.em1 && <button type="button" className={aberto === 'entrevista2' ? btnOn : btn} onClick={() => alternar('entrevista2')}>{ent?.em2 ? 'Remarcar 2ª entrevista' : 'Marcar 2ª entrevista'}</button>}
        {(etapa === 'contato' || etapa === 'entrevista' || etapa === 'pensando') && (
          <button type="button" className={aberto === 'pensando' ? btnOn : btn} onClick={() => alternar('pensando')}>{etapa === 'pensando' ? 'Mudar data de retomar' : 'Ficou de pensar'}</button>
        )}
        {(etapa === 'contato' || etapa === 'entrevista' || etapa === 'pensando') && (
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

      {(aberto === 'entrevista' || aberto === 'entrevista2') && (
        <div className="mt-2 space-y-2">
          {aberto === 'entrevista2' && <p className="text-xs font-semibold text-slate-700">2ª entrevista</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} className={campo} />
            <button type="button" className={formato === 'presencial' ? btnOn : btn} onClick={() => setFormato('presencial')}>Presencial</button>
            <button type="button" className={formato === 'meet' ? btnOn : btn} onClick={() => setFormato('meet')}>Google Meet</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail do candidato (para o convite)" className={campo + ' w-72 max-w-full'} />
            <button type="button" disabled={pend || !quando || !formato} className={btnOn}
              onClick={() => rodar(() => agendarEntrevista(tel, aberto === 'entrevista2' ? 2 : 1, quando, formato, email))}>{pend ? 'Gravando…' : 'Gravar e pôr na agenda'}</button>
          </div>
          <p className="text-xs text-slate-500">Vai para a sua agenda (1 hora). Com e-mail, o Google manda o convite ao candidato{formato === 'meet' ? ', com o link do Meet' : ''}.</p>
        </div>
      )}

      {aberto === 'pensando' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600">Retomar em</span>
          <input type="date" value={retomar} onChange={(e) => setRetomar(e.target.value)} className={campo} />
          <button type="button" disabled={pend || !retomar} className={btnOn}
            onClick={() => rodar(() => mudarEtapaCandidato(tel, 'pensando', { retomar_em: retomar }))}>{pend ? 'Gravando…' : 'Gravar'}</button>
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
