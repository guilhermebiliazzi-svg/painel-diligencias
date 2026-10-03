'use server';

// Vitrine Google Ads — grava em quais regiões do público cada imóvel aparece.
// Só admin. Grupo vazio = imóvel fora da campanha (a linha é apagada).
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const GRUPOS = ['jardins', 'zonasul', 'demais'] as const;

export async function salvarGrupos(codigo: string, grupos: string[]): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  const cod = String(codigo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(cod)) return { ok: false, erro: 'Código de imóvel inválido.' };
  const limpos = Array.from(new Set(grupos)).filter((g): g is (typeof GRUPOS)[number] =>
    (GRUPOS as readonly string[]).includes(g)
  );

  const sb = supabaseAdmin();
  const { error } = limpos.length
    ? await sb.from('ads_vitrine_selecao').upsert(
        { codigo: cod, grupos: limpos, atualizado_em: new Date().toISOString(), atualizado_por: eu.email },
        { onConflict: 'codigo' }
      )
    : await sb.from('ads_vitrine_selecao').delete().eq('codigo', cod);

  if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message };
  return { ok: true };
}
