// Etapa PAGA: um CPF, uma consulta, uma cobrança.
import { NextResponse } from 'next/server';
import { getSessaoPerfil } from '@/lib/perfil';
import { contatoPorCpf, ErroDirectD } from '@/lib/directd';

export const dynamic = 'force-dynamic';
// As 11 chamadas à DirectD levaram 37 s numa medição real (20/09). O padrão
// da Vercel é bem menor que isso e a função morreria no meio, sem erro claro.
export const maxDuration = 60;

export async function POST(req: Request) {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return NextResponse.json({ erro: 'Faça login para continuar.' }, { status: 401 });
  if (!perfil?.ativo || !(perfil.is_admin || perfil.pode_captacao)) {
    return NextResponse.json({ erro: 'Sua conta não tem acesso à captação.' }, { status: 403 });
  }

  let corpo: { cpf?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  try {
    const c = await contatoPorCpf(corpo.cpf ?? '');
    // Este log é hoje o único registro de quem gastou saldo. Se virar rotina,
    // vale uma tabela no banco.
    console.log(
      `[captacao][GASTOU] ${email} consultou o contato do CPF ` +
        `${c.cpf.slice(0, 3)}***${c.cpf.slice(-2)} (${c.nome})`
    );
    return NextResponse.json(c);
  } catch (e) {
    if (e instanceof ErroDirectD) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error('[captacao] falha no contato', e);
    return NextResponse.json({ erro: 'Não consegui falar com a DirectD agora.' }, { status: 503 });
  }
}
