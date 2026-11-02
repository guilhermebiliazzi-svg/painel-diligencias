'use server';

// Lista de ligações: contatos, ligações registradas e follow-up.
// O corretor mexe só na sua lista; o administrador mexe em qualquer uma.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { exigirPerfil, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  ORIGENS, RESULTADOS, RESULTADO_ONB, FONTE_ONB, hojeSP, so,
  type Origem, type Resultado, type Status,
} from '@/lib/ligacoes';

const txt = (v: FormDataEntryValue | null, max = 300) => String(v ?? '').trim().slice(0, max);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function quem() {
  const perfil = await exigirPerfil();
  const eu = await corretorDaPessoa(perfil.email);
  const admin = !!perfil.is_admin;
  if (!admin && !eu) redirect('/ligacoes?erro=sem-corretor');
  return { perfil, admin, meuId: eu?.id ?? null };
}

function voltar(cor: number | null, admin: boolean, q: string): string {
  const p = new URLSearchParams(q);
  if (admin && cor) p.set('cor', String(cor));
  return `/ligacoes?${p.toString()}`;
}

type Dono = { id: number; corretor_id: number; nome: string; predio: string | null; unidade: string | null; origem: Origem };

async function contatoDoDono(id: number, admin: boolean, meuId: number | null): Promise<Dono> {
  const { data } = await supabaseAdmin()
    .from('ligacoes_contatos')
    .select('id,corretor_id,nome,predio,unidade,origem')
    .eq('id', id)
    .maybeSingle();
  const c = data as Dono | null;
  if (!c) redirect('/ligacoes?erro=nao-encontrado');
  if (!admin && Number(c.corretor_id) !== meuId) redirect('/sem-acesso');
  return c;
}

function lerContato(fd: FormData) {
  const origem = txt(fd.get('origem')) as Origem;
  return {
    nome: txt(fd.get('nome'), 120),
    telefone: so(txt(fd.get('telefone'), 30)) || null,
    predio: txt(fd.get('predio'), 160) || null,
    unidade: txt(fd.get('unidade'), 40) || null,
    origem: origem in ORIGENS ? origem : 'outro',
    observacao: txt(fd.get('observacao'), 1000) || null,
  };
}

export async function novoContato(fd: FormData) {
  const { admin, meuId } = await quem();
  const cor = admin ? Number(txt(fd.get('corretor_id'))) || meuId : meuId;
  if (!cor) redirect('/ligacoes?erro=sem-corretor');
  const c = lerContato(fd);
  if (!c.nome) redirect(voltar(cor, admin, 'erro=nome'));
  const { error } = await supabaseAdmin()
    .from('ligacoes_contatos')
    .insert({ ...c, corretor_id: cor, status: 'a_ligar', proximo_contato: hojeSP() });
  if (error) redirect(voltar(cor, admin, 'erro=gravar'));
  revalidatePath('/ligacoes');
  redirect(voltar(cor, admin, 'ok=novo'));
}

export async function editarContato(fd: FormData) {
  const { admin, meuId } = await quem();
  const atual = await contatoDoDono(Number(txt(fd.get('id'))), admin, meuId);
  const c = lerContato(fd);
  if (!c.nome) redirect(voltar(atual.corretor_id, admin, 'erro=nome'));
  const prox = txt(fd.get('proximo_contato'));
  const { error } = await supabaseAdmin()
    .from('ligacoes_contatos')
    .update({ ...c, proximo_contato: DATA.test(prox) ? prox : null, atualizado_em: new Date().toISOString() })
    .eq('id', atual.id);
  if (error) redirect(voltar(atual.corretor_id, admin, 'erro=gravar'));
  revalidatePath('/ligacoes');
  redirect(voltar(atual.corretor_id, admin, 'ok=salvo'));
}

export async function excluirContato(fd: FormData) {
  const { admin, meuId } = await quem();
  const atual = await contatoDoDono(Number(txt(fd.get('id'))), admin, meuId);
  const sb = supabaseAdmin();
  // apaga também o espelho no placar do Max
  const { data: regs } = await sb.from('ligacoes_registros').select('onb_contato_id').eq('contato_id', atual.id);
  const onb = ((regs ?? []) as { onb_contato_id: number | null }[]).map((r) => r.onb_contato_id).filter((x): x is number => !!x);
  if (onb.length) await sb.from('onb_contatos').delete().in('id', onb);
  const { error } = await sb.from('ligacoes_contatos').delete().eq('id', atual.id);
  if (error) redirect(voltar(atual.corretor_id, admin, 'erro=gravar'));
  revalidatePath('/ligacoes');
  redirect(voltar(atual.corretor_id, admin, 'ok=excluido'));
}

// Novato da trilha do Max ligado ao corretor (pelo telefone, últimos 8 dígitos).
async function novatoDoCorretor(corretorId: number): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data: cor } = await sb.from('corretores_associados').select('phone').eq('id', corretorId).maybeSingle();
  const fim = so((cor as { phone: string | null } | null)?.phone).slice(-8);
  if (fim.length < 8) return null;
  const { data } = await sb.from('onb_novatos').select('id,phone,status').in('status', ['ativo', 'pausado']);
  const n = ((data ?? []) as { id: string; phone: string }[]).find((x) => so(x.phone).slice(-8) === fim);
  return n?.id ?? null;
}

export async function registrarLigacao(fd: FormData) {
  const { admin, meuId } = await quem();
  const c = await contatoDoDono(Number(txt(fd.get('id'))), admin, meuId);
  const resultado = txt(fd.get('resultado')) as Resultado;
  if (!RESULTADOS.some((r) => r.chave === resultado)) redirect(voltar(c.corretor_id, admin, 'erro=resultado'));
  const nota = txt(fd.get('nota'), 1000) || null;
  const prox = txt(fd.get('proximo_contato'));
  const hoje = hojeSP();
  const sb = supabaseAdmin();

  const { data: reg, error } = await sb
    .from('ligacoes_registros')
    .insert({ contato_id: c.id, corretor_id: c.corretor_id, data: hoje, resultado, nota })
    .select('id')
    .single();
  if (error || !reg) redirect(voltar(c.corretor_id, admin, 'erro=gravar'));

  await sb
    .from('ligacoes_contatos')
    .update({
      status: resultado as Status,
      proximo_contato: DATA.test(prox) ? prox : null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', c.id);

  // Placar do Max: só para quem está na trilha. Falha aqui não perde a ligação.
  try {
    const novato = await novatoDoCorretor(Number(c.corretor_id));
    if (novato) {
      const { data: onb } = await sb
        .from('onb_contatos')
        .insert({
          novato_id: novato,
          data: hoje,
          fonte: FONTE_ONB[c.origem] ?? 'outro',
          nome: c.nome,
          endereco: [c.predio, c.unidade].filter(Boolean).join(', ') || null,
          resultado: RESULTADO_ONB[resultado],
          observacao: nota ? `Painel: ${nota}` : 'Registrado no painel',
        })
        .select('id')
        .single();
      if (onb) await sb.from('ligacoes_registros').update({ onb_contato_id: (onb as { id: number }).id }).eq('id', (reg as { id: number }).id);
    }
  } catch (e) {
    console.error('ligacoes: espelho no onb_contatos falhou', e);
  }

  revalidatePath('/ligacoes');
  redirect(voltar(c.corretor_id, admin, 'ok=ligacao'));
}

// Desfaz um registro de ligação (lançado por engano).
export async function desfazerLigacao(fd: FormData) {
  const { admin, meuId } = await quem();
  const sb = supabaseAdmin();
  const rid = Number(txt(fd.get('registro_id')));
  const { data } = await sb.from('ligacoes_registros').select('id,contato_id,onb_contato_id').eq('id', rid).maybeSingle();
  const r = data as { id: number; contato_id: number; onb_contato_id: number | null } | null;
  if (!r) redirect('/ligacoes?erro=nao-encontrado');
  const c = await contatoDoDono(Number(r.contato_id), admin, meuId);
  if (r.onb_contato_id) await sb.from('onb_contatos').delete().eq('id', r.onb_contato_id);
  await sb.from('ligacoes_registros').delete().eq('id', r.id);
  // o status volta a ser o da ligação anterior (ou "a ligar")
  const { data: ult } = await sb
    .from('ligacoes_registros')
    .select('resultado')
    .eq('contato_id', c.id)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  await sb
    .from('ligacoes_contatos')
    .update({
      status: ((ult as { resultado: Status } | null)?.resultado ?? 'a_ligar') as Status,
      ...(ult ? {} : { proximo_contato: hojeSP() }),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', c.id);
  revalidatePath('/ligacoes');
  redirect(voltar(c.corretor_id, admin, 'ok=desfeito'));
}
