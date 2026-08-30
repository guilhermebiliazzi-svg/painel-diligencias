// Proxy do Next 16. Controle de acesso unificado:
//  - Áreas admin (/admin, /cobrancas, /repasses, /notas, /contratos, /seguros,
//    /api/adm): liberadas por Supabase + permissão da pessoa. A senha única
//    antiga (admin_session) continua valendo como REDE DE SEGURANÇA.
//  - Hub (/, /usuarios): Supabase (usuarios exige admin).
//  - Público: /login, /auth/*, /sem-acesso, /d/<uuid>, /api/diligencia/*,
//    /api/ccv-*, /api/parecer-*.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };
type PermKey = 'pode_diligencias' | 'pode_cobrancas' | 'pode_repasse' | 'pode_notas' | 'pode_pagamentos';
type PerfilRow = {
  is_admin: boolean; ativo: boolean;
  pode_diligencias: boolean; pode_cobrancas: boolean; pode_repasse: boolean; pode_notas: boolean; pode_pagamentos: boolean;
};
type Regra = { re: RegExp; perm: 'any' | 'admin' | PermKey; legacy: boolean };

const REGRAS: Regra[] = [
  { re: /^\/admin(\/|$)/, perm: 'pode_diligencias', legacy: true },
  { re: /^\/cobrancas(\/|$)/, perm: 'pode_cobrancas', legacy: true },
  { re: /^\/contratos(\/|$)/, perm: 'pode_cobrancas', legacy: true },
  { re: /^\/repasses(\/|$)/, perm: 'pode_repasse', legacy: true },
  { re: /^\/seguros(\/|$)/, perm: 'admin', legacy: true },
  { re: /^\/notas-comissao(\/|$)/, perm: 'pode_notas', legacy: false },
  { re: /^\/notas(\/|$)/, perm: 'pode_notas', legacy: true },
  { re: /^\/pagamentos(\/|$)/, perm: 'pode_pagamentos', legacy: false },
  { re: /^\/api\/adm(\/|$)/, perm: 'any', legacy: true },
  { re: /^\/usuarios(\/|$)/, perm: 'admin', legacy: false },
  { re: /^\/$/, perm: 'any', legacy: false },
];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ehApi = pathname.startsWith('/api/');

  // Porta de emergência da senha antiga (setar/limpar cookie) segue livre.
  if (pathname === '/admin/login' || pathname === '/admin/api/login') {
    return NextResponse.next();
  }

  const regra = REGRAS.find((r) => r.re.test(pathname));
  if (!regra && pathname !== '/login') {
    return NextResponse.next(); // rota pública
  }

  // Rede de segurança: senha única antiga ainda vale nas áreas legadas.
  if (regra?.legacy) {
    const c = req.cookies.get('admin_session');
    const tok = process.env.ADMIN_SESSION_TOKEN;
    if (c && tok && c.value === tok) return NextResponse.next();
  }

  // Sessão Supabase
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (pathname === '/login') return res;
    return ehApi
      ? NextResponse.json({ error: 'auth indisponível' }, { status: 503 })
      : NextResponse.redirect(new URL('/login', req.url));
  }

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

  // /login: logado vai pra home
  if (pathname === '/login') {
    return user ? NextResponse.redirect(new URL('/', req.url)) : res;
  }

  // Rota protegida sem sessão
  if (!user) {
    if (ehApi) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    const dest = new URL('/login', req.url);
    if (pathname !== '/') dest.searchParams.set('next', pathname);
    return NextResponse.redirect(dest);
  }

  // Perfil + permissão
  const { data } = await sb
    .from('perfis')
    .select('is_admin,ativo,pode_diligencias,pode_cobrancas,pode_repasse,pode_notas,pode_pagamentos')
    .eq('email', (user.email || '').toLowerCase())
    .maybeSingle();
  const perfil = (data as PerfilRow | null) ?? null;

  const r = regra!;
  const permitido =
    !!perfil &&
    perfil.ativo &&
    (r.perm === 'any'
      ? true
      : r.perm === 'admin'
        ? perfil.is_admin
        : perfil.is_admin || perfil[r.perm]);

  if (!permitido) {
    if (ehApi) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    return NextResponse.redirect(new URL('/sem-acesso', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
