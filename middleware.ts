// middleware.ts (na RAIZ do projeto Next.js, ao lado de package.json)
// Protege as áreas administrativas exigindo cookie 'admin_session' valido:
//   /admin/*        (diligências, pareceres, CCV)
//   /cobrancas/*    (administração de aluguéis — painel)
//   /api/adm/*      (rotas de dados/ações da administração de aluguéis)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// prefixos que exigem sessão
const PROTEGIDOS = ['/admin', '/cobrancas', '/api/adm'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Login page e API de login passam livre
  if (pathname === '/admin/login' || pathname === '/admin/api/login') {
    return NextResponse.next();
  }

  const exigeSessao = PROTEGIDOS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (exigeSessao) {
    const sessionCookie = req.cookies.get('admin_session');
    if (!sessionCookie || sessionCookie.value !== process.env.ADMIN_SESSION_TOKEN) {
      // rotas de API respondem 401 (sem redirect — quem chama é o fetch do painel)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
      }
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/cobrancas/:path*', '/api/adm/:path*'],
};
