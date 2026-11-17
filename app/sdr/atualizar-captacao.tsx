'use client';

// 17/11: botão "Atualizar" dos leads de captação (proprietário), no Meu funil e na tela do lead:
// agendar/remarcar V1 e V2 (vai para a agenda do captador), V1/V2 realizada, contrato assinado,
// novo contato numa data e encerrar com motivo. Mesmo registro dos botões da Eva no WhatsApp.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { captacaoEtapa, novoContato, type ResAcao } from './acoes-corretor';

type Etapa = 'v1_agendada' | 'v1_realizada' | 'v2_agendada' | 'v2_realizada' | 'contrato_assinado';
const ROTULO: Record<Etapa, string> = {
  v1_agendada: 'V1 agendada', v1_realizada: 'V1 realizada', v2_agendada: 'V2 agendada', v2_realizada: 'V2 realizada', contrato_assinado: 'Contrato assinado',
};
const MOTIVOS: [string, string][] = [
  ['desistiu', 'Desistiu de vender/alugar'],
  ['outra_imobiliaria', 'Fechou com outra imobiliária'],
  ['vendeu', 'Vendeu/alugou sozinho'],
  ['sem_contato', 'Não consegui contato'],
  ['outro', 'Outro motivo'],
];
const HORAS = Array.from({ length: 13 }, (_, i) => i + 8);
const MINUTOS = ['00', '15', '30', '45'];
type Tela = 'menu' | 'agendar' | 'confirmar' | 'contato' | 'encerrar';

const btn = 'w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold';
const campo = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-500';

export default function AtualizarCaptacao({ id, nome, ultima, hoje, rotuloBotao }: {
  id: string; nome: string; hoje: string;
  /** última etapa registrada (v1_agendada … contrato_assinado) ou vazio */
  ultima: string;
  rotuloBotao?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<Tela>('menu');
  const [todas, setTodas] = useState(false);
  const [etapa, setEtapa] = useState<Etapa | ''>('');
  const [res, setRes] = useState<ResAcao | null>(null);
  const [pend, start] = useTransition();
  const [data, setData] = useState('');
  const [hora, setHora] = useState('10');
  const [minuto, setMinuto] = useState('00');
  const [nota, setNota] = useState('');
  const [motivo, setMotivo] = useState('');
  const primeiro = (nome || 'proprietário').split(' ')[0];

  const fechar = () => { setAberto(false); setTela('menu'); setTodas(false); setEtapa(''); setRes(null); setData(''); setNota(''); setMotivo(''); };
  const rodar = (f: () => Promise<ResAcao>) => { setRes(null); start(async () => { const r = await f(); setRes(r); if (r.ok) router.refresh(); }); };
  const ir = (e: Etapa) => { setEtapa(e); setRes(null); setTela(/_agendada$/.test(e) ? 'agendar' : 'confirmar'); };

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className="mt-1 inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-slate-700">
        {rotuloBotao || 'Atualizar'}
      </button>
    );
  }

  // Próximos passos de acordo com a última etapa (o resto fica em "Outra etapa").
  const proximas: { e: Etapa; t: string }[] =
    ultima === 'v1_agendada' ? [{ e: 'v1_agendada', t: 'Remarcar V1' }, { e: 'v1_realizada', t: 'V1 realizada' }]
    : ultima === 'v1_realizada' ? [{ e: 'v2_agendada', t: 'Agendar V2' }]
    : ultima === 'v2_agendada' ? [{ e: 'v2_agendada', t: 'Remarcar V2' }, { e: 'v2_realizada', t: 'V2 realizada' }]
    : ultima === 'v2_realizada' ? [{ e: 'contrato_assinado', t: 'Contrato assinado' }]
    : [{ e: 'v1_agendada', t: 'Agendar V1 (avaliação)' }];
  const outras = (Object.keys(ROTULO) as Etapa[]).filter((e) => !proximas.some((p) => p.e === e));

  const voltar = (
    <button type="button" disabled={pend} onClick={() => { setTela('menu'); setRes(null); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">← voltar</button>
  );
  const vis = etapa ? etapa.slice(0, 2).toUpperCase() : '';
  const remarcar = !!etapa && etapa === ultima && /_agendada$/.test(etapa);

  return (
    <div className="mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Captação · {primeiro}</p>
        <button type="button" onClick={fechar} aria-label="Fechar" className="text-slate-400 hover:text-slate-700">✕</button>
      </div>

      {res?.ok ? (
        <>
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p>
          <button type="button" onClick={fechar} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Fechar</button>
        </>
      ) : tela === 'menu' ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-slate-500">Etapa atual: <strong>{ROTULO[ultima as Etapa] || 'nenhuma registrada'}</strong></p>
          {proximas.map((p) => (
            <button key={p.e + p.t} type="button" onClick={() => ir(p.e)} className={btn + ' border-emerald-300 text-emerald-800 hover:bg-emerald-50'}>{p.t}</button>
          ))}
          {!todas ? (
            <button type="button" onClick={() => setTodas(true)} className="text-xs font-semibold text-slate-500 underline hover:text-slate-800">Outra etapa…</button>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {outras.map((e) => (
                <button key={e} type="button" onClick={() => ir(e)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">{ROTULO[e]}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setTela('contato')} className={btn + ' border-blue-200 text-blue-800 hover:bg-blue-50'}>
            Agendar novo contato <span className="block text-xs font-normal text-slate-500">a Eva te lembra no dia e na hora</span>
          </button>
          <button type="button" onClick={() => setTela('encerrar')} className={btn + ' border-red-200 text-red-700 hover:bg-red-50'}>Encerrar captação</button>
        </div>
      ) : tela === 'agendar' ? (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-sm text-slate-700">{remarcar ? `Nova data da ${vis} com ${primeiro}` : `${vis} com ${primeiro}`}</p>
          <p className="text-xs text-slate-500">Vai para a sua agenda (se estiver integrada) e a Eva te lembra na véspera.</p>
          <label className="block text-xs font-semibold text-slate-600">Dia
            <input type="date" min={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Hora
              <select value={hora} onChange={(e) => setHora(e.target.value)} className={campo}>
                {HORAS.map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Minutos
              <select value={minuto} onChange={(e) => setMinuto(e.target.value)} className={campo}>
                {MINUTOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <button type="button" disabled={pend || !data} onClick={() => rodar(() => captacaoEtapa(id, etapa as Etapa, data, hora, minuto, ''))}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Salvando…' : remarcar ? 'Remarcar' : 'Agendar'}
          </button>
        </div>
      ) : tela === 'confirmar' ? (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-sm text-slate-700">Confirmar <strong>{ROTULO[etapa as Etapa]}</strong> com {primeiro}?</p>
          {etapa === 'contrato_assinado' && <p className="text-xs text-slate-500">A captação é encerrada como fechada e o Guilherme recebe o aviso.</p>}
          <button type="button" disabled={pend} onClick={() => rodar(() => captacaoEtapa(id, etapa as Etapa, '', '', '', ''))}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      ) : tela === 'contato' ? (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-xs text-slate-500">No dia e na hora, a Eva te lembra de {primeiro} pelo WhatsApp. Nada vai para o proprietário.</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="text-xs font-semibold text-slate-600">Dia
              <input type="date" min={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Hora
              <select value={hora} onChange={(e) => setHora(e.target.value)} className={campo}>
                {HORAS.filter((h) => h >= 9).map((h) => <option key={h} value={h}>{h}h</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Anotação (opcional)
            <input type="text" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ex.: ligar depois da reunião de família" className={campo} />
          </label>
          <button type="button" disabled={pend || !data} onClick={() => rodar(() => novoContato(id, data, hora, nota))}
            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Salvando…' : 'Agendar'}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {voltar}
          <p className="text-xs text-slate-500">A captação sai do seu funil e a Eva para de perguntar dela. O Guilherme recebe o aviso.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {MOTIVOS.map(([k, t]) => (
              <button key={k} type="button" onClick={() => setMotivo(k)}
                className={'rounded-lg border px-2 py-1.5 text-xs font-semibold ' + (motivo === k ? 'border-red-600 bg-red-50 text-red-800' : 'border-slate-300 text-slate-700')}>{t}</button>
            ))}
          </div>
          <label className="block text-xs font-semibold text-slate-600">{motivo === 'outro' ? 'Qual o motivo?' : 'Detalhe (opcional)'}
            <input type="text" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} className={campo} />
          </label>
          <button type="button" disabled={pend || !motivo || (motivo === 'outro' && nota.trim().length < 3)}
            onClick={() => rodar(() => captacaoEtapa(id, 'cancelada', '', '', '', (MOTIVOS.find((m) => m[0] === motivo)?.[1] || '') + (nota.trim() ? ': ' + nota.trim() : '')))}
            className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {pend ? 'Encerrando…' : 'Encerrar captação'}
          </button>
        </div>
      )}
      {res && !res.ok && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>}
    </div>
  );
}
