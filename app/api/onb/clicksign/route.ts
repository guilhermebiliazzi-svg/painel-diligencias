import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verificarContratos } from '@/lib/onb-contrato';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook do Clicksign (Configurações → Webhooks) para os contratos de associação
// dos novatos. O corpo do evento não é usado como verdade: ele só diz QUAIS
// envelopes mexeram; o andamento é consultado de novo no Clicksign (WF-R1, acao
// "status") antes de o Max mandar as boas-vindas.
// Se CLICKSIGN_WEBHOOK_SECRET estiver na Vercel, a assinatura (Content-Hmac) é conferida.
const SEGREDO = process.env.CLICKSIGN_WEBHOOK_SECRET || '';

export async function POST(req: Request) {
  const corpo = await req.text();
  if (SEGREDO) {
    const recebido = String(req.headers.get('content-hmac') || '').replace(/^sha256=/i, '');
    const esperado = createHmac('sha256', SEGREDO).update(corpo).digest('hex');
    const a = Buffer.from(recebido, 'utf8');
    const b = Buffer.from(esperado, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ ok: false }, { status: 401 });
  }
  const envelopes = [...new Set(corpo.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])].map((x) => x.toLowerCase());
  if (!envelopes.length) return NextResponse.json({ ok: true, ignorado: true });
  try {
    const r = await verificarContratos({ envelopes, forcar: true });
    return NextResponse.json({ ok: true, ...r });
  } catch {
    // responde 200 mesmo assim: a tela do treinamento confere de novo
    return NextResponse.json({ ok: true, erro: true });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
