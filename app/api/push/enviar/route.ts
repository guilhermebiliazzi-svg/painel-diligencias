// 09/11: o n8n (SDR-04, oferta de lead) chama aqui para tocar o celular do corretor, junto com o WhatsApp.
import { NextResponse } from 'next/server';
import { avisar, credPush } from '@/lib/push';

export async function POST(req: Request) {
  const cred = await credPush();
  if (!cred || req.headers.get('x-chave') !== cred.chave) return NextResponse.json({ erro: 'chave inválida' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { para?: string; titulo?: string; corpo?: string; url?: string; tag?: string };
  const para = String(b.para ?? '').replace(/\D/g, '');
  if (para.length < 10) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 });
  const url = typeof b.url === 'string' && b.url.startsWith('/') ? b.url : '/';
  const r = await avisar({ phone: para }, { titulo: String(b.titulo ?? 'REMAX Ville').slice(0, 80), corpo: String(b.corpo ?? '').slice(0, 300), url, tag: b.tag ? String(b.tag).slice(0, 60) : undefined });
  return NextResponse.json({ ok: true, ...r });
}
