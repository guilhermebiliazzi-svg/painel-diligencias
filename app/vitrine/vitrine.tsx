'use client';

import { useMemo, useState, useTransition } from 'react';
import { salvarGrupos } from './actions';

export type Imovel = {
  codigo: string;
  tipo: string | null;
  bairro: string | null;
  endereco: string | null;
  preco: number | null;
  quartos: number | null;
  area: number | null;
  vagas: number | null;
  unidade: string | null;
  condominio: string | null;
  sem_preco: boolean | null;
  imagem: string | null;
  gestor: string | null;
};

const GRUPOS = [
  { k: 'jardins', rotulo: 'Jardins e Itaim' },
  { k: 'zonasul', rotulo: 'Zona Sul' },
  { k: 'demais', rotulo: 'Demais bairros' },
] as const;

const SITE = 'https://www.villejardins.com.br/imovel/imovel-id-';
const POR_PAGINA = 30;

const norm = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtPreco = (v: number | null) => (v ? 'R$ ' + Number(v).toLocaleString('pt-BR') : '');
const semPreco = (i: Imovel) => !!i.sem_preco || !i.preco;
const nomeUnidade = (u: string | null) => (u ? `REMAX ${u}` : 'Unidade não informada');
const dorms = (q: number | null) => (q ? `${q} ${q > 1 ? 'dorms' : 'dorm'}` : '');

// Prévia no formato dos anúncios atuais da campanha (Demand Gen, imagem única):
// título 1 = preço · bairro; título 2 = tipo · m² · dorms; marca REMAX Ville.
function PreviaAnuncio({ i }: { i: Imovel }) {
  const t1 = semPreco(i) ? `${i.tipo ?? 'Imóvel'} à venda · ${i.bairro ?? ''}` : `${fmtPreco(i.preco)} · ${i.bairro ?? ''}`;
  const t2 = [i.tipo, i.area ? `${i.area} m²` : '', dorms(i.quartos)].filter(Boolean).join(' · ');
  return (
    <div style={{ backgroundColor: '#ffffff' }} className="mt-3 max-w-sm overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#003DA5] text-[9px] font-bold text-white">RX</span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">REMAX Ville</p>
          <p className="text-[11px] text-slate-500">Patrocinado</p>
        </div>
      </div>
      <div className="aspect-[1.91/1] w-full bg-slate-100">
        {i.imagem && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.imagem} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{t1}</p>
          <p className="truncate text-xs text-slate-600">{t2 || 'Agende sua visita'}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#003DA5] px-3 py-1.5 text-xs font-semibold text-white">Saiba mais</span>
      </div>
    </div>
  );
}

function unicos(lista: (string | null)[]) {
  return Array.from(new Set(lista.filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export default function Vitrine({ imoveis, selecaoInicial }: { imoveis: Imovel[]; selecaoInicial: Record<string, string[]> }) {
  const [sel, setSel] = useState<Record<string, string[]>>(selecaoInicial);
  const [vitrine, setVitrine] = useState('');
  const [busca, setBusca] = useState('');
  const [bairro, setBairro] = useState('');
  const [tipo, setTipo] = useState('');
  const [unidade, setUnidade] = useState('');
  const [pmin, setPmin] = useState('');
  const [pmax, setPmax] = useState('');
  const [ordem, setOrdem] = useState('sel');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [previa, setPrevia] = useState<string | null>(null);

  const bairros = useMemo(() => unicos(imoveis.map((i) => i.bairro)), [imoveis]);
  const tipos = useMemo(() => unicos(imoveis.map((i) => i.tipo)), [imoveis]);
  const unidades = useMemo(() => unicos(imoveis.map((i) => nomeUnidade(i.unidade))), [imoveis]);
  const indice = useMemo(
    () => new Map(imoveis.map((i) => [i.codigo, norm([i.codigo, i.endereco, i.condominio, i.bairro].join(' '))])),
    [imoveis]
  );

  const lista = useMemo(() => {
    const b = norm(busca.trim());
    const mn = Number(pmin) || 0;
    const mx = Number(pmax) || 0;
    const l = imoveis.filter(
      (i) =>
        (!b || (indice.get(i.codigo) ?? '').includes(b)) &&
        (!bairro || i.bairro === bairro) &&
        (!tipo || i.tipo === tipo) &&
        (!unidade || nomeUnidade(i.unidade) === unidade) &&
        (!mn || (i.preco ?? 0) >= mn) &&
        (!mx || (i.preco ?? 0) <= mx) &&
        (!vitrine || (sel[i.codigo] ?? []).includes(vitrine))
    );
    const escolhido = (i: Imovel) => ((sel[i.codigo] ?? []).length ? 1 : 0);
    const preco = (i: Imovel) => i.preco ?? 0;
    l.sort(
      ordem === 'pdesc' ? (a, b) => preco(b) - preco(a)
        : ordem === 'pasc' ? (a, b) => preco(a) - preco(b)
        : ordem === 'bairro' ? (a, b) => (a.bairro ?? '').localeCompare(b.bairro ?? '', 'pt-BR')
        : (a, b) => escolhido(b) - escolhido(a) || preco(b) - preco(a)
    );
    return l;
  }, [imoveis, indice, busca, bairro, tipo, unidade, pmin, pmax, vitrine, sel, ordem]);

  const contagem = (g: string) => Object.values(sel).filter((v) => v.includes(g)).length;
  const totalEscolhidos = Object.keys(sel).length;
  const escolhidosSemPreco = imoveis.filter((i) => sel[i.codigo]?.length && semPreco(i));

  function alternar(codigo: string, g: string) {
    const antes = sel[codigo] ?? [];
    const depois = antes.includes(g) ? antes.filter((x) => x !== g) : [...antes, g];
    setSel((s) => {
      const n = { ...s };
      if (depois.length) n[codigo] = depois; else delete n[codigo];
      return n;
    });
    iniciar(async () => {
      const r = await salvarGrupos(codigo, depois);
      if (r.ok) {
        setMsg({ tipo: 'ok', texto: 'Salvo' });
      } else {
        setSel((s) => {
          const n = { ...s };
          if (antes.length) n[codigo] = antes; else delete n[codigo];
          return n;
        });
        setMsg({ tipo: 'erro', texto: r.erro ?? 'Não foi possível salvar.' });
      }
    });
  }

  const resetar = (f: () => void) => { f(); setLimite(POR_PAGINA); };
  const campo = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm';

  return (
    <div className="mt-6">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {GRUPOS.map((g) => (
          <button
            key={g.k}
            type="button"
            aria-pressed={vitrine === g.k}
            onClick={() => resetar(() => setVitrine((v) => (v === g.k ? '' : g.k)))}
            style={{ backgroundColor: vitrine === g.k ? '#eff6ff' : '#ffffff' }}
            className={`rounded-2xl border p-3 text-left shadow-sm transition sm:p-4 ${vitrine === g.k ? 'border-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{contagem(g.k)}</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">{g.rotulo}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input className={`${campo} col-span-2`} type="search" placeholder="Buscar rua, condomínio ou código" aria-label="Buscar"
          value={busca} onChange={(e) => resetar(() => setBusca(e.target.value))} />
        <select className={campo} aria-label="Bairro" value={bairro} onChange={(e) => resetar(() => setBairro(e.target.value))}>
          <option value="">Todos os bairros</option>
          {bairros.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={campo} aria-label="Tipo" value={tipo} onChange={(e) => resetar(() => setTipo(e.target.value))}>
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={campo} type="number" inputMode="numeric" placeholder="Preço mín. (R$)" aria-label="Preço mínimo"
          value={pmin} onChange={(e) => resetar(() => setPmin(e.target.value))} />
        <input className={campo} type="number" inputMode="numeric" placeholder="Preço máx. (R$)" aria-label="Preço máximo"
          value={pmax} onChange={(e) => resetar(() => setPmax(e.target.value))} />
        <select className={campo} aria-label="Unidade" value={unidade} onChange={(e) => resetar(() => setUnidade(e.target.value))}>
          <option value="">Todas as unidades</option>
          {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className={campo} aria-label="Ordenar" value={ordem} onChange={(e) => resetar(() => setOrdem(e.target.value))}>
          <option value="sel">Escolhidos primeiro</option>
          <option value="pdesc">Maior preço</option>
          <option value="pasc">Menor preço</option>
          <option value="bairro">Bairro (A–Z)</option>
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span><b className="tabular-nums text-slate-900">{lista.length.toLocaleString('pt-BR')}</b> {vitrine ? 'imóveis nesta vitrine' : 'imóveis à venda'}</span>
        <span><b className="tabular-nums text-slate-900">{totalEscolhidos}</b> escolhidos no total</span>
        {pendente && <span className="text-slate-400">Salvando…</span>}
        {!pendente && msg && <span className={msg.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}>{msg.texto}</span>}
      </div>

      {escolhidosSemPreco.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {escolhidosSemPreco.length} escolhido(s) sem preço divulgado ({escolhidosSemPreco.map((i) => i.codigo).join(', ')}). O anúncio sai sem o valor no título.
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {lista.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            {vitrine
              ? 'Nenhum imóvel nesta vitrine. Toque de novo no número da vitrine para ver todos e escolha pelos botões de região.'
              : 'Nenhum imóvel com esses filtros.'}
          </p>
        )}
        {lista.slice(0, limite).map((i) => {
          const g = sel[i.codigo] ?? [];
          const ficha = [
            i.area ? `${i.area} m²` : '',
            i.quartos ? `${i.quartos} ${i.quartos > 1 ? 'quartos' : 'quarto'}` : '',
            i.vagas ? `${i.vagas} ${i.vagas > 1 ? 'vagas' : 'vaga'}` : '',
          ].filter(Boolean).join(' · ');
          return (
            <article key={i.codigo} style={{ backgroundColor: '#ffffff' }}
              className={`flex flex-col gap-3 rounded-2xl border p-3 shadow-sm sm:flex-row ${g.length ? 'border-blue-400' : 'border-slate-200'}`}>
              <a href={SITE + i.codigo} target="_blank" rel="noopener noreferrer"
                className="block aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-44">
                {i.imagem && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.imagem} alt={`${i.tipo ?? 'Imóvel'} em ${i.bairro ?? ''}`} loading="lazy" className="h-full w-full object-cover" />
                )}
              </a>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={semPreco(i) ? 'text-sm font-semibold text-amber-700' : 'text-lg font-semibold tabular-nums text-slate-900'}>
                    {semPreco(i) ? 'Preço sob consulta' : fmtPreco(i.preco)}
                  </span>
                  <span className="font-medium text-slate-800">{i.bairro}</span>
                  <a href={SITE + i.codigo} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-blue-700 hover:underline">
                    {i.codigo} ↗
                  </a>
                </div>
                <p className="mt-1 break-words text-sm text-slate-600">{[i.tipo, i.condominio, i.endereco].filter(Boolean).join(' · ')}</p>
                {ficha && <p className="mt-0.5 text-sm tabular-nums text-slate-500">{ficha}</p>}
                <p className="mt-0.5 text-xs text-slate-500">{nomeUnidade(i.unidade)}{i.gestor ? ` · ${i.gestor}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {GRUPOS.map((gr) => {
                    const ativo = g.includes(gr.k);
                    return (
                      <button key={gr.k} type="button" aria-pressed={ativo} onClick={() => alternar(i.codigo, gr.k)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${ativo ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        style={ativo ? undefined : { backgroundColor: '#ffffff' }}>
                        {ativo ? '✓ ' : '+ '}{gr.rotulo}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setPrevia((p) => (p === i.codigo ? null : i.codigo))}
                    className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-blue-700 hover:underline">
                    {previa === i.codigo ? 'Fechar anúncio' : 'Ver anúncio'}
                  </button>
                </div>
                {previa === i.codigo && <PreviaAnuncio i={i} />}
              </div>
            </article>
          );
        })}
      </div>

      {lista.length > limite && (
        <button type="button" onClick={() => setLimite((l) => l + POR_PAGINA)} style={{ backgroundColor: '#ffffff' }}
          className="mx-auto mt-5 block rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          Mostrar mais {Math.min(POR_PAGINA, lista.length - limite)}
        </button>
      )}
    </div>
  );
}
