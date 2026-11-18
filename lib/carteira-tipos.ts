// 18/11: Carteira do corretor — catálogo do checklist de comercialização, tipos de atividade da agenda e
// critérios da avaliação. Arquivo "puro" (sem banco), usado pelas páginas e pelos componentes do cliente.

export const CHECKLIST: { k: string; t: string; dica?: string }[] = [
  { k: 'fotos', t: 'Fotos profissionais', dica: 'agende e registre o dia das fotos' },
  { k: 'anuncio_ilist', t: 'Anúncio no iList' },
  { k: 'anuncio_nonstop', t: 'Anúncio no Nonstop' },
  { k: 'carrossel', t: 'Carrossel no Instagram' },
  { k: 'reels', t: 'Reels publicado' },
  { k: 'youtube', t: 'Vídeo no YouTube' },
  { k: 'parceiros', t: 'Divulgado para parceiros', dica: 'corretores e imobiliárias parceiras' },
  { k: 'impressos', t: 'Materiais impressos', dica: 'placa, folheto, ficha' },
  { k: 'zelador', t: 'Conversa com zelador e porteiros' },
];
export const CHECKLIST_K = new Set(CHECKLIST.map((c) => c.k));

export const AGENDA: { k: string; t: string }[] = [
  { k: 'visita', t: 'Visita com cliente' },
  { k: 'reuniao', t: 'Reunião com o proprietário' },
  { k: 'fotos', t: 'Sessão de fotos' },
  { k: 'revisao_preco', t: 'Revisão de preço' },
  { k: 'open_house', t: 'Open house' },
  { k: 'renovacao', t: 'Renovação do contrato' },
  { k: 'outro', t: 'Outra atividade' },
];
export const AGENDA_K = new Set(AGENDA.map((a) => a.k));

export const rotuloTipo = (k: string) =>
  AGENDA.find((a) => a.k === k)?.t ?? CHECKLIST.find((c) => c.k === k)?.t ?? k;

export const CRITERIOS: { k: string; t: string }[] = [
  { k: 'preco', t: 'Preço vs. mercado' },
  { k: 'estado', t: 'Estado de conservação' },
  { k: 'localizacao', t: 'Localização' },
  { k: 'documentacao', t: 'Documentação' },
  { k: 'proprietario', t: 'Proprietário (abertura, disponibilidade)' },
];

export const CLASSES: { k: 'A' | 'B' | 'C'; t: string; cor: string }[] = [
  { k: 'A', t: 'A · vende rápido', cor: 'bg-emerald-100 text-emerald-800' },
  { k: 'B', t: 'B · precisa de ajuste', cor: 'bg-amber-100 text-amber-800' },
  { k: 'C', t: 'C · difícil', cor: 'bg-red-100 text-red-800' },
];

/** Situação do contrato de representação pelo vencimento (data em AAAA-MM-DD). */
export function situacaoContrato(fim: string | null, hoje: string): { k: 'vencido' | 'vence' | 'ok' | 'sem'; t: string; cor: string; dias: number | null } {
  if (!fim) return { k: 'sem', t: 'sem vencimento', cor: 'bg-slate-100 text-slate-500', dias: null };
  const dias = Math.round((Date.parse(fim + 'T12:00:00Z') - Date.parse(hoje + 'T12:00:00Z')) / 864e5);
  if (dias < 0) return { k: 'vencido', t: `vencido há ${-dias} ${dias === -1 ? 'dia' : 'dias'}`, cor: 'bg-red-100 text-red-700', dias };
  if (dias <= 60) return { k: 'vence', t: dias === 0 ? 'vence hoje' : `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, cor: 'bg-amber-100 text-amber-800', dias };
  return { k: 'ok', t: 'em vigor', cor: 'bg-emerald-50 text-emerald-700', dias };
}
