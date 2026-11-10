// 09/11: notificações do app (Web Push) — chaves no banco (credenciais_sistema) e envio por telefone ou e-mail.
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enviarPush, type Vapid } from '@/lib/webpush';

let cacheCred: { v: Vapid; chave: string; em: number } | null = null;
export async function credPush(): Promise<{ v: Vapid; chave: string } | null> {
  if (cacheCred && Date.now() - cacheCred.em < 10 * 60e3) return cacheCred;
  const { data } = await supabaseAdmin().from('credenciais_sistema').select('chave,valor').in('chave', ['push_vapid_publica', 'push_vapid_privada', 'push_chave_envio']);
  const m = new Map((data ?? []).map((x: { chave: string; valor: string }) => [x.chave, x.valor]));
  const pub = m.get('push_vapid_publica'), priv = m.get('push_vapid_privada'), chave = m.get('push_chave_envio');
  if (!pub || !priv || !chave) return null;
  cacheCred = { v: { publica: pub, privada: priv, contato: 'mailto:guilhermebiliazzi@remax.com.br' }, chave, em: Date.now() };
  return cacheCred;
}

export type Aviso = { titulo: string; corpo: string; url?: string; tag?: string };
type Linha = { id: number; endpoint: string; p256dh: string; auth: string };

// Manda para todas as inscrições de um telefone (8 últimos dígitos) ou de um e-mail. Remove as que morreram.
export async function avisar(alvo: { phone?: string; email?: string }, a: Aviso): Promise<{ enviados: number; falhas: number; aparelhos: number }> {
  const cred = await credPush();
  if (!cred) return { enviados: 0, falhas: 0, aparelhos: 0 };
  const sb = supabaseAdmin();
  let q = sb.from('push_inscricoes').select('id,endpoint,p256dh,auth');
  const f8 = String(alvo.phone ?? '').replace(/\D/g, '').slice(-8);
  if (f8.length === 8) q = q.like('corretor_phone', '%' + f8);
  else if (alvo.email) q = q.eq('email', alvo.email.toLowerCase());
  else return { enviados: 0, falhas: 0, aparelhos: 0 };
  const { data } = await q.limit(20);
  const linhas = (data ?? []) as Linha[];
  let enviados = 0, falhas = 0;
  await Promise.all(linhas.map(async (l) => {
    let st = 0;
    try { st = await enviarPush(l, { titulo: a.titulo, corpo: a.corpo, url: a.url ?? '/', tag: a.tag }, cred.v); } catch { st = 0; }
    if (st >= 200 && st < 300) { enviados++; await sb.from('push_inscricoes').update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq('id', l.id); }
    else if (st === 404 || st === 410) { falhas++; await sb.from('push_inscricoes').delete().eq('id', l.id); }
    else falhas++;
  }));
  return { enviados, falhas, aparelhos: linhas.length };
}
