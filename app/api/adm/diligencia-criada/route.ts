// Marca quem criou a diligência pelo formulário "Nova diligência" (perfil Corretor).
//
// O formulário manda os dados direto para o n8n (WF-01), que responde só { ok: true },
// sem o id. Por isso, depois do envio, a página do formulário (injetada em
// app/admin/nova-diligencia/route.ts) chama esta rota com o endereço; aqui
// procuramos a diligência com esse endereço criada nos últimos 15 minutos e a
// ligamos ao corretor da pessoa (diligencia_corretores, origem 'criou').
// O WF-01 pode gravar alguns segundos depois de responder: sem achar, devolve
// ok:false e a página tenta de novo.
import { NextResponse } from 'next/server';
import { getSessaoPerfil, corretorDaPessoa } from '@/lib/perfil';
import { podeTela } from '@/lib/acesso';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

export async function POST(req: Request) {
  const { perfil } = await getSessaoPerfil();
  if (!perfil || !perfil.ativo || !podeTela(perfil, 'diligencias')) {
    return NextResponse.json({ ok: false, error: 'sem acesso' }, { status: 403 });
  }
  let body: { endereco?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'corpo inválido' }, { status: 400 });
  }
  const endereco = norm(body.endereco);
  if (!endereco) return NextResponse.json({ ok: false, error: 'endereço ausente' }, { status: 400 });

  const cor = await corretorDaPessoa(perfil.email);
  if (!cor) return NextResponse.json({ ok: true, ignorado: 'e-mail fora do cadastro de corretores' });

  const sb = supabaseAdmin();
  const desde = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: novas, error } = await sb
    .from('diligencias')
    .select('id,endereco,criado_em')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const alvo = ((novas ?? []) as { id: string; endereco: string | null }[]).find((d) => norm(d.endereco) === endereco);
  if (!alvo) return NextResponse.json({ ok: false, error: 'ainda não gravada' });

  // Só a primeira pessoa que criou é marcada como criadora.
  const { data: ja } = await sb
    .from('diligencia_corretores')
    .select('corretor_id')
    .eq('diligencia_id', alvo.id)
    .eq('origem', 'criou')
    .limit(1);
  if (ja?.length && (ja[0] as { corretor_id: number }).corretor_id !== cor.id) {
    return NextResponse.json({ ok: true, ignorado: 'já tem criador' });
  }

  const { error: e2 } = await sb
    .from('diligencia_corretores')
    .upsert({ diligencia_id: alvo.id, corretor_id: cor.id, origem: 'criou' }, { onConflict: 'diligencia_id,corretor_id', ignoreDuplicates: true });
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, diligencia_id: alvo.id });
}
