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
    .like('telefone', '%' + fim8)
    .gte('created_at', new Date(new Date(criadoEm).getTime() - 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}
