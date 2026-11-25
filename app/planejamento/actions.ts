'use server';

// 25/11/2026: agendamento do planejamento 2027. Página pública: o corretor se identifica pelo
// WhatsApp cadastrado em corretores_associados e escolhe um grupo (um por corretor; pode trocar).
import { supabaseAdmin } from '@/lib/supabase/admin';
import { GRUPOS, grupoAberto, fim8 } from '@/lib/planejamento';

export type Quem = { ok: true; nome: string; grupo: number | null } | { ok: false; erro: string };
export type Res = { ok: true; msg: string } | { ok: false; erro: string };

type Cor = { id: number; nome: string; phone: string | null; status: string | null };

async function acharCorretor(whats: string): Promise<Cor | null> {
  const f = fim8(whats);
  if (f.length !== 8) return null;
  const { data } = await supabaseAdmin().from('corretores_associados').select('id,nome,phone,status');
  const lista = ((data ?? []) as Cor[]).filter((c) => fim8(c.phone) === f);
  return lista.find((c) => (c.status ?? 'ativo') === 'ativo') ?? null;
}

const primeiro = (n: string) => n.split(' - ')[0].trim().split(/\s+/)[0] || 'corretor';

export async function identificar(whats: string): Promise<Quem> {
  const c = await acharCorretor(whats);
  if (!c) return { ok: false, erro: 'Não encontrei esse WhatsApp no cadastro de corretores da REMAX Ville. Confira o número (com DDD) ou fale com o Guilherme.' };
  const { data } = await supabaseAdmin().from('planejamento_2027').select('grupo').eq('corretor_id', c.id).maybeSingle();
  return { ok: true, nome: primeiro(c.nome), grupo: (data as { grupo: number } | null)?.grupo ?? null };
}

export async function agendar(whats: string, grupo: number): Promise<Res> {
  const g = GRUPOS.find((x) => x.n === Number(grupo));
  if (!g) return { ok: false, erro: 'Escolha um dos grupos.' };
  if (!grupoAberto(g)) return { ok: false, erro: 'Esse horário já passou. Escolha outro grupo.' };
  const c = await acharCorretor(whats);
  if (!c) return { ok: false, erro: 'Não encontrei esse WhatsApp no cadastro de corretores.' };
  const sb = supabaseAdmin();
  const { data: atual } = await sb.from('planejamento_2027').select('grupo').eq('corretor_id', c.id).maybeSingle();
  const ant = (atual as { grupo: number } | null)?.grupo ?? null;
  if (ant && ant !== g.n) {
    const ga = GRUPOS.find((x) => x.n === ant);
    if (ga && !grupoAberto(ga)) return { ok: false, erro: 'Seu encontro (Grupo ' + ant + ') já aconteceu.' };
  }
  const { error } = await sb.from('planejamento_2027').upsert(
    // trocou de grupo: o lembrete volta a valer para o grupo novo
    { corretor_id: c.id, grupo: g.n, atualizado_em: new Date().toISOString(), ...(ant !== g.n ? { lembrete_enviado_em: null } : {}) },
    { onConflict: 'corretor_id' },
  );
  if (error) { console.error('[planejamento]', error); return { ok: false, erro: 'Não consegui gravar agora. Tente de novo em instantes.' }; }
  return { ok: true, msg: `Agendado, ${primeiro(c.nome)}! Grupo ${g.n}: ${g.rotulo}. Na véspera, às 18h, a Eva te manda um lembrete no WhatsApp.` };
}
