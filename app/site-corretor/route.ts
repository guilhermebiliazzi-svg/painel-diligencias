// 07/11: "Área do corretor" do site villejardins.com.br.
// O corretor entra com o Google (mesmo login do painel); se o e-mail for de um corretor associado ativo,
// volta para o site com um código de uso único (5 min) que o site confere em /api/site-corretor/validar.
// Sem segredo compartilhado: o código fica na tabela site_corretor_passes.
// Rota pública no proxy: quem decide é esta rota (sem depender de perfil do painel).
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const SITE = 'https://www.villejardins.com.br';

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    const u = new URL('/login', req.url);
    u.searchParams.set('next', '/site-corretor');
    return NextResponse.redirect(u);
  }
  const email = (user.email || '').toLowerCase();
  const adm = supabaseAdmin();
  const { data } = await adm
    .from('corretores_associados')
    .select('id_agente, status')
    .ilike('email', email)
    .eq('status', 'ativo')
    .limit(1)
    .maybeSingle();
  const id = data?.id_agente ? String(data.id_agente) : '';
  if (!/^60124\d+$/.test(id)) return NextResponse.redirect(SITE + '/corretor?erro=sem-acesso');
  const code = randomBytes(24).toString('hex');
  const { error } = await adm.from('site_corretor_passes').insert({ code, id_agente: id, expira: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
  if (error) return NextResponse.redirect(SITE + '/corretor?erro=falha');
  return NextResponse.redirect(SITE + '/corretor/entrar?t=' + code);
}
