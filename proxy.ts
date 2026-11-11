// Proxy do Next 16. Controle de acesso unificado:
//  - Áreas admin (/admin, /cobrancas, /repasses, /notas, /contratos, /seguros,
//    /api/adm): liberadas por Supabase + permissão da pessoa. A senha única
//    antiga (admin_session) continua valendo como REDE DE SEGURANÇA.
//  - Hub (/, /usuarios): Supabase (usuarios exige admin).
//  - Público: /login, /auth/*, /sem-acesso, /d/<uuid>, /api/diligencia/*,
//    /api/ccv-*, /api/parecer-*.

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { podeTela, type PerfilAcesso, type Tela } from '@/lib/acesso';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };
type Regra = { re: RegExp; perm: 'any' | 'admin' | Tela; legacy: boolean };

const REGRAS: Regra[] = [
  { re: /^\/admin(\/|$)/, perm: 'diligencias', legacy: true },
  { re: /^\/cobrancas(\/|$)/, perm: 'cobrancas', legacy: true },
  { re: /^\/contratos(\/|$)/, perm: 'cobrancas', legacy: true },
  { re: /^\/cobranca-split(\/|$)/, perm: 'cobrancas', legacy: false },
  { re: /^\/repasses(\/|$)/, perm: 'repasse', legacy: true },
  { re: /^\/seguros(\/|$)/, perm: 'admin', legacy: true },
  { re: /^\/notas-comissao(\/|$)/, perm: 'notas', legacy: false },
  { re: /^\/notas(\/|$)/, perm: 'notas', legacy: true },
  { re: /^\/pagamentos(\/|$)/, perm: 'pagamentos', legacy: false },
  { re: /^\/api\/adm(\/|$)/, perm: 'any', legacy: true },
  { re: /^\/usuarios(\/|$)/, perm: 'usuarios', legacy: false },
  { re: /^\/treinamento(\/|$)/, perm: 'treinamento', legacy: false },
  // a página decide: admin vê todas, monitor só a sua (onb_oficina_monitores)
  { re: /^\/oficinas(\/|$)/, perm: 'any', legacy: false },
  // cada corretor vê a sua lista; a página decide
  { re: /^\/ligacoes(\/|$)/, perm: 'any', legacy: false },
  // 06/11: conversa da Eva também abre para quem só tem Recrutamento (a página confere se é candidato).
  { re: /^\/sdr\/conversa\//, perm: 'any', legacy: false },
  // 09/11: oferta de lead aberta pela notificação do app; a página confere se é do corretor logado.
  { re: /^\/oferta\//, perm: 'any', legacy: false },
  { re: /^\/sdr(\/|$)/, perm: 'sdr', legacy: false },
  { re: /^\/recrutamento(\/|$)/, perm: 'recrutamento', legacy: false },
  { re: /^\/vitrine(\/|$)/, perm: 'vitrine', legacy: false },
  // 08/11: números do site villejardins.com.br (mesma permissão da Vitrine)
  { re: /^\/site(\/|$)/, perm: 'vitrine', legacy: false },
  { re: /^\/captacao(\/|$)/, perm: 'captacao', legacy: false },
  { re: /^\/postagens(\/|$)/, perm: 'postagens', legacy: false },
  { re: /^\/estudo(\/|$)/, perm: 'estudo', legacy: false },
  { re: /^\/representacao(\/|$)/, perm: 'representacao', legacy: false },
  { re: /^\/posicionamento(\/|$)/, perm: 'posicionamento', legacy: false },
  { re: /^\/$/, perm: 'any', legacy: false },
];

// ---------------------------------------------------------------------------
// rquatro (rquatro.com.br): painel para outras unidades REMAX, com Supabase
// PRÓPRIO. No domínio rquatro, tudo é reescrito para /r4/... (o painel da Ville
// não existe ali). No domínio do painel, /r4 fica acessível para testes. As
// páginas do /r4 conferem a sessão do rquatro; aqui só renovamos o token.
// ---------------------------------------------------------------------------
function ehHostR4(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  return host === 'rquatro.com.br' || host.endsWith('.rquatro.com.br');
}

async function proxyR4(req: NextRequest, noHost: boolean) {
  const { pathname } = req.nextUrl;
  // No domínio rquatro tudo vai para /r4. Se o endereço já chegou com /r4
  // (reentrada da reescrita na Vercel), segue como está: nunca /r4/r4/...
  const jaR4 = pathname === '/r4' || pathname.startsWith('/r4/');
  let destino: URL | null = null;
  if (noHost && !jaR4 && !pathname.startsWith('/api/r4/')) {
    destino = req.nextUrl.clone();
    destino.pathname = '/r4' + (pathname === '/' ? '' : pathname);
  }
  const responder = () => {
    const h = new Headers(req.headers);
    h.set('x-r4-host', noHost ? '1' : '0');
    return destino
      ? NextResponse.rewrite(destino, { request: { headers: h } })
      : NextResponse.next({ request: { headers: h } });
  };
  let res = responder();
  const url = process.env.R4_SUPABASE_URL || 'https://ktzgxzzuqbixcxwguepq.supabase.co';
  const anon = process.env.R4_SUPABASE_ANON_KEY;
  if (!anon) return res;
  const sb = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(list: CookieParaGravar[]) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = responder();
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  await sb.auth.getClaims(); // renova o token quando venceu
  return res;
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ehApi = pathname.startsWith('/api/');

  const r4Host = ehHostR4(req);
  if (r4Host || pathname === '/r4' || pathname.startsWith('/r4/') || pathname.startsWith('/api/r4/')) {
    return proxyR4(req, r4Host);
  }

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
  // 09/11: getClaims confere a assinatura do token aqui mesmo (chave ES256 do projeto), sem ir ao
  // servidor de autenticação a cada clique como o getUser fazia. Sessão encerrada vale até o token vencer (1 h).
  const { data: dc } = await sb.auth.getClaims();
  const user = dc?.claims?.sub ? { email: (dc.claims.email as string | undefined) ?? null } : null;

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

  // Perfil + permissão. As colunas dos perfis de acesso (telas, escopos) entraram
  // em out/2026; se ainda não existirem, lê só as flags antigas.
  const email = (user.email || '').toLowerCase();
  const ANTIGAS = 'is_admin,ativo,pode_diligencias,pode_cobrancas,pode_repasse,pode_notas,pode_pagamentos,pode_captacao,pode_postagens';
  let { data, error } = await sb.from('perfis').select(ANTIGAS + ',telas').eq('email', email).maybeSingle();
  if (error) ({ data, error } = await sb.from('perfis').select(ANTIGAS).eq('email', email).maybeSingle());
  const perfil = (data as PerfilAcesso | null) ?? null;

  const r = regra!;
  const permitido =
    !!perfil &&
    perfil.ativo &&
    (r.perm === 'any' ? true : r.perm === 'admin' ? perfil.is_admin : podeTela(perfil, r.perm));

  if (!permitido) {
    if (ehApi) return NextResponse.json({ error: 'sem permissão' }, { status: 403 });
    return NextResponse.redirect(new URL('/sem-acesso', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
