'use client';

// Ficha de captação → mensagem pronta para a Eva fazer o estudo de mercado.
// O corretor preenche na visita e envia tudo de uma vez pelo WhatsApp.
// O rascunho fica só no navegador de quem preenche (localStorage).

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

const EVA_PHONE = '5511930837789';
const DRAFT_KEY = 'ficha_eva_draft';

type Tipo = 'ap' | 'casa' | 'sala';
type Campo = {
  id: string;
  label: string;
  type: 'text' | 'money' | 'num' | 'yn' | 'chips' | 'select' | 'textarea';
  suf?: string;
  items?: string[];
  showIf?: [string, string];
  half?: boolean;
  full?: boolean;
  req?: boolean;
  placeholder?: string;
  hint?: string;
};
type Secao = { num: string; h: string; note?: string; hint?: string; fields: Campo[] };
type Valor = string | string[];

const F = (id: string, label: string, o: Partial<Campo> = {}): Campo => ({ id, label, type: 'text', ...o });
const money = (id: string, label: string, suf: string, o: Partial<Campo> = {}) => F(id, label, { type: 'money', suf, ...o });
const num = (id: string, label: string, suf: string, o: Partial<Campo> = {}) => F(id, label, { type: 'num', suf, ...o });
const yn = (id: string, label: string, o: Partial<Campo> = {}) => F(id, label, { type: 'yn', ...o });
const chips = (id: string, label: string, items: string[], o: Partial<Campo> = {}) => F(id, label, { type: 'chips', items, ...o });
const sel = (id: string, label: string, items: string[], o: Partial<Campo> = {}) => F(id, label, { type: 'select', items, ...o });

const ESTADO = ['', 'original (sem reforma)', 'bom (padrão do prédio)', 'reformado'];
const MERCADO: Secao = {
  num: '4', h: 'Situação de mercado',
  note: 'Contexto pra conversa com o proprietário — anúncio e propostas ficam FORA do cálculo do estudo.',
  fields: [
    yn('anunciado', 'Já está anunciado?'),
    F('anunciado_desde', 'Desde quando', { showIf: ['anunciado', 'sim'], half: true, placeholder: 'ex.: jun/2026' }),
    money('anunciado_valor', 'Por quanto', '', { showIf: ['anunciado', 'sim'], half: true }),
    yn('propostas', 'Recebeu propostas?'),
    money('proposta_valor', 'Valor da proposta', '', { showIf: ['propostas', 'sim'], half: true }),
    F('proposta_quando', 'Quando', { showIf: ['propostas', 'sim'], half: true, placeholder: 'ex.: ago/2026' }),
  ],
};
const CONCORR: Secao = {
  num: '5', h: 'Concorrência (opcional)',
  note: 'A Eva também busca comparáveis automáticos (REMAX, QuintoAndar e Ville Jardins) e o ITBI do prédio.',
  fields: [F('concorrentes', 'Concorrentes que deseja incluir (links ou endereços)', { type: 'textarea', full: true })],
};

const FORMS: Record<Tipo, { label: string; sections: Secao[] }> = {
  ap: {
    label: 'Apartamento',
    sections: [
      { num: '1', h: 'Sobre o imóvel', fields: [
        F('endereco', 'Endereço (rua, número e apartamento)', { full: true, req: true, placeholder: 'ex.: R. Treze de Maio, 1203 — ap 91' }),
        F('condominio', 'Condomínio (nome)', { half: true }),
        F('bairro', 'Bairro', { half: true }),
        num('area_util', 'Área útil', 'm²', { half: true, req: true }),
        num('area_iptu', 'Área total (IPTU)', 'm²', { half: true }),
        num('dorms', 'Dormitórios', '', { half: true }),
        num('suites', 'Suítes', '', { half: true }),
        num('vagas', 'Vagas', '', { half: true }),
        num('ano', 'Ano do prédio', '', { half: true }),
        num('andar', 'Andar', '', { half: true }),
        F('vista', 'Posição / vista', { half: true }),
        sel('estado', 'Estado de conservação', ESTADO, { full: true }),
      ] },
      { num: '2', h: 'Reforma', hint: 'A Eva classifica o padrão da reforma e incorpora o valor à precificação, depreciado pelo uso.', fields: [
        yn('reformado', 'Reformado nos últimos 10 anos?'),
        num('reforma_ano', 'Em que ano', '', { showIf: ['reformado', 'sim'], half: true }),
        chips('reforma_itens', 'O que foi feito', ['marcenaria', 'pisos/revestimentos', 'banheiros', 'cozinha', 'elétrica/hidráulica', 'reforma completa'], { showIf: ['reformado', 'sim'], full: true }),
        F('reforma_outros', 'Outros', { showIf: ['reformado', 'sim'], full: true }),
      ] },
      { num: '3', h: 'Decisão de preço (vender rápido × segurar)', fields: [
        yn('mora', 'O proprietário mora no imóvel?'),
        yn('alugado', 'Está alugado?'),
        money('aluguel', 'Aluguel', '/mês', { showIf: ['alugado', 'sim'], half: true }),
        money('cond_mes', 'Condomínio', '/mês', { half: true }),
        money('iptu', 'IPTU', '/ano', { half: true }),
        money('alvo', 'Preço-alvo do proprietário', '', { full: true, hint: 'se não souber, tudo bem' }),
        yn('porteira', 'Venda porteira fechada (mobília inclusa)?'),
        money('mobilia', 'Valor estimado da mobília', '', { showIf: ['porteira', 'sim'], full: true }),
      ] },
      MERCADO, CONCORR,
    ],
  },
  casa: {
    label: 'Casa · Terreno',
    sections: [
      { num: '1', h: 'Sobre o imóvel', fields: [
        F('endereco', 'Endereço (rua e número)', { full: true, req: true }),
        sel('casa_tipo', 'Tipo', ['', 'casa térrea', 'sobrado', 'casa de vila', 'casa em condomínio', 'terreno vazio'], { half: true }),
        F('bairro', 'Bairro', { half: true }),
        F('condominio', 'Condomínio / vila (nome, se houver)', { full: true }),
        num('area_terreno', 'Área do TERRENO', 'm²', { half: true, req: true }),
        num('area_construida', 'Área construída', 'm²', { half: true }),
        num('testada', 'Testada', 'm', { half: true }),
        num('ano', 'Ano da construção', '', { half: true }),
        num('dorms', 'Dormitórios', '', { half: true }),
        num('suites', 'Suítes', '', { half: true }),
        num('vagas', 'Vagas', '', { half: true }),
        sel('estado', 'Estado de conservação', ESTADO, { half: true }),
      ] },
      { num: '2', h: 'Uso atual e renda', fields: [
        sel('uso', 'Uso atual', ['', 'residência própria', 'alugada', 'estacionamento', 'vazio', 'outro'], { half: true }),
        money('renda', 'Renda mensal (se gera)', '/mês', { half: true }),
        F('uso_outro', 'Outro uso', { showIf: ['uso', 'outro'], full: true }),
      ] },
      { num: '3', h: 'Reforma (se houver construção)', fields: [
        yn('reformado', 'Reformada nos últimos 10 anos?'),
        num('reforma_ano', 'Em que ano', '', { showIf: ['reformado', 'sim'], half: true }),
        chips('reforma_itens', 'O que foi feito', ['telhado', 'elétrica/hidráulica', 'pisos', 'banheiros/cozinha', 'fachada', 'reforma completa'], { showIf: ['reformado', 'sim'], full: true }),
        F('reforma_outros', 'Outros', { showIf: ['reformado', 'sim'], full: true }),
      ] },
      { num: '3', h: 'Decisão de preço', fields: [
        yn('mora', 'O proprietário mora no imóvel?'),
        money('cond_mes', 'Condomínio (se houver)', '/mês', { half: true }),
        money('iptu', 'IPTU', '/ano', { half: true }),
        money('alvo', 'Preço-alvo do proprietário', '', { full: true, hint: 'se não souber, tudo bem' }),
        yn('porteira', 'Venda porteira fechada (mobília inclusa)?'),
        money('mobilia', 'Valor estimado da mobília', '', { showIf: ['porteira', 'sim'], full: true }),
      ] },
      MERCADO, CONCORR,
    ],
  },
  sala: {
    label: 'Sala comercial',
    sections: [
      { num: '1', h: 'Sobre o imóvel', fields: [
        F('endereco', 'Endereço (rua e número)', { full: true, req: true }),
        F('conjunto', 'Conjunto / sala nº', { half: true }),
        sel('sala_tipo', 'Tipo', ['', 'sala/conjunto', 'laje', 'loja'], { half: true }),
        F('edificio', 'Edifício (nome)', { half: true }),
        F('bairro', 'Bairro', { half: true }),
        num('area_util', 'Área útil', 'm²', { half: true, req: true }),
        num('area_iptu', 'Área total (IPTU)', 'm²', { half: true }),
        num('banheiros', 'Banheiros', '', { half: true }),
        num('vagas', 'Vagas', '', { half: true }),
        num('andar', 'Andar', '', { half: true }),
        num('ano', 'Ano do prédio', '', { half: true }),
        F('vista', 'Posição / vista', { half: true }),
        sel('estado', 'Estado de conservação', ESTADO, { half: true }),
      ] },
      { num: '2', h: 'Reforma', fields: [
        yn('reformado', 'Reformada nos últimos 10 anos?'),
        num('reforma_ano', 'Em que ano', '', { showIf: ['reformado', 'sim'], half: true }),
        chips('reforma_itens', 'O que foi feito', ['pisos/revestimentos', 'banheiros', 'elétrica/ar-cond.', 'divisórias', 'reforma completa'], { showIf: ['reformado', 'sim'], full: true }),
        F('reforma_outros', 'Outros', { showIf: ['reformado', 'sim'], full: true }),
      ] },
      { num: '3', h: 'Decisão de preço (vender rápido × segurar)', fields: [
        yn('usa', 'O proprietário usa a sala?'),
        yn('alugado', 'Está alugada?'),
        money('aluguel', 'Aluguel', '/mês', { showIf: ['alugado', 'sim'], half: true }),
        money('cond_mes', 'Condomínio', '/mês', { half: true }),
        money('iptu', 'IPTU', '/ano', { half: true }),
        money('alvo', 'Preço-alvo do proprietário', '', { full: true, hint: 'se não souber, tudo bem' }),
        yn('porteira', 'Venda porteira fechada (mobiliário incluso)?'),
        money('mobilia', 'Valor estimado do mobiliário', '', { showIf: ['porteira', 'sim'], full: true }),
      ] },
      MERCADO, CONCORR,
    ],
  },
};

const fmtBR = (v: string) => {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? String(v) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
};
const R$ = (v: string) => 'R$ ' + fmtBR(v);
const line = (arr: (string | false | null | undefined)[], sep = ' · ') => arr.filter(Boolean).join(sep);

function montarMensagem(tipo: Tipo, vals: Record<string, Valor>): string {
  const g = (id: string): string | null => {
    const v = vals[tipo + '.' + id];
    if (Array.isArray(v)) return null;
    return v && String(v).trim() ? String(v).trim() : null;
  };
  const ga = (id: string): string[] => {
    const v = vals[tipo + '.' + id];
    return Array.isArray(v) ? v : [];
  };
  const L: string[] = [];
  L.push('📋 *Ficha de captação — estudo de mercado*');
  L.push('');
  L.push('*Tipo:* ' + (tipo === 'ap' ? 'Apartamento' : tipo === 'casa' ? (g('casa_tipo') || 'Casa / terreno') : line([g('sala_tipo') || 'Sala comercial', g('conjunto') && 'conj. ' + g('conjunto')])));
  L.push('*Endereço:* ' + (g('endereco') || ''));
  const cond = tipo === 'sala' ? g('edificio') : g('condominio');
  if (cond || g('bairro')) L.push(line([cond && '*' + (tipo === 'sala' ? 'Edifício' : 'Condomínio') + ':* ' + cond, g('bairro') && '*Bairro:* ' + g('bairro')]));
  if (tipo === 'casa') {
    L.push(line([g('area_terreno') && '*Terreno:* ' + fmtBR(g('area_terreno')!) + ' m²', g('area_construida') && '*Construída:* ' + fmtBR(g('area_construida')!) + ' m²', g('testada') && '*Testada:* ' + fmtBR(g('testada')!) + ' m']));
  } else {
    L.push(line([g('area_util') && '*Área útil:* ' + fmtBR(g('area_util')!) + ' m²', g('area_iptu') && '*Área IPTU:* ' + fmtBR(g('area_iptu')!) + ' m²']));
  }
  const dv = line([
    g('dorms') && '*Dorms:* ' + g('dorms') + (g('suites') ? ' (' + g('suites') + ' suíte' + (g('suites') === '1' ? '' : 's') + ')' : ''),
    g('banheiros') && '*Banheiros:* ' + g('banheiros'),
    g('vagas') && '*Vagas:* ' + g('vagas'),
    g('andar') && '*Andar:* ' + g('andar'),
  ]);
  if (dv) L.push(dv);
  if (g('ano')) L.push('*Ano do prédio/construção:* ' + g('ano'));
  if (g('vista')) L.push('*Posição/vista:* ' + g('vista'));
  if (g('estado')) L.push('*Estado:* ' + g('estado'));
  if (tipo === 'casa' && (g('uso') || g('renda'))) {
    L.push(line([g('uso') && '*Uso atual:* ' + (g('uso') === 'outro' ? g('uso_outro') || 'outro' : g('uso')), g('renda') && '*Renda:* ' + R$(g('renda')!) + '/mês']));
  }
  L.push('');
  if (g('reformado') === 'sim') {
    const it = ga('reforma_itens').concat(g('reforma_outros') ? [g('reforma_outros')!] : []);
    L.push('*Reforma:* sim' + (g('reforma_ano') ? ', em ' + g('reforma_ano') : '') + (it.length ? ' — ' + it.join(', ') : ''));
  } else if (g('reformado') === 'não') {
    L.push('*Reforma nos últimos 10 anos:* não');
  }
  const mora = g(tipo === 'sala' ? 'usa' : 'mora');
  const alug = g('alugado');
  if (mora || alug) {
    let occ: string;
    if (mora === 'sim') occ = tipo === 'sala' ? 'o proprietário usa a sala' : 'o proprietário mora no imóvel';
    else if (alug === 'sim') occ = 'alugado' + (g('aluguel') ? ' por ' + R$(g('aluguel')!) + '/mês' : '');
    else if (mora === 'não' && alug === 'não') occ = 'desocupado (ninguém mora, não está alugado)';
    else occ = line([mora && (tipo === 'sala' ? 'usa' : 'mora') + ': ' + mora, alug && 'alugado: ' + alug]);
    L.push('*Ocupação:* ' + occ);
  }
  const custos = line([g('cond_mes') && '*Condomínio:* ' + R$(g('cond_mes')!) + '/mês', g('iptu') && '*IPTU:* ' + R$(g('iptu')!) + '/ano']);
  if (custos) L.push(custos);
  if (g('alvo')) L.push('*Preço-alvo do proprietário:* ' + R$(g('alvo')!));
  if (g('porteira') === 'sim') L.push('*Porteira fechada:* sim — mobília inclusa' + (g('mobilia') ? ', estimada em ' + R$(g('mobilia')!) : ''));
  const mercado: string[] = [];
  if (g('anunciado') === 'sim') mercado.push('já anunciado' + (g('anunciado_desde') ? ' desde ' + g('anunciado_desde') : '') + (g('anunciado_valor') ? ' por ' + R$(g('anunciado_valor')!) : ''));
  else if (g('anunciado') === 'não') mercado.push('não está anunciado');
  if (g('propostas') === 'sim') mercado.push('proposta' + (g('proposta_valor') ? ' de ' + R$(g('proposta_valor')!) : '') + (g('proposta_quando') ? ' em ' + g('proposta_quando') : ''));
  else if (g('propostas') === 'não') mercado.push('sem propostas');
  if (mercado.length) {
    L.push('');
    L.push('*Mercado (só contexto — fora do cálculo):* ' + mercado.join('; '));
  }
  if (g('concorrentes')) {
    L.push('');
    L.push('*Concorrentes a incluir:*');
    L.push(g('concorrentes')!);
  }
  L.push('');
  L.push('Esses são os dados da captação. Me faz o estudo de mercado completo, por favor.');
  return L.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export default function Ficha() {
  const [tipo, setTipo] = useState<Tipo>('ap');
  const [vals, setVals] = useState<Record<string, Valor>>({});
  const [carregado, setCarregado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [armado, setArmado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerArm = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rascunho salvo no navegador
  useEffect(() => {
    // Lido depois da montagem (o servidor não tem localStorage).
    queueMicrotask(() => {
      try {
        const s = localStorage.getItem(DRAFT_KEY);
        if (s) {
          const d = JSON.parse(s);
          if (d?.vals) setVals(d.vals);
          if (d?.tipo && d.tipo in FORMS) setTipo(d.tipo);
        }
      } catch { /* sem rascunho */ }
      setCarregado(true);
    });
  }, []);
  useEffect(() => {
    if (!carregado) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ tipo, vals })); } catch { /* ignora */ }
  }, [tipo, vals, carregado]);

  const cfg = FORMS[tipo];
  const get = (id: string) => vals[tipo + '.' + id];
  const set = (id: string, v: Valor) => setVals((o) => ({ ...o, [tipo + '.' + id]: v }));

  const preenchidos = useMemo(() => {
    let n = 0;
    for (const s of cfg.sections) for (const f of s.fields) {
      const v = vals[tipo + '.' + f.id];
      if (Array.isArray(v) ? v.length : v !== undefined && String(v).trim() !== '') n++;
    }
    return n;
  }, [cfg, vals, tipo]);
  const faltando = useMemo(() => {
    const out: string[] = [];
    for (const s of cfg.sections) for (const f of s.fields) {
      const v = vals[tipo + '.' + f.id];
      if (f.req && !(v && String(v).trim())) out.push(f.label.split('(')[0].trim());
    }
    return out;
  }, [cfg, vals, tipo]);
  const mensagem = useMemo(() => montarMensagem(tipo, vals), [tipo, vals]);
  const href = faltando.length ? '#' : 'https://wa.me/' + EVA_PHONE + '?text=' + encodeURIComponent(mensagem);

  function avisar(t: string) {
    setAviso(t);
    if (timerAviso.current) clearTimeout(timerAviso.current);
    timerAviso.current = setTimeout(() => setAviso(null), 3500);
  }
  function guardar(e: React.MouseEvent) {
    if (faltando.length) {
      e.preventDefault();
      avisar('Falta preencher: ' + faltando.join(', '));
    }
  }
  function limpar() {
    if (!armado) {
      setArmado(true);
      timerArm.current = setTimeout(() => setArmado(false), 3500);
      return;
    }
    if (timerArm.current) clearTimeout(timerArm.current);
    setArmado(false);
    setVals((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith(tipo + '.'))));
    avisar('Ficha limpa — pronta pra próxima captação.');
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { avisar('Não consegui copiar. Selecione o texto e copie.'); }
  }

  return (
    <div className="fe">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Open+Sans:wght@400;600;700&display=swap" precedence="default" />
      <div className="fe-wrap">
        <Link href="/" className="fe-back">← Painel</Link>
        <div className="fe-kicker">ESTUDO DE MERCADO · EVA</div>
        <h1>Ficha de captação</h1>
        <p className="fe-lede">Preencha na visita e envie tudo de uma vez — a Eva devolve o estudo pronto em uma conversa só.</p>

        <div className="fe-tabs" role="tablist">
          {(Object.keys(FORMS) as Tipo[]).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tipo === t} onClick={() => { setTipo(t); window.scrollTo({ top: 0 }); }}>
              {FORMS[t].label}
            </button>
          ))}
        </div>

        <div className="fe-clearrow">
          <button type="button" className={`fe-clear${armado ? ' arm' : ''}`} onClick={limpar}>
            <span aria-hidden="true">🗑</span> {armado ? 'Tocar de novo pra apagar tudo' : 'Limpar ficha'}
          </button>
        </div>

        <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          {cfg.sections.map((sec, si) => (
            <section key={tipo + si}>
              <div className="fe-shead"><span className="fe-snum">{sec.num}</span><h2>{sec.h}</h2></div>
              {sec.note && <p className="fe-snote">{sec.note}</p>}
              <div className="fe-grid">
                {sec.fields.map((f) => {
                  if (f.showIf && get(f.showIf[0]) !== f.showIf[1]) return null;
                  const v = get(f.id);
                  const sv = typeof v === 'string' ? v : '';
                  return (
                    <div key={f.id} className={`fe-f ${f.half && !f.full ? 'half' : 'full'}`}>
                      <label>
                        {f.label}
                        {f.req && <span className="req"> *</span>}
                        {f.hint && <span style={{ fontWeight: 400 }}> ({f.hint})</span>}
                      </label>
                      {f.type === 'yn' ? (
                        <div className="fe-yn">
                          {['sim', 'não'].map((o) => (
                            <button key={o} type="button" aria-pressed={sv === o} onClick={() => set(f.id, sv === o ? '' : o)}>{o}</button>
                          ))}
                        </div>
                      ) : f.type === 'chips' ? (
                        <div className="fe-chips">
                          {f.items!.map((it) => {
                            const on = Array.isArray(v) ? v : [];
                            const ativo = on.includes(it);
                            return (
                              <button key={it} type="button" className="fe-chip" aria-pressed={ativo}
                                onClick={() => set(f.id, ativo ? on.filter((x) => x !== it) : [...on, it])}>{it}</button>
                            );
                          })}
                        </div>
                      ) : f.type === 'select' ? (
                        <div className="fe-in"><select value={sv} onChange={(e) => set(f.id, e.target.value)}>
                          {f.items!.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
                        </select></div>
                      ) : f.type === 'textarea' ? (
                        <div className="fe-in"><textarea value={sv} placeholder={f.placeholder} onChange={(e) => set(f.id, e.target.value)} /></div>
                      ) : (
                        <div className="fe-in">
                          {f.type === 'money' && <span className="pre">R$</span>}
                          <input value={sv} placeholder={f.placeholder} inputMode={f.type === 'money' || f.type === 'num' ? 'decimal' : undefined}
                            onChange={(e) => set(f.id, e.target.value)} />
                          {f.suf && <span className="suf">{f.suf}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {sec.hint && <div className="fe-hint"><span>💡</span><span>{sec.hint}</span></div>}
            </section>
          ))}
        </form>
        <footer>REMAX Ville · Estudo de mercado com a Eva</footer>
      </div>

      <div className="fe-bar"><div className="fe-barin">
        <div className="fe-count">{preenchidos} {preenchidos === 1 ? 'campo' : 'campos'}</div>
        <button className="fe-ghost" type="button" onClick={() => dlg.current?.showModal()}>Ver texto</button>
        <a className="fe-send" href={href} target="_blank" rel="noopener noreferrer" aria-disabled={faltando.length > 0} onClick={guardar}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.9-1.4A10 10 0 1 0 12 2Zm5.5 14.1c-.2.7-1.3 1.3-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4-.1.7.5.2.6.8 2 .9 2.1.1.2.1.3 0 .5s-.2.4-.3.5l-.5.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.5.3.2.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 .9c.3.2.5.2.6.4.1.1.1.7-.1 1.5Z" /></svg>
          Enviar pra Eva
        </a>
      </div></div>

      <dialog ref={dlg} className="fe-dlg">
        <div className="fe-dlghead"><h3>Mensagem pra Eva</h3><button type="button" aria-label="Fechar" onClick={() => dlg.current?.close()}>×</button></div>
        <pre className="fe-msg">{mensagem}</pre>
        <div className="fe-dlgbar">
          <button className="fe-ghost" type="button" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar texto'}</button>
          <a className="fe-send" href={href} target="_blank" rel="noopener noreferrer" aria-disabled={faltando.length > 0} onClick={guardar}>Abrir no WhatsApp</a>
        </div>
      </dialog>

      {aviso && <div className="fe-toast" role="status">{aviso}</div>}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
.fe{--navy:#10243F;--red:#E4002B;--ink:#1A2332;--muted:#5D6B7E;--ground:#F4F7FA;--card:#FFFFFF;--line:#D8E0EA;--ice:#EAF1FB;--wa:#1A9E50;--focus:#2563EB;--on:#10243F;--on-ink:#FFFFFF;--danger:#B42318;--head:'Archivo',system-ui,sans-serif;--body:'Open Sans',system-ui,sans-serif;
  background:var(--ground);color:var(--ink);font:15px/1.55 var(--body);min-height:100vh;padding-bottom:110px}
.fe *{box-sizing:border-box}
.fe-wrap{max-width:640px;margin:0 auto;padding:20px 16px 0}
.fe-back{display:inline-block;color:var(--muted);font:600 13px/1 var(--head);text-decoration:none;margin-bottom:14px}
.fe-back:hover{color:var(--navy)}
.fe-kicker{display:flex;align-items:center;gap:9px;color:var(--red);font:700 11px/1 var(--head);letter-spacing:.22em}
.fe-kicker::before{content:"";width:9px;height:9px;background:var(--red);flex:0 0 auto}
.fe h1{font:800 27px/1.15 var(--head);color:var(--navy);margin:10px 0 6px;text-wrap:balance}
.fe-lede{color:var(--muted);margin:0 0 18px;max-width:46ch}
.fe-tabs{display:flex;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:5px;margin-bottom:22px}
.fe-tabs button{flex:1;border:0;background:transparent;color:var(--muted);font:600 13.5px/1.2 var(--head);padding:10px 4px;border-radius:8px;cursor:pointer}
.fe-tabs button[aria-selected="true"]{background:var(--navy);color:var(--card)}
.fe button:focus-visible,.fe a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.fe section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 18px 8px;margin-bottom:16px}
.fe-shead{display:flex;align-items:baseline;gap:10px;margin:0 0 4px}
.fe-snum{font:800 12px/1 var(--head);color:var(--red);letter-spacing:.08em}
.fe-shead h2{font:700 16px/1.25 var(--head);color:var(--navy);margin:0}
.fe-snote{color:var(--muted);font-size:12.5px;margin:2px 0 12px}
.fe-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 14px}
.fe-f{min-width:0}
.fe-f.full{grid-column:1/-1}
.fe-f label{display:block;font:600 12px/1.3 var(--head);color:var(--muted);margin-bottom:5px}
.fe-f label .req{color:var(--red)}
.fe-in{display:flex;align-items:center;background:var(--ground);border:1px solid var(--line);border-radius:9px}
.fe-in:focus-within{border-color:var(--focus)}
.fe-in input,.fe-in select,.fe-in textarea{width:100%;border:0;background:transparent;color:var(--ink);font:400 15px/1.4 var(--body);padding:9px 11px;min-width:0}
.fe-in input:focus,.fe-in select:focus,.fe-in textarea:focus{outline:none}
.fe-in textarea{resize:vertical;min-height:64px}
.fe-in .pre,.fe-in .suf{color:var(--muted);font-size:13px;padding:0 0 0 11px;white-space:nowrap}
.fe-in .suf{padding:0 11px 0 0}
.fe-in input[inputmode]{font-variant-numeric:tabular-nums}
.fe-yn{display:flex;gap:6px}
.fe-yn button{flex:1;border:1px solid var(--line);background:var(--ground);color:var(--muted);font:600 13.5px/1 var(--head);padding:10px 0;border-radius:9px;cursor:pointer}
.fe-yn button[aria-pressed="true"]{background:var(--on);color:var(--on-ink);border-color:var(--on)}
.fe-chips{display:flex;flex-wrap:wrap;gap:7px}
.fe-chip{border:1px solid var(--line);background:var(--ground);color:var(--ink);font:600 13px/1 var(--body);padding:9px 13px;border-radius:999px;cursor:pointer}
.fe-chip[aria-pressed="true"]{background:var(--on);color:var(--on-ink);border-color:var(--on)}
.fe-hint{display:flex;gap:8px;background:var(--ice);border-radius:9px;padding:9px 12px;margin:2px 0 14px;color:var(--muted);font-size:12.5px}
.fe-clearrow{display:flex;justify-content:flex-end;margin:-8px 0 12px}
.fe-clear{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--card);color:var(--navy);font:600 13px/1 var(--head);cursor:pointer;padding:9px 14px;border-radius:999px}
.fe-clear.arm{color:#fff;background:var(--danger);border-color:var(--danger)}
.fe-bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px));z-index:20}
.fe-barin{max-width:640px;margin:0 auto;display:flex;gap:10px;align-items:center}
.fe-count{color:var(--muted);font:600 12px/1.3 var(--head);min-width:70px}
.fe-send{flex:1;display:flex;align-items:center;justify-content:center;gap:9px;background:var(--wa);color:#fff;border:0;border-radius:11px;font:700 15px/1 var(--head);padding:14px 10px;cursor:pointer;text-decoration:none}
.fe-send[aria-disabled="true"]{opacity:.45;cursor:not-allowed}
.fe-ghost{border:1px solid var(--line);background:transparent;color:var(--navy);border-radius:11px;font:600 13px/1 var(--head);padding:14px;cursor:pointer;white-space:nowrap}
.fe-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:88px;background:var(--navy);color:#fff;font:600 13px/1.4 var(--body);padding:10px 16px;border-radius:10px;max-width:calc(100vw - 40px);box-shadow:0 6px 20px rgba(8,15,26,.25);z-index:50}
.fe-dlg{border:0;border-radius:16px;background:var(--card);color:var(--ink);max-width:560px;width:calc(100vw - 32px);padding:0}
.fe-dlg::backdrop{background:rgba(8,15,26,.55)}
.fe-dlghead{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 0}
.fe-dlghead h3{font:700 16px/1.2 var(--head);color:var(--navy);margin:0}
.fe-dlghead button{border:0;background:transparent;color:var(--muted);font-size:20px;cursor:pointer;padding:4px 8px}
.fe-msg{background:var(--ground);border:1px solid var(--line);border-radius:10px;margin:12px 18px;padding:14px;white-space:pre-wrap;word-break:break-word;font:13px/1.55 var(--body);max-height:46vh;overflow:auto}
.fe-dlgbar{display:flex;gap:10px;padding:0 18px 18px}
.fe footer{color:var(--muted);font-size:11.5px;text-align:center;margin:8px 0 12px}
@media (max-width:430px){.fe-grid .half{grid-column:1/-1}}
`;
