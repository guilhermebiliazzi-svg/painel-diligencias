// 07/11: o site villejardins.com.br troca o código da Área do corretor pelo código REMAX do corretor.
// Uso único e válido por 5 minutos. Não devolve nenhum dado além do código do corretor.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  let code = '';
  try { code = String((await req.json())?.t || ''); } catch {}
  if (!/^[a-f0-9]{48}$/.test(code)) return NextResponse.json({ ok: false }, { status: 400 });
  const { data } = await supabaseAdmin()
    .from('site_corretor_passes')
    .update({ usado_em: new Date().toISOString() })
    .eq('code', code)
    .is('usado_em', null)
    .gt('expira', new Date().toISOString())
    .select('id_agente')
    .maybeSingle();
  if (!data?.id_agente) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, id: String(data.id_agente) });
}
