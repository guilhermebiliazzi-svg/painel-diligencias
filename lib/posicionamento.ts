// Posicionamento: mapa de condomínios de uma região, por corretor.
// Arquivo "puro" (sem banco): campos do formulário, prioridade sugerida e os
// indicadores do painel. Usado pela página e pelas server actions.

export type StatusRel = 'nao_iniciado' | 'primeiro_contato' | 'em_relacionamento' | 'referencia';
export type Prioridade = 'A' | 'B' | 'C';

export type Condominio = {
  id: number;
  corretor_id: number;
  regiao: string;
  nome: string;
  endereco: string | null;
  bairro: string | null;
  cep: string | null;
  construtora: string | null;
  ano_entrega: number | null;
  torres: number | null;
  andares: number | null;
  unidades: number | null;
  metragem_min: number | null;
  metragem_max: number | null;
  dormitorios: string | null;
  vagas: string | null;
  padrao: string | null;
  lazer: string | null;
  taxa_condominio: number | null;
  valor_m2_min: number | null;
  valor_m2_max: number | null;
  anuncios_ativos: number | null;
  vendas_12m: number | null;
  tempo_medio_venda: number | null;
  locacoes_ativas: number | null;
  imobiliarias: string | null;
  placas: number | null;
  exclusividades_conc: number | null;
  corretor_referencia: string | null;
  status_relacionamento: StatusRel;
  administradora: string | null;
  sindico_nome: string | null;
  sindico_contato: string | null;
  zelador_nome: string | null;
  portaria_contato: string | null;
  proprietarios_conhecidos: number | null;
  negocios_ville: number | null;
  ultimo_contato: string | null;
  proxima_acao: string | null;
  proxima_acao_data: string | null;
  prioridade_manual: Prioridade | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type TipoCampo = 'texto' | 'int' | 'num' | 'data' | 'longo' | 'select';
export type DefCampo = {
  k: keyof Condominio;
  label: string;
  tipo: TipoCampo;
  dica?: string;
  opcoes?: [string, string][];
  obrigatorio?: boolean;
  largo?: boolean;
};

export const STATUS_REL: Record<StatusRel, [string, string]> = {
  nao_iniciado: ['Não iniciado', 'bg-slate-100 text-slate-600'],
  primeiro_contato: ['Primeiro contato', 'bg-amber-100 text-amber-700'],
  em_relacionamento: ['Em relacionamento', 'bg-blue-100 text-blue-700'],
  referencia: ['Sou referência', 'bg-emerald-100 text-emerald-700'],
};

export const PADRAO: [string, string][] = [
  ['', '—'], ['economico', 'Econômico'], ['medio', 'Médio'], ['alto', 'Alto'], ['luxo', 'Luxo'],
];

export const BLOCOS: { titulo: string; descricao: string; campos: DefCampo[] }[] = [
  {
    titulo: 'Dados do condomínio',
    descricao: 'O que todo corretor da região deveria saber de cor sobre o prédio.',
    campos: [
      { k: 'nome', label: 'Nome do condomínio', tipo: 'texto', obrigatorio: true },
      { k: 'endereco', label: 'Endereço (rua e número)', tipo: 'texto', largo: true },
      { k: 'bairro', label: 'Bairro', tipo: 'texto' },
      { k: 'cep', label: 'CEP', tipo: 'texto' },
      { k: 'construtora', label: 'Construtora', tipo: 'texto' },
      { k: 'ano_entrega', label: 'Ano de entrega', tipo: 'int' },
      { k: 'torres', label: 'Torres', tipo: 'int' },
      { k: 'andares', label: 'Andares', tipo: 'int' },
      { k: 'unidades', label: 'Total de unidades', tipo: 'int', dica: 'Soma de todas as torres.' },
      { k: 'metragem_min', label: 'Metragem mínima (m²)', tipo: 'num' },
      { k: 'metragem_max', label: 'Metragem máxima (m²)', tipo: 'num' },
      { k: 'dormitorios', label: 'Dormitórios', tipo: 'texto', dica: 'Ex.: 3 a 4 (2 suítes)' },
      { k: 'vagas', label: 'Vagas', tipo: 'texto', dica: 'Ex.: 2 a 3' },
      { k: 'padrao', label: 'Padrão', tipo: 'select', opcoes: PADRAO },
      { k: 'taxa_condominio', label: 'Condomínio (R$/mês, média)', tipo: 'num' },
      { k: 'lazer', label: 'Lazer e diferenciais', tipo: 'longo', largo: true, dica: 'Piscina, academia, portaria 24h, depósito, pet place…' },
    ],
  },
  {
    titulo: 'Mercado',
    descricao: 'Preço e liquidez. Use a ACM da Eva, os portais e o histórico de ITBI.',
    campos: [
      { k: 'valor_m2_min', label: 'Valor do m² — mínimo (R$)', tipo: 'num' },
      { k: 'valor_m2_max', label: 'Valor do m² — máximo (R$)', tipo: 'num' },
      { k: 'anuncios_ativos', label: 'Anúncios de venda ativos', tipo: 'int', dica: 'Unidades diferentes, não anúncios repetidos.' },
      { k: 'vendas_12m', label: 'Vendas nos últimos 12 meses', tipo: 'int', dica: 'ITBI / informações da portaria.' },
      { k: 'tempo_medio_venda', label: 'Tempo médio de venda (dias)', tipo: 'int' },
      { k: 'locacoes_ativas', label: 'Anúncios de locação ativos', tipo: 'int' },
    ],
  },
  {
    titulo: 'Concorrência',
    descricao: 'Quem já atua no prédio e quão fechado ele está.',
    campos: [
      { k: 'imobiliarias', label: 'Imobiliárias atuando', tipo: 'texto', largo: true, dica: 'Separe por vírgula. Ex.: Lopes, Coelho da Fonseca, corretor autônomo' },
      { k: 'placas', label: 'Placas na fachada/janelas', tipo: 'int' },
      { k: 'exclusividades_conc', label: 'Exclusividades de concorrentes', tipo: 'int' },
      { k: 'corretor_referencia', label: 'Quem é a referência do prédio hoje', tipo: 'texto', dica: 'Corretor ou imobiliária que o zelador indica.' },
    ],
  },
  {
    titulo: 'Relacionamento',
    descricao: 'Sua presença no prédio. É isso que transforma o mapa em posicionamento.',
    campos: [
      {
        k: 'status_relacionamento', label: 'Status do relacionamento', tipo: 'select',
        opcoes: (Object.keys(STATUS_REL) as StatusRel[]).map((s) => [s, STATUS_REL[s][0]]),
      },
      { k: 'administradora', label: 'Administradora', tipo: 'texto' },
      { k: 'sindico_nome', label: 'Síndico(a)', tipo: 'texto' },
      { k: 'sindico_contato', label: 'Contato do síndico', tipo: 'texto' },
      { k: 'zelador_nome', label: 'Zelador / gerente predial', tipo: 'texto' },
      { k: 'portaria_contato', label: 'Telefone da portaria', tipo: 'texto' },
      { k: 'proprietarios_conhecidos', label: 'Proprietários que você conhece', tipo: 'int' },
      { k: 'negocios_ville', label: 'Negócios da Ville no prédio', tipo: 'int', dica: 'Captações, vendas e locações já feitas.' },
      { k: 'ultimo_contato', label: 'Último contato no prédio', tipo: 'data' },
      { k: 'proxima_acao', label: 'Próxima ação', tipo: 'texto', largo: true, dica: 'Ex.: levar o estudo de mercado ao zelador' },
      { k: 'proxima_acao_data', label: 'Data da próxima ação', tipo: 'data' },
    ],
  },
];

export const CAMPOS: DefCampo[] = BLOCOS.flatMap((b) => b.campos);

// Campos que fazem a ficha contar como "completa" no painel.
const ESSENCIAIS: (keyof Condominio)[] = [
  'endereco', 'unidades', 'metragem_min', 'padrao', 'valor_m2_min', 'valor_m2_max', 'anuncios_ativos',
  'vendas_12m', 'imobiliarias', 'zelador_nome',
];

const vazio = (v: unknown) => v === null || v === undefined || v === '';

export function completude(c: Condominio): number {
  const ok = ESSENCIAIS.filter((k) => !vazio(c[k])).length;
  return Math.round((ok / ESSENCIAIS.length) * 100);
}

// Prioridade sugerida (0–100): potencial do prédio + chance de o corretor ganhar espaço.
//  giro (vendas 12m / unidades) até 30 · tamanho até 20 · oferta ativa até 15
//  relacionamento até 20 · concorrência fechada tira até 15.
export function pontuacao(c: Condominio): number {
  const u = c.unidades ?? 0;
  let p = 0;
  if (u > 0 && c.vendas_12m != null) {
    const giro = c.vendas_12m / u;
    p += giro >= 0.08 ? 30 : giro >= 0.04 ? 20 : giro > 0 ? 10 : 0;
  }
  p += u >= 200 ? 20 : u >= 80 ? 15 : u >= 30 ? 10 : u > 0 ? 5 : 0;
  if (u > 0 && c.anuncios_ativos != null) {
    const of = c.anuncios_ativos / u;
    p += of >= 0.03 ? 15 : of > 0 ? 8 : 0;
  }
  p += { nao_iniciado: 0, primeiro_contato: 8, em_relacionamento: 15, referencia: 20 }[c.status_relacionamento] ?? 0;
  const ex = c.exclusividades_conc ?? 0;
  p += ex === 0 ? 15 : ex <= 2 ? 8 : 0;
  return Math.min(100, p);
}

export function prioridadeSugerida(c: Condominio): Prioridade {
  const p = pontuacao(c);
  return p >= 60 ? 'A' : p >= 35 ? 'B' : 'C';
}

export const prioridade = (c: Condominio): Prioridade => c.prioridade_manual ?? prioridadeSugerida(c);

export const COR_PRIORIDADE: Record<Prioridade, string> = {
  A: 'bg-emerald-600 text-white',
  B: 'bg-amber-500 text-white',
  C: 'bg-slate-400 text-white',
};

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type Resumo = {
  total: number;
  unidades: number;
  completos: number;
  completudeMedia: number;
  comRelacao: number; // em relacionamento ou referência
  referencia: number;
  // % das unidades mapeadas em prédios onde há relacionamento; quando algum prédio
  // está sem o total de unidades, conta prédios (senão o indicador ficaria zerado)
  dominio: number;
  dominioBase: 'unidades' | 'predios';
  sindicos: number;
  zeladores: number;
  proprietarios: number;
  negociosVille: number;
  anuncios: number;
  vendas12m: number;
  m2Min: number | null;
  m2Max: number | null;
  m2Medio: number | null;
  tempoMedio: number | null;
  prioridades: Record<Prioridade, number>;
  concorrentes: [string, number][];
  acoesAtrasadas: Condominio[];
  acoesSemana: Condominio[];
  semAcao: number;
};

export function resumir(lista: Condominio[], hoje: string): Resumo {
  const em7 = new Date(new Date(hoje + 'T12:00:00Z').getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const comRel = lista.filter((c) => c.status_relacionamento === 'em_relacionamento' || c.status_relacionamento === 'referencia');
  const unidades = lista.reduce((a, c) => a + (c.unidades ?? 0), 0);
  const unidRel = comRel.reduce((a, c) => a + (c.unidades ?? 0), 0);
  const porUnidade = lista.length > 0 && lista.every((c) => (c.unidades ?? 0) > 0);
  const conc = new Map<string, number>();
  for (const c of lista) {
    const vistos = new Set<string>();
    for (const n of (c.imobiliarias ?? '').split(/[,;\n]/)) {
      const t = n.trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (vistos.has(k)) continue;
      vistos.add(k);
      const atual = [...conc.keys()].find((x) => x.toLowerCase() === k) ?? t;
      conc.set(atual, (conc.get(atual) ?? 0) + 1);
    }
  }
  const prioridades: Record<Prioridade, number> = { A: 0, B: 0, C: 0 };
  for (const c of lista) prioridades[prioridade(c)]++;
  const m2min = lista.map((c) => c.valor_m2_min).filter((v): v is number => v != null && v > 0);
  const m2max = lista.map((c) => c.valor_m2_max).filter((v): v is number => v != null && v > 0);
  const m2med = lista
    .map((c) => (c.valor_m2_min && c.valor_m2_max ? (c.valor_m2_min + c.valor_m2_max) / 2 : c.valor_m2_min || c.valor_m2_max || null))
    .filter((v): v is number => v != null && v > 0);
  const tempos = lista.map((c) => c.tempo_medio_venda).filter((v): v is number => v != null && v > 0);
  const soma = (k: keyof Condominio) => lista.reduce((a, c) => a + (Number(c[k]) || 0), 0);
  const ordAcao = (a: Condominio, b: Condominio) => String(a.proxima_acao_data).localeCompare(String(b.proxima_acao_data));

  return {
    total: lista.length,
    unidades,
    completos: lista.filter((c) => completude(c) >= 80).length,
    completudeMedia: Math.round(media(lista.map(completude)) ?? 0),
    comRelacao: comRel.length,
    referencia: lista.filter((c) => c.status_relacionamento === 'referencia').length,
    dominio: porUnidade
      ? Math.round((unidRel / unidades) * 100)
      : lista.length ? Math.round((comRel.length / lista.length) * 100) : 0,
    dominioBase: porUnidade ? 'unidades' : 'predios',
    sindicos: lista.filter((c) => !vazio(c.sindico_nome)).length,
    zeladores: lista.filter((c) => !vazio(c.zelador_nome)).length,
    proprietarios: soma('proprietarios_conhecidos'),
    negociosVille: soma('negocios_ville'),
    anuncios: soma('anuncios_ativos'),
    vendas12m: soma('vendas_12m'),
    m2Min: m2min.length ? Math.min(...m2min) : null,
    m2Max: m2max.length ? Math.max(...m2max) : null,
    m2Medio: media(m2med),
    tempoMedio: media(tempos),
    prioridades,
    concorrentes: [...conc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    acoesAtrasadas: lista.filter((c) => c.proxima_acao_data && c.proxima_acao_data < hoje).sort(ordAcao),
    acoesSemana: lista.filter((c) => c.proxima_acao_data && c.proxima_acao_data >= hoje && c.proxima_acao_data <= em7).sort(ordAcao),
    semAcao: lista.filter((c) => !c.proxima_acao_data && c.status_relacionamento !== 'referencia').length,
  };
}

export const brl0 = (n: number | null | undefined) =>
  n == null ? '—' : 'R$ ' + Math.round(n).toLocaleString('pt-BR');
export const int = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('pt-BR'));

// Frase de posicionamento que o corretor usa para se apresentar (só com o que já mapeou).
export function pitch(regiao: string, r: Resumo): string {
  if (!r.total) return '';
  const partes = [
    `Atuo em ${regiao}, onde mapeei ${r.total} condomínio${r.total > 1 ? 's' : ''}${r.unidades ? `, somando ${int(r.unidades)} unidades` : ''}.`,
  ];
  if (r.m2Min && r.m2Max) partes.push(`Hoje o m² na região vai de ${brl0(r.m2Min)} a ${brl0(r.m2Max)}${r.m2Medio ? `, com média de ${brl0(r.m2Medio)}` : ''}.`);
  if (r.vendas12m) partes.push(`Nos últimos 12 meses foram ${int(r.vendas12m)} vendas nesses prédios${r.tempoMedio ? `, em média em ${int(r.tempoMedio)} dias` : ''}.`);
  if (r.anuncios) partes.push(`Neste momento há ${int(r.anuncios)} unidades à venda — conheço cada uma delas.`);
  if (r.comRelacao) partes.push(`Tenho relacionamento direto em ${r.comRelacao} desses prédios${r.zeladores ? ` e falo com ${r.zeladores} zeladores/gerentes` : ''}.`);
  return partes.join(' ');
}
