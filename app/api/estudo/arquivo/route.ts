// 15/11: baixar um estudo salvo no lead (página do lead e Meu funil). Pode quem pediu o estudo,
// a gestão do SDR e o corretor que está com o lead. Redireciona para o link assinado do Storage.
import { NextResponse } from 'next/server';
import { getSessaoPerfil, podeTela, escopoSdr, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { lerPedido, linkDoEstudo } from '@/lib/estudo-arquivo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);
const texto = (msg: string, status: number) => new NextResponse(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(req: Request) {
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return NextResponse.redirect(new URL('/login', req.url));
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return texto('Estudo inválido.', 400);
  const p = await lerPedido(id);
  if (!p) return texto('Estudo não encontrado.', 404);

  let pode = p.email === email || !!perfil?.is_admin || (!!perfil && podeTela(perfil, 'sdr') && escopoSdr(perfil) === 'todos');
  if (!pode && p.lead_id && perfil && podeTela(perfil, 'sdr')) {
    const [{ data: l }, cor] = await Promise.all([
      supabaseAdmin().from('sdr_leads').select('corretor_phone').eq('id', p.lead_id).maybeSingle(),
      corretorDaPessoa(email),
    ]);
    pode = !!cor?.phone && fim8(cor.phone).length === 8 && fim8(cor.phone) === fim8((l as { corretor_phone: string | null } | null)?.corretor_phone);
  }
  if (!pode) return texto('Você não tem acesso a este estudo.', 403);

  const link = await linkDoEstudo(p);
  if (!link) return texto('Este estudo ainda não ficou pronto.', 404);
  if ('erro' in link) return texto(link.erro, 500);
  return NextResponse.redirect(link.url, 302);
}
