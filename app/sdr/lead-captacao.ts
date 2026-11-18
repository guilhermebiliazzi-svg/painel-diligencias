// Utilidades do SDR usadas pelo painel (só servidor).
import { supabaseAdmin } from '@/lib/supabase/admin';

// Lead já criado para uma captação da landing (mesmo telefone, criado depois do formulário).
export async function leadDaCaptacao(tel55: string, criadoEm: string): Promise<string | null> {
  const fim8 = tel55.slice(-8);
  const { data } = await supabaseAdmin()
    .from('sdr_leads')
    .select('id,telefone,created_at')
    .eq('origem', 'campanha')
    .ilike('fonte', 'Capta%')
    // 18/11: o telefone pode ter sufixo '#b' (2º lead ativo do mesmo celular) — confere os dígitos aqui
    .like('telefone', '%' + fim8 + '%')
    .gte('created_at', new Date(new Date(criadoEm).getTime() - 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(5);
  return (data ?? []).find((l) => String(l.telefone ?? '').replace(/\D/g, '').slice(-8) === fim8)?.id ?? null;
}
