// Proxy do Next 16 (substitui o antigo middleware.ts).
// Faz DUAS proteções:
//  1) Áreas administrativas legadas — cookie 'admin_session' (herdado do middleware):
//     /admin, /cobrancas, /repasses, /seguros, /contratos, /api/adm
//  2) Hub interno novo (Supabase Auth / Google) — apenas '/' e '/usuarios'.
// Todo o resto continua público (cliente /d/<uuid>, /notas, /api/diligencia, etc.).

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

const ADMIN_PREFIXOS = ['/admin', '/cobrancas', '/repasses', '/seguros', '/contratos', '/api/adm'];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Login do admin passa livre
  if (pathname === '/admin/login' || pathname === '/admin/api/login') {
    return NextResponse.next();
  }

  // 1) Áreas administrativas legadas (cookie admin_session)
  const ehAdmin = ADMIN_PREFIXOS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  if (ehAdmin) {
    const c = req.cookies.get('admin_session');
    if (!c || c.value !== process.env.ADMIN_SESSION_TOKEN) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
      }
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 2) Hub interno (Supabase) — protege apenas '/' e '/usuarios'; trata '/login'
  const ehHub = pathname === '/' || pathname === '/usuarios' || pathname.startsWith('/usuarios/');
  const ehLogin = pathname === '/login';
  if (ehHub || ehLogin) {
    let res = NextResponse.next({ request: req });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let logado = false;
    if (url && anon) {
      const sb = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(list: CookieParaGravar[]) {
            list.forEach(({ name, value }) => req.cookies.set(name, value));
            res = NextResponse.next({ request: req });
            list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
          },
        },
      });
      const {
        data: { user },
      } = await sb.auth.getUser();
      logado = Boolean(user);
    }
    if (ehLogin) {
      return logado ? NextResponse.redirect(new URL('/', req.url)) : res;
    }
    if (!logado) {
      const dest = new URL('/login', req.url);
      if (pathname !== '/') dest.searchParams.set('next', pathname);
      return NextResponse.redirect(dest);
    }
    return res;
  }

  // 3) Todo o resto: público
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
