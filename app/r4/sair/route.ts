import { NextResponse } from 'next/server';
import { r4Server, r4Configurado } from '@/lib/r4/supabase';

export const dynamic = 'force-dynamic';

// POST /sair (rquatro) — encerra a sessão e volta para o login.
export async function POST(req: Request) {
  if (r4Configurado()) {
    const sb = await r4Server();
    await sb.auth.signOut();
  }
  const noHost = req.headers.get('x-r4-host') === '1';
  return NextResponse.redirect(new URL(noHost ? '/login' : '/r4/login', req.url), 303);
}
