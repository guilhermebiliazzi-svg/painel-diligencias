// middleware.ts (na RAIZ do projeto Next.js, ao lado de package.json)
// Protege /admin/* exigindo cookie 'admin_session' valido.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Login page e API de login passam livre
  if (pathname === '/admin/login' || pathname === '/admin/api/login') {
    return NextResponse.next();
  }

  // Demais rotas /admin/* exigem cookie
  if (pathname.startsWith('/admin')) {
    const sessionCookie = req.cookies.get('admin_session');
    if (!sessionCookie || sessionCookie.value !== process.env.ADMIN_SESSION_TOKEN) {
      const loginUrl = new URL('/admin/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
