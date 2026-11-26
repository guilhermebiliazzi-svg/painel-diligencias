'use client';

import { useState, useTransition } from 'react';
import { registrarVisita, incluirOutroImovel, type ResVisita } from './actions';

export type ImovelOpc = { id: string; rotulo: string };

const OUTRO = '__outro__';

export default function FormVisita({ token, imoveis, inicial }: { token: string; imoveis: ImovelOpc[]; inicial?: string }) {
  const [imovel, setImovel] = useState(inicial ?? imoveis[0]?.id ?? OUTRO);
  const [codigo, setCodigo] = useState('');
  const [endereco, setEndereco] = useState('');
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [res, setRes] = useState<ResVisita | null>(null);
  const [pend, start] = useTransition();
  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200';
  const outro = imovel === OUTRO;
  if (res?.ok) return <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{res.msg}</p>;
  const enviar = () => start(async () => {
    let id = imovel;
    if (outro) {
      const r = await incluirOutroImovel(token, codigo, endereco);
      if (!r.ok || !r.id) { setRes({ ok: false, erro: r.erro || 'Não consegui incluir o imóvel.' }); return; }
      id = r.id;
    }
    setRes(await registrarVisita(token, id, data, hora));
  });
  return (
    <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); setRes(null); enviar(); }}>
      <label className="block text-sm text-slate-700">Imóvel
        <select className={campo} value={imovel} onChange={(e) => setImovel(e.target.value)}>
          {imoveis.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
          <option value={OUTRO}>Outro imóvel (oferecido por mim)</option>
        </select>
      </label>
      {outro && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="block text-sm text-slate-700">Código do imóvel
            <input className={campo} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: NA4T0 ou 601241007-131" autoCapitalize="characters" />
          </label>
          <label className="block text-sm text-slate-700">Endereço (se não tiver código na nossa base)
            <input className={campo} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número e bairro" />
          </label>
          <p className="text-xs text-slate-500">Com o código, o endereço e o valor vêm da nossa base. Imóvel de outra imobiliária ou de parceiro: digite o endereço.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm text-slate-700">Dia
          <input type="date" required className={campo} value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="block text-sm text-slate-700">Hora
          <input type="time" required step={900} className={campo} value={hora} onChange={(e) => setHora(e.target.value)} />
        </label>
      </div>
      <button type="submit" disabled={pend || !imovel || !data || !hora || (outro && !codigo.trim() && endereco.trim().length < 6)} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {pend ? 'Registrando…' : 'Registrar visita'}
      </button>
      {res && !res.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{res.erro}</p>}
    </form>
  );
}
