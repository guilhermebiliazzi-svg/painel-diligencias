// Oficinas da loja (/oficinas). O monitor registra a presença e o checklist do
// encontro na sua oficina e acessa o material de apoio; cada corretor vê as suas
// oficinas e marca o checklist de aplicação; o administrador vê tudo, o mapa por
// corretor e define os monitores. Tabelas: onb_oficinas, onb_oficina_monitores,
// onb_oficina_presencas, onb_oficina_materiais, onb_oficina_check_itens e
// onb_oficina_check_marcas (sql/2026-11_oficinas.sql).
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { exigirPerfil, corretorDaPessoa, type Perfil } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type Oficina = { id: number; slug: string; nome: string; ordem: number };
export type Monitor = { id: number; oficina_id: number; corretor_id: number; dia_semana: number | null; periodo: string | null };
export type Material = { id: number; oficina_id: number; publico: 'monitor' | 'participante'; titulo: string; url: string };

export type CheckItem = { id: number; oficina_id: number; publico: 'monitor' | 'participante'; texto: string; ordem: number };

// Primeiro dia da grade: antes disso não há presença a cobrar.
export const INICIO_OFICINAS = '2026-11-09';

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

function somarDias(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// 1 = segunda ... 6 = sábado (0 = domingo)
const diaDaSemana = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

// Próxima data (hoje inclusive) em que a oficina acontece, pelos dias dos monitores.
export function proximaData(monitores: Pick<Monitor, 'dia_semana'>[], hoje: string): string | null {
  const dias = new Set(monitores.map((m) => m.dia_semana).filter((d): d is number => !!d));
  if (!dias.size) return null;
  let d = hoje < INICIO_OFICINAS ? INICIO_OFICINAS : hoje;
  for (let i = 0; i < 7; i++, d = somarDias(d, 1)) if (dias.has(diaDaSemana(d))) return d;
  return null;
}

// Encontros da grade (últimos 14 dias, até ontem) sem nenhuma presença registrada.
export function semPresenca(
  monitores: Pick<Monitor, 'oficina_id' | 'dia_semana'>[],
  presencas: { oficina_id: number; data: string }[],
  hoje: string,
): { oficina_id: number; data: string }[] {
  const feitos = new Set(presencas.map((p) => `${Number(p.oficina_id)}|${p.data}`));
  const slots = new Set(monitores.filter((m) => m.dia_semana).map((m) => `${Number(m.oficina_id)}|${m.dia_semana}`));
  const out: { oficina_id: number; data: string }[] = [];
  for (let d = somarDias(hoje, -14); d < hoje; d = somarDias(d, 1)) {
    if (d < INICIO_OFICINAS) continue;
    for (const s of slots) {
      const [of, dia] = s.split('|').map(Number);
      if (dia === diaDaSemana(d) && !feitos.has(`${of}|${d}`)) out.push({ oficina_id: of, data: d });
    }
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

export type Progresso = {
  presencas: Map<number, string[]>; // oficina_id -> datas (mais recente primeiro)
  marcados: Set<number>;            // itens de aplicação marcados
};

// Presenças e checklist de aplicação de vários corretores de uma vez.
export async function progressoCorretores(ids: number[]): Promise<Map<number, Progresso>> {
  const out = new Map<number, Progresso>();
  for (const id of ids) out.set(id, { presencas: new Map(), marcados: new Set() });
  if (!ids.length) return out;
  const sb = supabaseAdmin();
  const [pre, mar] = await Promise.all([
    sb.from('onb_oficina_presencas').select('oficina_id,data,corretor_id').in('corretor_id', ids).order('data', { ascending: false }).limit(10000),
    sb.from('onb_oficina_check_marcas').select('item_id,corretor_id').in('corretor_id', ids).limit(10000),
  ]);
  for (const p of (pre.data ?? []) as { oficina_id: number; data: string; corretor_id: number }[]) {
    const g = out.get(Number(p.corretor_id));
    if (!g) continue;
    const k = Number(p.oficina_id);
    g.presencas.set(k, [...(g.presencas.get(k) ?? []), p.data]);
  }
  for (const m of (mar.data ?? []) as { item_id: number; corretor_id: number }[]) out.get(Number(m.corretor_id))?.marcados.add(Number(m.item_id));
  return out;
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

// Admin vê todas; monitor gerencia as suas; todo corretor vê as próprias oficinas.
export const acessoOficinas = cache(async (): Promise<AcessoOficinas> => {
  const perfil = await exigirPerfil();
  const eu = await corretorDaPessoa(perfil.email);
  const minhas = await oficinasDoCorretor(eu?.id ?? null);
  const admin = !!perfil.is_admin;
  if (!admin && !eu) redirect('/sem-acesso');
  return { perfil, admin, meuId: eu?.id ?? null, minhas };
});

export function podeOficina(a: AcessoOficinas, oficinaId: number): boolean {
  return a.admin || a.minhas.includes(oficinaId);
}

// Ficha do novato (/treinamento): acha o corretor pelo telefone (últimos 8 dígitos)
// e devolve as oficinas com a presença e o checklist de aplicação dele.
export async function oficinasDoNovato(phone: string | null): Promise<
  { oficina: Oficina; datas: string[]; aplic: number; total: number }[] | null
> {
  const fim = String(phone ?? '').replace(/\D/g, '').slice(-8);
  if (fim.length < 8) return null;
  try {
    const sb = supabaseAdmin();
    const { data: cs } = await sb.from('corretores_associados').select('id,phone').ilike('phone', `%${fim.slice(-4)}%`);
    const c = ((cs ?? []) as { id: number; phone: string | null }[]).find((x) => String(x.phone ?? '').replace(/\D/g, '').slice(-8) === fim);
    if (!c) return null;
    const [ofi, its, prog] = await Promise.all([
      sb.from('onb_oficinas').select('id,slug,nome,ordem').eq('ativa', true).order('ordem'),
      sb.from('onb_oficina_check_itens').select('id,oficina_id').eq('publico', 'participante').eq('ativo', true),
      progressoCorretores([Number(c.id)]),
    ]);
    if (ofi.error) return null;
    const p = prog.get(Number(c.id))!;
    const itens = (its.data ?? []) as { id: number; oficina_id: number }[];
    return ((ofi.data ?? []) as Oficina[]).map((o) => {
      const doTema = itens.filter((i) => Number(i.oficina_id) === Number(o.id));
      return {
        oficina: o,
        datas: p.presencas.get(Number(o.id)) ?? [],
        aplic: doTema.filter((i) => p.marcados.has(Number(i.id))).length,
        total: doTema.length,
      };
    });
  } catch {
    return null;
  }
}
