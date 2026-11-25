// 25/11/2026: encontros de planejamento 2027 (Guilherme com os corretores), na semana de 30/11.
// Página pública /planejamento (link enviado no WhatsApp), lista em /planejamento/lista e lembrete
// na véspera às 18h pelo n8n ("Planejamento 2027 — lembrete da véspera"). Tabela planejamento_2027.
export type Grupo = { n: number; dia: string; inicio: string; fim: string; rotulo: string };

export const GRUPOS: Grupo[] = [
  { n: 1, dia: '2026-11-30', inicio: '13:00', fim: '14:00', rotulo: 'Segunda-feira, 30/11, das 13h às 14h' },
  { n: 2, dia: '2026-11-30', inicio: '15:00', fim: '16:00', rotulo: 'Segunda-feira, 30/11, das 15h às 16h' },
  { n: 3, dia: '2026-12-01', inicio: '09:00', fim: '10:00', rotulo: 'Terça-feira, 01/12, das 9h às 10h' },
  { n: 4, dia: '2026-12-02', inicio: '11:00', fim: '12:00', rotulo: 'Quarta-feira, 02/12, das 11h às 12h' },
  { n: 5, dia: '2026-12-03', inicio: '09:00', fim: '10:00', rotulo: 'Quinta-feira, 03/12, das 9h às 10h' },
  { n: 6, dia: '2026-12-03', inicio: '11:00', fim: '12:00', rotulo: 'Quinta-feira, 03/12, das 11h às 12h' },
];

export const LOCAL = 'REMAX Ville, Rua Batataes, 148 - Jardim Paulista';

// Grupo que já começou não aceita mais agendamento (horário de São Paulo, -03:00).
export const grupoAberto = (g: Grupo, agora = Date.now()) => new Date(`${g.dia}T${g.inicio}:00-03:00`).getTime() > agora;

export const fim8 = (t: unknown) => String(t ?? '').replace(/\D/g, '').slice(-8);
