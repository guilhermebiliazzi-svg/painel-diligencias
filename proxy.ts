// Proxy do Next 16 (antigo middleware). Roda no runtime Node antes de cada
// rota. Faz o controle de acesso "otimista": lê o cookie de sessão e decide
// se deixa passar ou manda pro login.
//
// Rotas PÚBLICAS (sem login):
//   /login                 -> a própria tela de login
//   /d/<uuid>              -> painel do CLIENTE (acesso pelo link/UUID)
//   /api/diligencia/<id>   -> API pública consumida pelo painel do cliente

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken, COOKIE_SESSAO } from '@/lib/session-crypto';

const ROTAS_PUBLICAS: RegExp[] = [
  /^\/login$/,
  /^\/d(\/|$)/,
  /^\/api\/diligencia(\/|$)/,
];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessao = verifySessionToken(req.cookies.get(COOKIE_SESSAO)?.value);
  const ehPublica = ROTAS_PUBLICAS.some((re) => re.test(pathname));

  // Já autenticado tentando abrir /login -> manda pra home.
  if (pathname === '/login' && sessao) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (ehPublica) return NextResponse.next();

  // Rota protegida sem sessão válida -> login (guardando o destino).
  if (!sessao) {
    const url = new URL('/login', req.url);
    if (pathname && pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Roda em tudo, menos assets estáticos e imagens.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
