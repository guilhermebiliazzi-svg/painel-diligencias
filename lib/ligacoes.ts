// Lista de ligações (/ligacoes): contatos de proprietários de cada corretor,
// ligações registradas e follow-up. Tabelas: ligacoes_contatos e
// ligacoes_registros (sql/2026-11_ligacoes.sql). Para o novato na trilha do Max,
// cada ligação também vira uma linha em onb_contatos (placar do Max).

export type Origem = 'frog' | 'posicionamento' | 'iconatus' | 'portal' | 'indicacao' | 'outro';
export type Status = 'a_ligar' | 'sem_resposta' | 'conversou' | 'retornar' | 'v1_marcada' | 'sem_interesse' | 'nao_ligar';
export type Resultado = Exclude<Status, 'a_ligar'>;

export const ORIGENS: Record<Origem, string> = {
  frog: 'Lista F.R.O.G.',
  posicionamento: 'Condomínio do posicionamento',
  iconatus: 'Iconatus',
  portal: 'Anúncio de portal',
  indicacao: 'Indicação',
  outro: 'Outro',
};

export const STATUS: Record<Status, { rotulo: string; cor: string }> = {
  a_ligar: { rotulo: 'A ligar', cor: 'bg-slate-100 text-slate-700' },
  sem_resposta: { rotulo: 'Não atendeu', cor: 'bg-amber-100 text-amber-800' },
  conversou: { rotulo: 'Conversou', cor: 'bg-blue-100 text-blue-800' },
  retornar: { rotulo: 'Retornar', cor: 'bg-violet-100 text-violet-800' },
  v1_marcada: { rotulo: 'V1 marcada', cor: 'bg-emerald-100 text-emerald-800' },
  sem_interesse: { rotulo: 'Sem interesse', cor: 'bg-slate-100 text-slate-500' },
  nao_ligar: { rotulo: 'Não ligar mais', cor: 'bg-rose-100 text-rose-700' },
};

// Resultado de uma ligação: rótulo do botão e em quantos dias sugerir o próximo contato
// (null = sem follow-up; o corretor pode mudar a data).
export const RESULTADOS: { chave: Resultado; rotulo: string; dias: number | null }[] = [
  { chave: 'sem_resposta', rotulo: 'Não atendeu', dias: 2 },
  { chave: 'conversou', rotulo: 'Conversou', dias: 30 },
  { chave: 'retornar', rotulo: 'Pediu retorno', dias: 7 },
  { chave: 'v1_marcada', rotulo: 'Marcou V1', dias: null },
  { chave: 'sem_interesse', rotulo: 'Sem interesse', dias: 90 },
  { chave: 'nao_ligar', rotulo: 'Não ligar mais', dias: null },
];

// Status que saem da fila de follow-up
export const ENCERRADOS: Status[] = ['v1_marcada', 'nao_ligar'];

// Espelho no placar do Max (onb_contatos)
export const RESULTADO_ONB: Record<Resultado, string> = {
  sem_resposta: 'tentativa',
  conversou: 'contato_efetivo',
  retornar: 'retornar',
  v1_marcada: 'v1_agendada',
  sem_interesse: 'sem_interesse',
  nao_ligar: 'sem_interesse',
};
export const FONTE_ONB: Record<Origem, string> = {
  frog: 'frog',
  posicionamento: 'territorio',
  iconatus: 'iconatus',
  portal: 'portal',
  indicacao: 'outro',
  outro: 'outro',
};

export const so = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '');

// '11987654321' -> '(11) 98765-4321'
export function telefoneBr(t: string | null | undefined): string {
  let d = so(t);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(t ?? '');
}

export function linkWhats(t: string | null | undefined): string | null {
  let d = so(t);
  if (d.length < 10) return null;
  if (!d.startsWith('55')) d = '55' + d;
  return `https://wa.me/${d}`;
}

export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(data + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// '2026-11-03' -> '03/11'
export const dm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');
