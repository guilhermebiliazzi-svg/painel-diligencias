'use client';

// 15/11: botão "Atualizar" de cada lead no Meu funil: registrar ou remarcar visita, visita feita,
// novo contato numa data e arquivar com motivo. Mesmo efeito dos botões da Eva no WhatsApp.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { arquivarLead, novoContato, visitaFeita, type ResAcao } from './acoes-corretor';

const MOTIVOS: [string, string][] = [
  ['comprou_outro', 'Comprou/alugou outro'],
  ['desistiu', 'Cliente desistiu'],
  ['sem_contato', 'Não consegui contato'],
  ['fora_perfil', 'Fora do perfil'],
  ['indisponivel', 'Imóvel indisponível'],
  ['outro', 'Outro motivo'],
];
const HORAS = Array.from({ length: 12 }, (_, i) => i + 9);
type Tela = 'menu' | 'feita' | 'contato' | 'arquivar';

const btn = 'w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold';
const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500';

export default function AtualizarLead({ id, nome, visita, hoje, preAgenda }: {
  id: string; nome: string; hoje: string;
  /** 18/11: data pré-agendada pelo cliente no site (ainda sem confirmação do corretor) */
  preAgenda?: string | null;
  /** visita confirmada ainda sem resultado: quando (texto) e se já passou */
  visita: { quando: string; passou: boolean } | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<Tela>('menu');
  const [res, setRes] = useState<ResAcao | null>(null);
  const [pend, start] = useTransition();
  const [resultado, setResultado] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('10');
  const [nota, setNota] = useState('');
  const [motivo, setMotivo] = useState('');
  const primeiro = (nome || 'cliente').split(' ')[0];

  const fechar = () => { setAberto(false); setTela('menu'); setRes(null); setResultado(''); setData(''); setNota(''); setMotivo(''); };
  const rodar = (f: () => Promise<ResAcao>) => { setRes(null); start(async () => { const r = await f(); setRes(r); if (r.ok) router.refresh(); }); };

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="mt-1 inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-slate-700">
        Atualizar
      </button>
    );
  }

  const voltar = (
    <button type="button" disabled={pend} onClick={() => { setTela('menu'); setRes(null); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">← voltar</button>
  );

  return (
    <div className="mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Atualizar {primeiro}</p>
        <button type="button" onClick={fechar} aria-label="Fechar" className="text-slate-400 hover:text-slate-700">✕</button>
      </div>

      {res?.ok ? (
        <>
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p>
          <button type="button" onClick={fechar} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Fechar</button>
        </>
      ) : tela === 'menu' ? (
        <div className="mt-2 space-y-2">
          {visita && !visita.passou ? (
            <>
              <p className="text-xs text-slate-500">Visita marcada: {visita.quando}</p>
              <a href={`/sdr/visita/${id}?r=1`} className={btn + ' block border-emerald-300 text-emerald-800 hover:bg-emerald-50'}>Remarcar visita</a>
            </>
          ) : (
            <a href={`/sdr/visita/${id}`} className={btn + ' block border-emerald-300 text-emerald-800 hover:bg-emerald-50'}>
              {preAgenda ? 'Confirmar agendamento de visita' : 'Agendar visita'}
              {preAgenda && <span className="block text-xs font-normal text-slate-500">pré-agendada pelo cliente: {preAgenda}</span>}
            </a>
          )}
          {visita?.passou && (
            <button type="button" onClick={() => setTela('feita')} className={btn + ' border-emerald-300 text-emerald-800 hover:bg-emerald-50'}>
              Visita feita <span className="block text-xs font-normal text-slate-500">{visita.quando}</span>
            </button>
          )}
          <button type="button" onClick={() => setTela('contato')} className={btn + ' border-blue-200 text-blue-800 hover:bg-blue-50'}>
            Agendar novo contato <span className="block text-xs font-normal text-slate-500">a Eva te lembra no dia e na hora</span>
          </button>
          <button type="button" onClick={() => setTela('arquivar')} className={btn + ' border-red-200 text-red-700 hover:bg-red-50'}>Arquivar lead</button>
        </div>
      ) : tela === 'feita' ? (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-sm text-slate-700">Como foi a visita de {primeiro} ({visita?.quando})?</p>
          {[['visitou', 'Visitou'], ['proposta', 'Visitou e fez proposta']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setResultado(k)}
              className={btn + (resultado === k ? ' border-emerald-600 bg-emerald-50 text-emerald-900' : ' border-slate-300 text-slate-700')}>{t}</button>
          ))}
          <p className="text-xs text-slate-500">Não aconteceu? Use Remarcar visita ou Arquivar.</p>
          <button type="button" disabled={pend || !resultado} onClick={() => rodar(() => visitaFeita(id, resultado))}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ) : tela === 'contato' ? (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-xs text-slate-500">No dia e na hora, a Eva te lembra de {primeiro} pelo WhatsApp. Até lá ela não manda nada ao cliente nem te cobra.</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="text-xs font-semibold text-slate-600">Dia
              <input type="date" min={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Hora
              <select value={hora} onChange={(e) => setHora(e.target.value)} className={campo}>
                {HORAS.map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Anotação (opcional)
            <input type="text" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex.: ligar depois que voltar de viagem" className={campo} />
          </label>
          <button type="button" disabled={pend || !data} onClick={() => rodar(() => novoContato(id, data, hora, nota))}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Salvando…' : 'Agendar'}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-xs text-slate-500">O lead sai do seu funil e a Eva para de falar com o cliente. O Guilherme recebe o aviso.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MOTIVOS.map(([k, t]) => (
              <button key={k} type="button" onClick={() => setMotivo(k)}
                className={'rounded-lg border px-2 py-1.5 text-xs font-semibold ' + (motivo === k ? 'border-red-600 bg-red-50 text-red-800' : 'border-slate-300 text-slate-700')}>{t}</button>
            ))}
          </div>
          <label className="block text-xs font-semibold text-slate-600">{motivo === 'outro' ? 'Qual o motivo?' : 'Detalhe (opcional)'}
            <input type="text" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} className={campo} />
          </label>
          <button type="button" disabled={pend || !motivo || (motivo === 'outro' && nota.trim().length < 3)} onClick={() => rodar(() => arquivarLead(id, motivo, nota))}
            className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Arquivando…' : 'Arquivar'}
          </button>
        </div>
      )}
      {res && !res.ok && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>}
    </div>
  );
}
