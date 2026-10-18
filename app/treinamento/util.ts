// Utilidades da tela de Treinamento de novatos (trilha do Max).
// Tabelas onb_* (Supabase): onb_novatos, onb_tarefas, onb_trilha, onb_quiz,
// onb_visitas, onb_contatos, onb_mensagens e a view onb_placar.

export const TOTAL_DIAS = 26;

const DIAS_NOME = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function nomeDias(dias: number[] | null | undefined): string {
  if (!dias || dias.length === 0) return 'segunda a sábado';
  return dias.map((d) => DIAS_NOME[d] ?? String(d)).join(', ');
}

// Data de hoje em São Paulo, no formato AAAA-MM-DD.
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// '2026-10-20' -> '20/10'
export function dm(data: string | null | undefined): string {
  if (!data) return '—';
  const [, m, d] = data.slice(0, 10).split('-');
  return `${d}/${m}`;
}

// '2026-10-20' -> 'ter 20/10'
export function diaSemanaDm(data: string): string {
  const [y, m, d] = data.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const sem = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dt).replace('.', '');
  return `${sem} ${dm(data)}`;
}

// timestamptz -> '16/10 08:34' (horário de São Paulo)
export function dataHora(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts)).replace(',', '');
}

export function telefone(p: string | null | undefined): string {
  const d = String(p ?? '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : d;
}

export type StatusTarefa = 'pendente' | 'entregue' | 'aprovada' | 'reprovada' | 'dispensada';

export const STATUS_TAREFA: Record<StatusTarefa, { rotulo: string; classe: string }> = {
  aprovada: { rotulo: 'Aprovada', classe: 'bg-emerald-100 text-emerald-800' },
  entregue: { rotulo: 'Entregue', classe: 'bg-blue-100 text-blue-800' },
  reprovada: { rotulo: 'Refazer', classe: 'bg-rose-100 text-rose-800' },
  dispensada: { rotulo: 'Dispensada', classe: 'bg-slate-100 text-slate-600' },
  pendente: { rotulo: 'Pendente', classe: 'bg-amber-100 text-amber-800' },
};

export const STATUS_NOVATO: Record<string, string> = {
  ativo: 'bg-emerald-100 text-emerald-800',
  pausado: 'bg-amber-100 text-amber-800',
  concluido: 'bg-blue-100 text-blue-800',
  desligado: 'bg-slate-200 text-slate-600',
};

// Sábado é opcional na trilha: tarefa de sábado só vence na segunda.
export function prazo(data: string): string {
  const [y, m, d] = data.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  if (dt.getUTCDay() === 6) dt.setUTCDate(dt.getUTCDate() + 2);
  return dt.toISOString().slice(0, 10);
}

export function atrasada(t: { status: string; data_prevista: string }, hoje: string): boolean {
  return (t.status === 'pendente' || t.status === 'reprovada') && prazo(t.data_prevista) < hoje;
}

// Início da janela de 24h do WhatsApp (com folga de 10 min): quem escreveu depois
// disso pode receber texto livre; antes, só pelo modelo aprovado.
export function inicioJanela(): string {
  return new Date(Date.now() - (23 * 60 + 50) * 60 * 1000).toISOString();
}
