// Oficinas da loja (/oficinas). O monitor registra a presença dos corretores na
// sua oficina e acessa o material de apoio; o administrador vê todas e define os
// monitores. Tabelas: onb_oficinas, onb_oficina_monitores, onb_oficina_presencas,
// onb_oficina_materiais (sql/2026-11_oficinas.sql).
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { exigirPerfil, corretorDaPessoa, type Perfil } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type Oficina = { id: number; slug: string; nome: string; ordem: number };
export type Monitor = { id: number; oficina_id: number; corretor_id: number; dia_semana: number | null; periodo: string | null };
export type Material = { id: number; oficina_id: number; publico: 'monitor' | 'participante'; titulo: string; url: string };

export const DIAS = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const PERIODOS: Record<string, string> = { manha: 'manhã', tarde: 'tarde' };

export function diaMonitor(m: Pick<Monitor, 'dia_semana' | 'periodo'>): string {
  if (!m.dia_semana) return 'dia a definir';
  return DIAS[m.dia_semana] + (m.periodo ? ` à ${PERIODOS[m.periodo] ?? m.periodo}` : '');
}

// "Fulano de Tal - CRECI ..." -> "Fulano de Tal"
export const nomeCurto = (n: string | null | undefined) => String(n ?? '').split(' - ')[0].trim();

export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// '2026-11-03' -> 'ter 03/11/2026'
export function dataLonga(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd, 12));
  const sem = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dt).replace('.', '');
  return `${sem} ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

// Oficinas de que a pessoa é monitora (vazio se não for, ou se as tabelas ainda não existirem).
async function oficinasDoCorretor(corretorId: number | null): Promise<number[]> {
  if (!corretorId) return [];
  const { data, error } = await supabaseAdmin().from('onb_oficina_monitores').select('oficina_id').eq('corretor_id', corretorId);
  if (error) return [];
  return [...new Set(((data ?? []) as { oficina_id: number }[]).map((r) => Number(r.oficina_id)))];
}

// Para o card no início: a pessoa é monitora de alguma oficina?
export async function ehMonitor(email: string): Promise<boolean> {
  try {
    const eu = await corretorDaPessoa(email);
    return (await oficinasDoCorretor(eu?.id ?? null)).length > 0;
  } catch {
    return false;
  }
}

export type AcessoOficinas = { perfil: Perfil; admin: boolean; meuId: number | null; minhas: number[] };

// Admin vê todas; monitor vê as suas; os demais não entram.
export const acessoOficinas = cache(async (): Promise<AcessoOficinas> => {
  const perfil = await exigirPerfil();
  const eu = await corretorDaPessoa(perfil.email);
  const minhas = await oficinasDoCorretor(eu?.id ?? null);
  const admin = !!perfil.is_admin;
  if (!admin && minhas.length === 0) redirect('/sem-acesso');
  return { perfil, admin, meuId: eu?.id ?? null, minhas };
});

export function podeOficina(a: AcessoOficinas, oficinaId: number): boolean {
  return a.admin || a.minhas.includes(oficinaId);
}
