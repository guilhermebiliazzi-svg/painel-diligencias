// 09/11: o celular da pessoa logada passa a receber notificações (ou deixa de receber).
import { NextResponse } from 'next/server';
import { getSessaoPerfil, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Corpo = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const { perfil } = await getSessaoPerfil();
  if (!perfil?.ativo) return NextResponse.json({ erro: 'faça login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Corpo;
  const endpoint = String(b.endpoint ?? '');
  const p256dh = String(b.keys?.p256dh ?? ''), auth = String(b.keys?.auth ?? '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth))
    return NextResponse.json({ erro: 'inscrição inválida' }, { status: 400 });
  const cor = await corretorDaPessoa(perfil.email);
  const { error } = await supabaseAdmin().from('push_inscricoes').upsert({
    endpoint, p256dh, auth, email: perfil.email.toLowerCase(), corretor_phone: cor?.phone ?? null,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300), atualizado_em: new Date().toISOString(), falhas: 0,
  }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, corretor: !!cor?.phone });
}

export async function DELETE(req: Request) {
  const { perfil } = await getSessaoPerfil();
  if (!perfil?.ativo) return NextResponse.json({ erro: 'faça login' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Corpo;
  await supabaseAdmin().from('push_inscricoes').delete().eq('endpoint', String(b.endpoint ?? '')).eq('email', perfil.email.toLowerCase());
  return NextResponse.json({ ok: true });
}
