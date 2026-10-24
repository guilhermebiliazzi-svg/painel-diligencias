'use client';

// Quadro "Enviar mensagem pela Eva": cliente, corretor Ville do lead ou corretor parceiro.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { enviarMensagemEva, type DestinoTipo, type ResultadoMsg } from './mensagem-actions';

export type DestinoMsg = { chave: string; destino: DestinoTipo; imovelId?: string; rotulo: string; detalhe: string; janela: boolean };

const COMO: Record<DestinoTipo, [string, string]> = {
  cliente: ['Sai como texto livre da Eva.', 'Fora da janela de 24h: sai pela mensagem-modelo "eva_mensagem_cliente" (Olá, {nome}! Aqui é a Eva, da REMAX Ville. + seu texto).'],
  corretor: ['Sai como texto livre da Eva.', 'Fora da janela de 24h: sai como "Aviso da Eva: …" (modelo interno).'],
  parceiro: ['Sai como texto livre da Eva.', 'Fora da janela de 24h: sai como "Aviso da Eva: …" (modelo interno).'],
};

export default function MensagemEva({ leadId, destinos, captacaoId }: { leadId: string; destinos: DestinoMsg[]; captacaoId?: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<string>(destinos[0]?.chave ?? '');
  const [texto, setTexto] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [res, setRes] = useState<ResultadoMsg | null>(null);
  const [pend, start] = useTransition();
  const d = destinos.find((x) => x.chave === sel);
  const t = texto.trim();

  return (
    <section style={{ backgroundColor: '#ffffff' }} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Enviar mensagem pela Eva</h2>
      <p className="text-xs text-slate-500">Sai do WhatsApp da Eva e fica registrada na linha do tempo deste lead.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {destinos.map((x) => (
          <button key={x.chave} type="button" onClick={() => { setSel(x.chave); setConfirmar(false); setRes(null); }}
            className={'rounded-lg border px-3 py-1.5 text-left text-sm ' + (x.chave === sel ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50')}>
            <span className="font-semibold">{x.rotulo}</span>
            <span className="block text-xs text-slate-500">{x.detalhe}</span>
          </button>
        ))}
      </div>
      <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setConfirmar(false); setRes(null); }} rows={4} maxLength={900}
        placeholder="Escreva a mensagem (a Eva envia exatamente este texto)"
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{d ? (d.janela ? '● Conversa aberta (24h). ' + COMO[d.destino][0] : '○ ' + COMO[d.destino][1]) : 'Sem destinatário disponível.'}</span>
        <span className="tabular-nums">{texto.length}/900</span>
      </div>
      {!confirmar ? (
        <button type="button" disabled={!d || !t || pend} onClick={() => { setRes(null); setConfirmar(true); }}
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          Revisar e enviar
        </button>
      ) : (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>Enviar para <b>{d?.rotulo}</b> ({d?.detalhe})?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={pend}
              onClick={() => d && start(async () => { const r = await enviarMensagemEva(leadId, d.destino, t, d.imovelId, captacaoId); setRes(r); setConfirmar(false); if (r.ok) { setTexto(''); router.refresh(); } })}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {pend ? 'Enviando…' : 'Confirmar envio'}
            </button>
            <button type="button" disabled={pend} onClick={() => setConfirmar(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-white">Voltar</button>
          </div>
        </div>
      )}
      {res && <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${res.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{res.ok ? res.msg : res.erro}</p>}
    </section>
  );
}
