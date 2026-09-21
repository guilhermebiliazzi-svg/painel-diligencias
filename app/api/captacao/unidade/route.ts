// Etapa GRATUITA: endereço + unidade -> quem consta ligado a ela.
import { NextResponse } from 'next/server';
import { getSessaoPerfil } from '@/lib/perfil';
import { pessoasNaUnidade, ErroDirectD, type Endereco } from '@/lib/directd';

export const dynamic = 'force-dynamic';
// As 11 chamadas à DirectD levaram 37 s numa medição real (20/09). O padrão
// da Vercel é bem menor que isso e a função morreria no meio, sem erro claro.
export const maxDuration = 60;

export async function POST(req: Request) {
  // Route handler não pode usar exigirPerfil(): redirect() aqui viraria uma
  // resposta de navegação no meio de um fetch. Aqui a recusa é JSON.
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return NextResponse.json({ erro: 'Faça login para continuar.' }, { status: 401 });
  if (!perfil?.ativo || !(perfil.is_admin || perfil.pode_captacao)) {
    return NextResponse.json({ erro: 'Sua conta não tem acesso à captação.' }, { status: 403 });
  }

  let corpo: Endereco & { unidade?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  try {
    const r = await pessoasNaUnidade(corpo, corpo.unidade ?? '');
    console.log(`[captacao] ${email} buscou ${r.unidade} -> ${r.quantidade} pessoa(s)`);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDirectD) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error('[captacao] falha na busca', e);
    return NextResponse.json({ erro: 'Não consegui falar com a DirectD agora.' }, { status: 503 });
  }
}
