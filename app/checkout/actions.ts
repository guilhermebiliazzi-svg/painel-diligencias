'use server';

// Check-out do dia: o próprio corretor marca as tarefas que não precisam de avaliação do Max
// (as que antes pediam print). Página pública: o link pessoal é o id do novato (uuid).
// Tarefa com quiz vira "entregue" (falta o quiz com o Max); as demais viram "aprovada".
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hojeSP } from '../treinamento/util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARCA = 'Check-out pelo painel';

type Linha = {
  id: number; novato_id: string; status: string; feedback: string | null; data_prevista: string;
  onb_trilha: { checkout: boolean; quiz_tema: string | null } | null;
};

// sexta pode adiantar o sábado
function limite(hoje: string): string {
  const d = new Date(hoje + 'T12:00:00Z');
  if (d.getUTCDay() === 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function marcarCheckout(novatoId: string, tarefaId: number, feito: boolean): Promise<{ ok: boolean; erro?: string; status?: string }> {
  if (!UUID.test(String(novatoId)) || !Number.isInteger(tarefaId)) return { ok: false, erro: 'Link inválido.' };
  const sb = supabaseAdmin();
  const { data: nov } = await sb.from('onb_novatos').select('id,status').eq('id', novatoId).maybeSingle();
  if (!nov || !['ativo', 'pausado'].includes((nov as { status: string }).status)) return { ok: false, erro: 'Trilha encerrada.' };

  const { data } = await sb.from('onb_tarefas')
    .select('id,novato_id,status,feedback,data_prevista,onb_trilha(checkout,quiz_tema)')
    .eq('id', tarefaId).eq('novato_id', novatoId).maybeSingle();
  const t = data as unknown as Linha | null;
  if (!t || !t.onb_trilha?.checkout) return { ok: false, erro: 'Esta tarefa não é marcada pelo check-out.' };
  if (t.data_prevista > limite(hojeSP())) return { ok: false, erro: 'Esta tarefa ainda não chegou.' };

  if (feito) {
    if (['aprovada', 'dispensada'].includes(t.status)) return { ok: true, status: t.status };
    const status = t.onb_trilha.quiz_tema ? 'entregue' : 'aprovada';
    const { error } = await sb.from('onb_tarefas')
      .update({ status, feedback: MARCA, entregue_em: new Date().toISOString() })
      .eq('id', t.id);
    if (error) return { ok: false, erro: error.message };
    revalidatePath(`/checkout/${novatoId}`);
    return { ok: true, status };
  }
  // desmarcar: só o que foi marcado aqui e ainda não passou pelo quiz
  if (t.feedback !== MARCA) return { ok: false, erro: 'Esta tarefa já foi avaliada pelo Max.' };
  const { error } = await sb.from('onb_tarefas')
    .update({ status: 'pendente', feedback: null, entregue_em: null })
    .eq('id', t.id);
  if (error) return { ok: false, erro: error.message };
  revalidatePath(`/checkout/${novatoId}`);
  return { ok: true, status: 'pendente' };
}
