// 09/11: chave pública (VAPID) para o celular se inscrever nas notificações.
import { NextResponse } from 'next/server';
import { credPush } from '@/lib/push';

export async function GET() {
  const c = await credPush();
  return c ? NextResponse.json({ publica: c.v.publica }) : NextResponse.json({ erro: 'indisponível' }, { status: 503 });
}
