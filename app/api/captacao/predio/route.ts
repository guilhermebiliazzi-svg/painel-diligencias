// Lista as unidades de um prédio a partir do cadastro do IPTU. Não gasta
// saldo: é banco local, não é DirectD.
import { NextResponse } from 'next/server';
import { getSessaoPerfil } from '@/lib/perfil';
import { predioPorEndereco, ErroIptu } from '@/lib/iptu';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return NextResponse.json({ erro: 'Faça login para continuar.' }, { status: 401 });
  if (!perfil?.ativo || !(perfil.is_admin || perfil.pode_captacao)) {
    return NextResponse.json({ erro: 'Sua conta não tem acesso à captação.' }, { status: 403 });
  }

  let corpo: { cep?: string; numero?: string; sql?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  try {
    const predio = await predioPorEndereco(corpo);
    if (!predio) return NextResponse.json({ achou: false });
    console.log(`[captacao] ${email} abriu o prédio ${predio.codlog}/${predio.condominio}`);
    return NextResponse.json({ achou: true, predio });
  } catch (e) {
    if (e instanceof ErroIptu) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error('[captacao] falha ao ler o cadastro do IPTU', e);
    return NextResponse.json({ erro: 'Não consegui ler o cadastro do IPTU agora.' }, { status: 503 });
  }
}
