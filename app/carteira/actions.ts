'use server';

// 18/11: ações da Carteira — checklist de comercialização, agenda de atividades e avaliação do imóvel.
// O corretor mexe só nos imóveis dele; a gestão mexe em todos.
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { acessoCarteiraAcao } from '@/lib/carteira';
import { AGENDA_K, CHECKLIST_K, CRITERIOS } from '@/lib/carteira-tipos';

export type Res = { ok: boolean; msg?: string; erro?: string };

async function autorizar(imovelId: number): Promise<{ email: string } | { erro: string }> {
  if (!Number.isInteger(imovelId) || imovelId <= 0) return { erro: 'Imóvel inválido.' };
  const a = await acessoCarteiraAcao();
  if ('erro' in a) return a;
  const { data } = await supabaseAdmin().from('carteira_imoveis').select('id,corretor_id').eq('id', imovelId).maybeSingle();
  const im = data as { id: number; corretor_id: number | null } | null;
  if (!im) return { erro: 'Imóvel não encontrado.' };
  if (!a.gestao && (!a.euId || im.corretor_id !== a.euId)) return { erro: 'Este imóvel não está na sua carteira.' };
  return { email: a.email };
}

const limpo = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const linkOk = (v: unknown) => {
  const s = limpo(v, 500);
  return /^https?:\/\/\S+$/i.test(s) ? s : '';
};
const fim = (id: number) => {
  revalidatePath(`/carteira/${id}`);
  revalidatePath('/carteira');
};

/** Marca ou desmarca um item do checklist (feito agora, com link opcional: anúncio, post, vídeo…). */
export async function marcarChecklist(imovelId: number, tipo: string, feito: boolean, link: string, nota: string): Promise<Res> {
  if (!CHECKLIST_K.has(tipo)) return { ok: false, erro: 'Item inválido.' };
  const a = await autorizar(imovelId);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const sb = supabaseAdmin();
  const agora = new Date().toISOString();
  if (feito) {
    const { error } = await sb.from('carteira_atividades').insert({ imovel_id: imovelId, tipo, feito_em: agora, link: linkOk(link) || null, nota: limpo(nota, 300) || null, criado_por: a.email });
    if (error) return { ok: false, erro: 'Não consegui salvar agora.' };
  } else {
    const { error } = await sb.from('carteira_atividades').update({ cancelado_em: agora }).eq('imovel_id', imovelId).eq('tipo', tipo).not('feito_em', 'is', null).is('cancelado_em', null);
    if (error) return { ok: false, erro: 'Não consegui salvar agora.' };
  }
  fim(imovelId);
  return { ok: true };
}

/** Agenda uma atividade (dia e hora) ou registra uma que já aconteceu (jaFeito). */
export async function agendar(imovelId: number, tipo: string, data: string, hora: string, nota: string, jaFeito: boolean): Promise<Res> {
  if (!AGENDA_K.has(tipo)) return { ok: false, erro: 'Escolha o tipo.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: 'Escolha o dia.' };
  if (!/^\d{2}:\d{2}$/.test(hora)) return { ok: false, erro: 'Escolha a hora.' };
  const quando = new Date(`${data}T${hora}:00-03:00`);
  if (isNaN(quando.getTime())) return { ok: false, erro: 'Data inválida.' };
  if (!jaFeito && quando.getTime() < Date.now() - 3600e3) return { ok: false, erro: 'Para algo que já aconteceu, marque "já aconteceu".' };
  if (quando.getTime() > Date.now() + 400 * 864e5) return { ok: false, erro: 'Escolha uma data em até 1 ano.' };
  const t = limpo(nota, 300);
  if (tipo === 'outro' && t.length < 3) return { ok: false, erro: 'Descreva a atividade.' };
  const a = await autorizar(imovelId);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const { error } = await supabaseAdmin().from('carteira_atividades').insert({
    imovel_id: imovelId, tipo, quando: quando.toISOString(), feito_em: jaFeito ? quando.toISOString() : null, nota: t || null, criado_por: a.email,
  });
  if (error) return { ok: false, erro: 'Não consegui salvar agora.' };
  fim(imovelId);
  return { ok: true, msg: jaFeito ? 'Registrado.' : 'Agendado.' };
}

/** Conclui (feito) ou cancela uma atividade da agenda. */
export async function concluirAtividade(atividadeId: number, acao: 'feito' | 'cancelar', nota: string): Promise<Res> {
  if (!Number.isInteger(atividadeId)) return { ok: false, erro: 'Atividade inválida.' };
  const sb = supabaseAdmin();
  const { data } = await sb.from('carteira_atividades').select('id,imovel_id,nota').eq('id', atividadeId).is('cancelado_em', null).maybeSingle();
  const at = data as { id: number; imovel_id: number; nota: string | null } | null;
  if (!at) return { ok: false, erro: 'Atividade não encontrada.' };
  const a = await autorizar(at.imovel_id);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const extra = limpo(nota, 300);
  const patch = acao === 'feito'
    ? { feito_em: new Date().toISOString(), nota: [at.nota, extra].filter(Boolean).join(' · ') || null }
    : { cancelado_em: new Date().toISOString(), nota: [at.nota, extra && 'cancelada: ' + extra].filter(Boolean).join(' · ') || null };
  const { error } = await sb.from('carteira_atividades').update(patch).eq('id', atividadeId);
  if (error) return { ok: false, erro: 'Não consegui salvar agora.' };
  fim(at.imovel_id);
  return { ok: true };
}

/** Classificação (A/B/C), notas de 1 a 5 por critério e observação do corretor. */
export async function salvarAvaliacao(imovelId: number, classe: string, notas: Record<string, number>, obs: string): Promise<Res> {
  const cl = ['A', 'B', 'C'].includes(classe) ? classe : null;
  const av: Record<string, number> = {};
  for (const c of CRITERIOS) {
    const n = Number(notas?.[c.k]);
    if (Number.isInteger(n) && n >= 1 && n <= 5) av[c.k] = n;
  }
  const a = await autorizar(imovelId);
  if ('erro' in a) return { ok: false, erro: a.erro };
  const { error } = await supabaseAdmin().from('carteira_imoveis').update({
    classificacao: cl, avaliacao: av, nota: limpo(obs, 1000) || null, atualizado_por: a.email,
  }).eq('id', imovelId);
  if (error) return { ok: false, erro: 'Não consegui salvar agora.' };
  fim(imovelId);
  return { ok: true, msg: 'Avaliação salva.' };
}
