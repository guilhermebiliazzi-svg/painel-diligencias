// 09/11: botão "Enviar teste" — manda uma notificação para os aparelhos da própria pessoa.
import { NextResponse } from 'next/server';
import { getSessaoPerfil } from '@/lib/perfil';
import { avisar } from '@/lib/push';

export async function POST() {
  const { perfil } = await getSessaoPerfil();
  if (!perfil?.ativo) return NextResponse.json({ erro: 'faça login' }, { status: 401 });
  const r = await avisar({ email: perfil.email }, { titulo: 'Notificações ligadas', corpo: 'É assim que os leads novos vão chegar neste aparelho.', url: '/', tag: 'teste' });
  return NextResponse.json({ ok: r.enviados > 0, ...r });
}
