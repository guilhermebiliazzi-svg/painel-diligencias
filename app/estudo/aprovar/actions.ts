'use server';

// 20/11: aprovação dos estudos de mercado. Estudo gerado por corretor nasce "aguardando" (gatilho no banco);
// aqui o Guilherme aprova ou pede correção. A decisão vai para o banco e o n8n ("Estudo — aprovação
// (avisos)") manda o WhatsApp ao corretor; o telefone sai do banco, não do painel.
import { revalidatePath } from 'next/cache';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/estudo-aprovacao';

export type Decisao = { ok: boolean; erro?: string; aviso?: string };

export async function decidir(id: string, acao: 'aprovado' | 'correcao', obs: string): Promise<Decisao> {
  const eu = await exigirAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return { ok: false, erro: 'Estudo inválido.' };
  if (acao !== 'aprovado' && acao !== 'correcao') return { ok: false, erro: 'Ação inválida.' };
  const texto = String(obs ?? '').replace(/\r/g, '').trim();
  if (acao === 'correcao' && !texto) return { ok: false, erro: 'Escreva o que precisa ser corrigido.' };
  if (texto.length > 700) return { ok: false, erro: 'Texto longo demais (máx. 700 caracteres).' };

  const sb = supabaseAdmin();
  const { data, error } = await sb.from('painel_estudo_pedidos')
    .update({ aprovacao: acao, aprovacao_obs: texto || null, aprovacao_por: eu.email, aprovacao_em: new Date().toISOString() })
    .eq('id', id).eq('aprovacao', 'aguardando')
    .select('id');
  if (error) { console.error('[estudo][aprovar]', error); return { ok: false, erro: 'Não consegui gravar a decisão. Tente de novo.' }; }
  if (!data?.length) return { ok: false, erro: 'Este estudo já foi decidido (ou não está aguardando aprovação).' };

  let aviso: string | undefined;
  try {
    const { data: sec } = await sb.from('credenciais_sistema').select('valor').eq('chave', 'painel_upload_secret').maybeSingle();
    const segredo = (sec as { valor?: string } | null)?.valor;
    if (!segredo) throw new Error('segredo ausente');
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-painel-secret': segredo },
      body: JSON.stringify({ acao: 'decisao', pedido_id: id }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    console.error('[estudo][aprovar] aviso', e);
    aviso = 'Decisão gravada, mas o aviso ao corretor pelo WhatsApp não saiu. Avise-o por fora.';
  }
  revalidatePath('/estudo/aprovar');
  return { ok: true, aviso };
}
