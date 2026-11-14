// 14/11: botão "Registrar visita" no painel (página do lead e Meu funil). Cria um link de visita
// de uso único (o mesmo do botão "Visita agendada" da Eva) e abre o formulário. Assim o registro
// não depende da mensagem da Eva chegar. Gestão do SDR registra para qualquer lead com corretor;
// o corretor só para lead que está com ele.
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessaoPerfil, podeTela, escopoSdr, corretorDaPessoa } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const fim8 = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '').slice(-8);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ir = (p: string) => NextResponse.redirect(new URL(p, req.url), 303);
  const { email, perfil } = await getSessaoPerfil();
  if (!email) return ir('/login');
  if (!perfil || !perfil.ativo || !podeTela(perfil, 'sdr')) return ir('/sem-acesso');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return ir('/sdr');

  const sb = supabaseAdmin();
  const { data } = await sb.from('sdr_leads').select('id,status,corretor_phone').eq('id', id).maybeSingle();
  const l = data as { id: string; status: string; corretor_phone: string | null } | null;
  if (!l || !l.corretor_phone || ['arquivado', 'encerrado'].includes(l.status)) return ir('/sdr');

  if (escopoSdr(perfil) !== 'todos') {
    const cor = await corretorDaPessoa(email);
    if (!cor || fim8(cor.phone).length < 8 || fim8(cor.phone) !== fim8(l.corretor_phone)) return ir('/sem-acesso');
  }

  const token = randomBytes(16).toString('hex');
  const { error } = await sb.from('sdr_visita_links').insert({
    token, lead_id: l.id, corretor_phone: l.corretor_phone, expira_em: new Date(Date.now() + 864e5).toISOString(),
  });
  if (error) return ir('/sdr');
  return ir('/visita/' + token);
}
