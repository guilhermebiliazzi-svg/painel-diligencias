// Última e próxima tentativa de emissão de uma certidão que ainda não foi concluída.
// Só servidor.
//
// Não existe coluna "próxima tentativa": quem reprocessa são os agendamentos do n8n.
// Aqui reproduzimos as MESMAS regras (consultas e horários conferidos em 12/11/2026):
//
//  WF-09 Watchdog  — roda de 2 em 2 h no minuto 30, horas ÍMPARES em UTC (00:30, 02:30… de Brasília)
//      pendente          : 10 min depois de criada, até 3 tentativas
//      em_processamento  : com erro, 2 h depois da última atualização, até 5 tentativas
//      erro_infosimples  : 30 min depois da última atualização, até 5 tentativas
//  WF-15 e-SAJ (TJSP)  — de 2 em 2 h, minuto 0, horas ÍMPARES em UTC
//      aguardando_email / em_processamento com número de pedido, pedido nos últimos 60 dias
//  WF-06 E-mail — de 2 em 2 h, minuto 0, horas ÍMPARES em UTC (14/11: inclui o TJCE)
//      aguardando_email dos tipos que chegam por e-mail (TRF, TJSP e-SAJ, TJCE)
//  WF-16 eproc (TJSP 1º grau) — 03, 09, 15 e 21 h UTC (00, 06, 12 e 18 h de Brasília)
//      em_processamento / erro_infosimples com número de pedido, até 12 tentativas,
//      criada há menos de 7 dias, espera 1 h, 2 h, 4 h e depois 6 h (teto desde 12/11)
//
// Se algum desses agendamentos mudar no n8n, este arquivo precisa acompanhar.
import { pool } from '@/lib/db';

export type Retentativa = {
  /** última vez que o sistema mexeu no card (ISO) */
  ultima: string | null;
  /** quando o próximo agendamento vai pegar o card (ISO); null = não há nova tentativa automática */
  proxima: string | null;
  /** explicação curta quando não há próxima tentativa */
  semProxima?: string;
};

const ESAJ = new Set(['tjsp_civeis', 'tjsp_falencia', 'tjsp_inventarios', 'tjsp_criminais', 'tjsp_exec_crim']);
/** Certidões que o órgão manda por e-mail e o WF-06 baixa da caixa. */
const POR_EMAIL = new Set(['trf_civel', 'trf_criminal', 'tjce_pf', ...ESAJ]);
const H = 3600_000;
const FINAIS = new Set(['concluido', 'aguardando_match', 'cancelada', 'com_pendencias']);

/** Primeiro horário >= desde em que o agendamento roda (minuto fixo, horas UTC aceitas). */
function proximoDisparo(desde: Date, minuto: number, horaOk: (h: number) => boolean): Date {
  let t = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate(), desde.getUTCHours(), minuto);
  if (t < desde.getTime()) t += H;
  for (let i = 0; i < 48; i++, t += H) if (horaOk(new Date(t).getUTCHours())) return new Date(t);
  return new Date(t);
}
const impar = (h: number) => h % 2 === 1;
const wf16Hora = (h: number) => h === 3 || h === 9 || h === 15 || h === 21;

type Linha = {
  id: string;
  tipo: string;
  status: string | null;
  erro: string | null;
  tentativas: number | null;
  tentativas_obter: number | null;
  numero_pedido: string | null;
  pedido_data: Date | null;
  pasta_id: string | null;
  manual: boolean | null;
  drive_file_id: string | null;
  criado_em: Date;
  atualizado_em: Date | null;
};

export function calcularRetentativa(c: Linha, agora = new Date()): Retentativa | null {
  if (c.manual || (c.drive_file_id && c.drive_file_id !== '')) return null;
  const st = c.status || '';
  if (FINAIS.has(st)) return null;

  const atu = c.atualizado_em ? new Date(c.atualizado_em) : null;
  const criado = new Date(c.criado_em);
  const tent = c.tentativas ?? 0;
  const tentObter = c.tentativas_obter ?? 0;
  const ultima = tent + tentObter > 0 || c.erro ? (atu ? atu.toISOString() : null) : null;
  const max = (a: Date, b: Date) => (a > b ? a : b);
  const cands: Date[] = [];

  // WF-09
  if (st === 'pendente' && tent < 3) cands.push(proximoDisparo(max(agora, new Date(criado.getTime() + 10 * 60_000)), 30, impar));
  if (st === 'em_processamento' && c.erro && tent < 5 && atu) cands.push(proximoDisparo(max(agora, new Date(atu.getTime() + 2 * H)), 30, impar));
  if (st === 'erro_infosimples' && tent < 5 && atu) cands.push(proximoDisparo(max(agora, new Date(atu.getTime() + 30 * 60_000)), 30, impar));

  const temPedido = !!(c.numero_pedido && c.numero_pedido.trim());

  // WF-15 (e-SAJ)
  if (
    ESAJ.has(c.tipo) && temPedido && c.pedido_data && c.pasta_id &&
    ['aguardando_email', 'em_processamento', 'baixando_esaj'].includes(st) &&
    new Date(c.pedido_data).getTime() >= agora.getTime() - 60 * 24 * H
  ) cands.push(proximoDisparo(agora, 0, impar));

  // WF-06 (e-mail do órgão): confere a caixa de 2 em 2 h
  if (POR_EMAIL.has(c.tipo) && st === 'aguardando_email') cands.push(proximoDisparo(agora, 0, impar));

  // WF-16 (eproc)
  if (
    c.tipo === 'tjsp_civel_1g' && temPedido && ['em_processamento', 'erro_infosimples'].includes(st) &&
    tentObter < 12 && criado.getTime() > agora.getTime() - 7 * 24 * H && atu
  ) {
    const espera = H * Math.min(Math.pow(2, Math.min(tentObter, 6)), 6); // 12/11: dobra até travar em 6 h
    const desde = max(agora, new Date(atu.getTime() + espera));
    if (desde.getTime() < criado.getTime() + 7 * 24 * H) cands.push(proximoDisparo(desde, 0, wf16Hora));
  }

  if (cands.length) {
    const prox = cands.reduce((a, b) => (a < b ? a : b));
    return { ultima, proxima: prox.toISOString() };
  }

  let semProxima = 'sem nova tentativa automática — use Reemitir';
  if (st === 'aguardando_origem') semProxima = 'aguardando o órgão emissor — sem nova tentativa automática';
  else if ((st === 'pendente' && tent >= 3) || tent >= 5 || tentObter >= 12) semProxima = 'tentativas automáticas esgotadas — use Reemitir';
  return { ultima, proxima: null, semProxima };
}

/** Mapa certidão -> retentativa para todos os cards de uma diligência do motor. */
export async function retentativasDaDiligencia(diligenciaId: string): Promise<Map<string, Retentativa>> {
  const out = new Map<string, Retentativa>();
  if (!/^[0-9a-f-]{36}$/i.test(diligenciaId)) return out;
  const r = await pool.query(
    `SELECT id::text AS id, tipo, status, erro, tentativas, tentativas_obter, numero_pedido, pedido_data,
            pasta_id, manual, drive_file_id, criado_em, atualizado_em
       FROM certidoes_status
      WHERE diligencia_id = $1`,
    [diligenciaId]
  );
  const agora = new Date();
  for (const c of r.rows as Linha[]) {
    const x = calcularRetentativa(c, agora);
    if (x) out.set(c.id, x);
  }
  return out;
}
