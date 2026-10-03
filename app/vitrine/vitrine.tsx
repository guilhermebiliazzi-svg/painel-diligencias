'use client';

import { useMemo, useState, useTransition } from 'react';
import { salvarGrupos, salvarVitrine, arquivarVitrine, gerarCarrossel, type VitrineEntrada } from './actions';

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

export type Vitrine = {
  id: string;
  nome: string;
  ad_group_id: string | null;
  bairros: string[];
  tipos: string[];
  preco_min: number | null;
  preco_max: number | null;
  publico: string[];
};

export type GeoAlvo = { geo_id: string; nome: string; tipo: string | null };

export type Carrossel = {
  id: number;
  bairro_nome: string | null;
  status: string | null;
  qtd_imoveis: number | null;
  created_at: string | null;
  postado_em: string | null;
};

const MAX_CARROSSEL = 8;
const STATUS_CARROSSEL: Record<string, string> = {
  gerando: 'Gerando slides',
  aguardando_aprovacao: 'Aguardando sua aprovação no WhatsApp',
  aprovado: 'Aprovado, postando',
  postado: 'Postado no Instagram',
  erro: 'Erro',
};

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

// Lista com busca para escolher vários itens (bairros, tipos, público).
function MultiEscolha({
  rotulo, opcoes, valor, onChange, vazio,
}: {
  rotulo: string;
  opcoes: { v: string; r: string }[];
  valor: string[];
  onChange: (v: string[]) => void;
  vazio: string;
}) {
  const [q, setQ] = useState('');
  const nomes = useMemo(() => new Map(opcoes.map((o) => [o.v, o.r])), [opcoes]);
  const achados = useMemo(() => {
    const b = norm(q.trim());
    return opcoes.filter((o) => !valor.includes(o.v) && (!b || norm(o.r).includes(b))).slice(0, 40);
  }, [opcoes, valor, q]);
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {valor.length === 0 && <span className="text-sm text-slate-400">{vazio}</span>}
        {valor.map((v) => (
          <button key={v} type="button" onClick={() => onChange(valor.filter((x) => x !== v))}
            className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
            {nomes.get(v) ?? v} ✕
          </button>
        ))}
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar para adicionar"
        className="mt-2 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
      {q.trim() && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {achados.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Nada encontrado.</p>}
          {achados.map((o) => (
            <button key={o.v} type="button" onClick={() => { onChange([...valor, o.v]); setQ(''); }}
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              + {o.r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const resumoVitrine = (v: Vitrine) =>
  [
    v.bairros.length ? v.bairros.slice(0, 4).join(', ') + (v.bairros.length > 4 ? ` +${v.bairros.length - 4}` : '') : '',
    v.tipos.length ? v.tipos.join(', ') : '',
    v.preco_min || v.preco_max
      ? `${v.preco_min ? 'de ' + fmtPreco(v.preco_min) : ''}${v.preco_min && v.preco_max ? ' ' : ''}${v.preco_max ? 'até ' + fmtPreco(v.preco_max) : ''}`
      : '',
  ].filter(Boolean).join(' · ') || 'Sem filtros';

function EditorVitrine({
  inicial, bairros, tipos, geo, onSalvo, onFechar, onArquivado,
}: {
  inicial: VitrineEntrada;
  bairros: string[];
  tipos: string[];
  geo: GeoAlvo[];
  onSalvo: (v: Vitrine) => void;
  onFechar: () => void;
  onArquivado: (id: string) => void;
}) {
  const [d, setD] = useState<VitrineEntrada>(inicial);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const campo = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900';
  const opGeo = useMemo(() => geo.map((g) => ({ v: g.geo_id, r: g.nome })), [geo]);

  function salvar() {
    setErro('');
    iniciar(async () => {
      const r = await salvarVitrine(d);
      if (!r.ok || !r.id) { setErro(r.erro ?? 'Não foi possível salvar.'); return; }
      onSalvo({
        id: r.id, nome: d.nome.trim(), ad_group_id: null, bairros: d.bairros, tipos: d.tipos,
        preco_min: d.preco_min || null, preco_max: d.preco_max || null, publico: d.publico,
      });
    });
  }
  function arquivar() {
    if (!d.id) return;
    iniciar(async () => {
      const r = await arquivarVitrine(d.id!);
      if (!r.ok) { setErro(r.erro ?? 'Não foi possível arquivar.'); return; }
      onArquivado(d.id!);
    });
  }

  return (
    <div style={{ backgroundColor: '#ffffff' }} className="mt-4 rounded-2xl border border-blue-300 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{d.id ? 'Editar vitrine' : 'Nova vitrine'}</h2>
        <button type="button" onClick={onFechar} className="text-sm text-slate-500 hover:text-slate-800">Fechar</button>
      </div>
      <div className="mt-3 grid gap-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nome</span>
          <input className={`${campo} mt-1.5`} value={d.nome} maxLength={60} placeholder="Ex.: Apartamentos em Moema até R$ 1,5 mi"
            onChange={(e) => setD({ ...d, nome: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <MultiEscolha rotulo="Bairros dos imóveis" opcoes={bairros.map((b) => ({ v: b, r: b }))} valor={d.bairros}
            onChange={(v) => setD({ ...d, bairros: v })} vazio="Todos os bairros" />
          <MultiEscolha rotulo="Tipos de imóvel" opcoes={tipos.map((t) => ({ v: t, r: t }))} valor={d.tipos}
            onChange={(v) => setD({ ...d, tipos: v })} vazio="Todos os tipos" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preço mínimo</span>
            <input className={`${campo} mt-1.5`} type="number" inputMode="numeric" value={d.preco_min ?? ''}
              onChange={(e) => setD({ ...d, preco_min: e.target.value ? Number(e.target.value) : null })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preço máximo</span>
            <input className={`${campo} mt-1.5`} type="number" inputMode="numeric" value={d.preco_max ?? ''}
              onChange={(e) => setD({ ...d, preco_max: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>
        <MultiEscolha rotulo="Público: onde o anúncio aparece (regiões do Google)" opcoes={opGeo} valor={d.publico}
          onChange={(v) => setD({ ...d, publico: v })} vazio="Escolha ao menos uma região" />
        <p className="-mt-2 text-xs text-slate-500">
          O Google só separa São Paulo por distritos (ex.: Brooklin entra em Santo Amaro ou Campo Belo; Vila Olímpia em Itaim Bibi).
        </p>
      </div>
      {erro && <p className="mt-3 text-sm text-red-700">{erro}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pendente} onClick={salvar}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pendente ? 'Salvando…' : d.id ? 'Salvar vitrine' : 'Criar vitrine'}
        </button>
        {d.id && !confirmar && (
          <button type="button" onClick={() => setConfirmar(true)} className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            Arquivar vitrine
          </button>
        )}
        {d.id && confirmar && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-red-800">
            Os imóveis saem dela e os anúncios são pausados.
            <button type="button" disabled={pendente} onClick={arquivar} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white">
              Confirmar
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className="text-slate-600">Cancelar</button>
          </span>
        )}
      </div>
    </div>
  );
}

function unicos(lista: (string | null)[]) {
  return Array.from(new Set(lista.filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export default function Vitrine({
  imoveis, selecaoInicial, vitrines, geo, carrosseis,
}: {
  imoveis: Imovel[];
  selecaoInicial: Record<string, string[]>;
  vitrines: Vitrine[];
  geo: GeoAlvo[];
  carrosseis: Carrossel[];
}) {
  const [carrossel, setCarrossel] = useState<string[]>([]);
  const [tituloCar, setTituloCar] = useState('');
  const [msgCar, setMsgCar] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviandoCar, iniciarCar] = useTransition();
  const [vits, setVits] = useState<Vitrine[]>(vitrines);
  const [modo, setModo] = useState<'escolhidos' | 'escolher'>('escolhidos');
  const [editor, setEditor] = useState<VitrineEntrada | null>(null);
  const geoNome = useMemo(() => new Map(geo.map((g) => [g.geo_id, g.nome])), [geo]);
  const [sel, setSel] = useState<Record<string, string[]>>(selecaoInicial);
  // Ordem "escolhidos primeiro" congelada: só muda quando os filtros mudam,
  // para a lista não pular enquanto você marca imóveis.
  const [fixos, setFixos] = useState<Set<string>>(() => new Set(Object.keys(selecaoInicial)));
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

  const vAtiva = vits.find((v) => v.id === vitrine) ?? null;

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
        (!vitrine || modo === 'escolher' || (sel[i.codigo] ?? []).includes(vitrine)) &&
        (!vAtiva || modo === 'escolhidos' || (
          (!vAtiva.bairros.length || vAtiva.bairros.includes(i.bairro ?? '')) &&
          (!vAtiva.tipos.length || vAtiva.tipos.includes(i.tipo ?? '')) &&
          (!vAtiva.preco_min || (i.preco ?? 0) >= vAtiva.preco_min) &&
          (!vAtiva.preco_max || ((i.preco ?? 0) > 0 && (i.preco ?? 0) <= vAtiva.preco_max))
        ))
    );
    const escolhido = (i: Imovel) => (fixos.has(i.codigo) ? 1 : 0);
    const preco = (i: Imovel) => i.preco ?? 0;
    l.sort(
      ordem === 'pdesc' ? (a, b) => preco(b) - preco(a)
        : ordem === 'pasc' ? (a, b) => preco(a) - preco(b)
        : ordem === 'bairro' ? (a, b) => (a.bairro ?? '').localeCompare(b.bairro ?? '', 'pt-BR')
        : (a, b) => escolhido(b) - escolhido(a) || preco(b) - preco(a)
    );
    return l;
  }, [imoveis, indice, busca, bairro, tipo, unidade, pmin, pmax, vitrine, vAtiva, modo, sel, fixos, ordem]);

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

  function enviarCarrossel() {
    setMsgCar(null);
    iniciarCar(async () => {
      const r = await gerarCarrossel(tituloCar, carrossel);
      if (r.ok) {
        setCarrossel([]);
        setTituloCar('');
        setMsgCar({ tipo: 'ok', texto: 'Carrossel pedido. A prévia chega no seu WhatsApp para aprovar em alguns minutos.' });
      } else {
        setMsgCar({ tipo: 'erro', texto: r.erro ?? 'Não foi possível gerar o carrossel.' });
      }
    });
  }

  const resetar = (f: () => void) => { f(); setFixos(new Set(Object.keys(sel))); setLimite(POR_PAGINA); };
  const campo = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm';

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {vits.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={vitrine === g.id}
            onClick={() => resetar(() => { setVitrine((v) => (v === g.id ? '' : g.id)); setModo('escolhidos'); setEditor(null); })}
            style={{ backgroundColor: vitrine === g.id ? '#eff6ff' : '#ffffff' }}
            className={`min-w-0 rounded-2xl border p-3 text-left shadow-sm transition sm:p-4 ${vitrine === g.id ? 'border-blue-500' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <p className="text-2xl font-semibold tabular-nums text-slate-900">{contagem(g.id)}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-slate-600 sm:text-sm">{g.nome}</p>
            {!g.ad_group_id && <p className="mt-1 text-[11px] font-medium text-amber-700">Entra no Google às 6h30</p>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setEditor({ nome: '', bairros: [], tipos: [], preco_min: null, preco_max: null, publico: ['1001773'] }); setVitrine(''); }}
          style={{ backgroundColor: '#ffffff' }}
          className="rounded-2xl border border-dashed border-slate-300 p-3 text-left text-sm font-semibold text-blue-700 hover:border-blue-400 sm:p-4"
        >
          + Nova vitrine
          <span className="mt-1 block text-xs font-normal text-slate-500">Por bairro, tipo e faixa de valor</span>
        </button>
      </div>

      {editor && (
        <EditorVitrine
          key={editor.id ?? 'nova'}
          inicial={editor}
          bairros={bairros}
          tipos={tipos}
          geo={geo}
          onFechar={() => setEditor(null)}
          onSalvo={(v) => {
            setVits((l) => (l.some((x) => x.id === v.id) ? l.map((x) => (x.id === v.id ? { ...x, ...v, ad_group_id: x.ad_group_id } : x)) : [...l, v]));
            setEditor(null);
            resetar(() => { setVitrine(v.id); setModo('escolher'); });
            setMsg({ tipo: 'ok', texto: 'Vitrine salva' });
          }}
          onArquivado={(id) => {
            setVits((l) => l.filter((x) => x.id !== id));
            setSel((s) => {
              const n: Record<string, string[]> = {};
              for (const [k, v] of Object.entries(s)) { const r = v.filter((x) => x !== id); if (r.length) n[k] = r; }
              return n;
            });
            setEditor(null);
            setVitrine('');
            setMsg({ tipo: 'ok', texto: 'Vitrine arquivada' });
          }}
        />
      )}

      {vAtiva && !editor && (
        <div style={{ backgroundColor: '#ffffff' }} className="mt-4 rounded-2xl border border-slate-200 p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{vAtiva.nome}</p>
              <p className="mt-0.5 text-sm text-slate-600">{resumoVitrine(vAtiva)}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Público: {vAtiva.publico.map((g) => geoNome.get(g) ?? g).join(', ')}
              </p>
            </div>
            <button type="button"
              onClick={() => setEditor({ id: vAtiva.id, nome: vAtiva.nome, bairros: vAtiva.bairros, tipos: vAtiva.tipos, preco_min: vAtiva.preco_min, preco_max: vAtiva.preco_max, publico: vAtiva.publico })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Editar
            </button>
          </div>
          <div className="mt-3 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
            {(['escolhidos', 'escolher'] as const).map((m) => (
              <button key={m} type="button" onClick={() => resetar(() => setModo(m))}
                className={`rounded-md px-3 py-1.5 font-medium ${modo === m ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>
                {m === 'escolhidos' ? `Escolhidos (${contagem(vAtiva.id)})` : 'Escolher pelos filtros da vitrine'}
              </button>
            ))}
          </div>
        </div>
      )}

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
        <span><b className="tabular-nums text-slate-900">{lista.length.toLocaleString('pt-BR')}</b> {vitrine && modo === 'escolhidos' ? 'imóveis nesta vitrine' : 'imóveis à venda'}</span>
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
            {vitrine && modo === 'escolhidos'
              ? 'Nenhum imóvel escolhido nesta vitrine ainda. Toque em "Escolher pelos filtros da vitrine".'
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
              className={`flex flex-col gap-3 rounded-2xl border p-3 shadow-sm sm:flex-row ${g.length ? 'border-blue-400' : carrossel.includes(i.codigo) ? 'border-pink-400' : 'border-slate-200'}`}>
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Google Ads</span>
                  {vits.length === 0 && <span className="text-xs text-slate-400">crie uma vitrine acima</span>}
                  {(vAtiva ? [vAtiva, ...vits.filter((x) => x.id !== vAtiva.id && g.includes(x.id))] : vits).map((gr) => {
                    const ativo = g.includes(gr.id);
                    return (
                      <label key={gr.id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${ativo ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        style={ativo ? undefined : { backgroundColor: '#ffffff' }}>
                        <input type="checkbox" className="size-3.5 accent-white" checked={ativo} onChange={() => alternar(i.codigo, gr.id)} />
                        {gr.nome}
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Instagram</span>
                  {(() => {
                    const noCar = carrossel.includes(i.codigo);
                    const cheio = !noCar && carrossel.length >= MAX_CARROSSEL;
                    return (
                      <label
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${noCar ? 'border-pink-600 bg-pink-600 text-white' : 'border-slate-200 text-slate-600'} ${cheio ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-slate-300'}`}
                        style={noCar ? undefined : { backgroundColor: '#ffffff' }}
                        title={cheio ? `O carrossel aceita no máximo ${MAX_CARROSSEL} imóveis` : undefined}>
                        <input type="checkbox" className="size-3.5" checked={noCar} disabled={cheio}
                          onChange={() => { setMsgCar(null); setCarrossel((c) => (noCar ? c.filter((x) => x !== i.codigo) : [...c, i.codigo])); }} />
                        Carrossel de curadoria
                      </label>
                    );
                  })()}
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

      {carrosseis.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Carrosséis recentes</h2>
          <ul className="mt-2 grid gap-2">
            {carrosseis.map((c) => (
              <li key={c.id} style={{ backgroundColor: '#ffffff' }}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{c.bairro_nome ?? 'Curadoria'} · {c.qtd_imoveis ?? 0} imóveis</span>
                <span className={c.status === 'postado' ? 'text-emerald-700' : c.status === 'erro' ? 'text-red-700' : 'text-slate-500'}>
                  {STATUS_CARROSSEL[c.status ?? ''] ?? c.status}
                  {c.created_at ? ` · ${new Date(c.created_at).toLocaleDateString('pt-BR')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(carrossel.length > 0 || msgCar) && (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-pink-200 px-4 pt-3 sm:mx-0 sm:rounded-2xl sm:border"
          style={{ backgroundColor: '#fdf2f8', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
          {carrossel.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-pink-800">
                Carrossel Instagram: {carrossel.length}/{MAX_CARROSSEL}
              </span>
              <input value={tituloCar} onChange={(e) => setTituloCar(e.target.value)} maxLength={40}
                placeholder="Título (ex.: Jardim Paulista)" aria-label="Título do carrossel"
                className="min-w-0 flex-1 rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm text-slate-900" />
              <button type="button" disabled={enviandoCar} onClick={enviarCarrossel}
                className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {enviandoCar ? 'Enviando…' : 'Gerar carrossel'}
              </button>
              <button type="button" onClick={() => setCarrossel([])} className="text-sm text-slate-600">Limpar</button>
            </div>
          )}
          {msgCar && <p className={`mt-2 text-sm ${msgCar.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{msgCar.texto}</p>}
        </div>
      )}
    </div>
  );
}
