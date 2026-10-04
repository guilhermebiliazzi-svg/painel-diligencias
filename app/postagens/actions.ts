'use server';

// Postagens — carrossel de um imóvel para o Instagram montado no painel.
// O corretor monta o próprio; o admin monta para qualquer corretor (e aí a
// prévia pula a aprovação do corretor e vai direto para o admin).
// Quem gera os slides é o n8n (Gerar_Criativo_Carrossel, webhook postagem-painel).
import { exigirPostagens } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Resultado = { ok: boolean; erro?: string; id?: string };

const WEBHOOK = 'https://villejds.app.n8n.cloud/webhook/postagem-painel';
const MIN_FOTOS = 5;
const MAX_FOTOS = 7;

type Corretor = { id: number; email: string | null; phone: string | null; id_agente: string | null };

// Corretor que a pessoa logada pode operar: admin → qualquer um; corretor → só ele.
async function corretorPermitido(corretorId: number) {
  const eu = await exigirPostagens();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('corretores_associados')
    .select('id,email,phone,id_agente')
    .eq('id', corretorId)
    .eq('status', 'ativo')
    .maybeSingle();
  const cor = data as Corretor | null;
  if (!cor) return { eu, cor: null, erro: 'Corretor não encontrado.' };
  const proprio = !!cor.email && cor.email.toLowerCase() === eu.email.toLowerCase();
  if (!eu.is_admin && !proprio) return { eu, cor: null, erro: 'Você só pode montar carrossel dos seus próprios imóveis.' };
  return { eu, cor, proprio, erro: null };
}

async function avisarN8n(body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!r.ok) return 'O gerador não respondeu (' + r.status + '). Tente de novo em instantes.';
    return null;
  } catch {
    return 'O gerador não respondeu. Tente de novo em instantes.';
  }
}

export async function gerarPostagem(corretorId: number, listingId: string, fotos: string[]): Promise<Resultado> {
  const { eu, cor, proprio, erro } = await corretorPermitido(Number(corretorId));
  if (erro || !cor) return { ok: false, erro: erro ?? 'Sem permissão.' };
  if (!cor.phone || !cor.id_agente) return { ok: false, erro: 'Este corretor está sem WhatsApp ou ID de agente no cadastro.' };

  const lid = String(listingId || '').trim();
  if (!/^[A-Za-z0-9-]{3,40}$/.test(lid)) return { ok: false, erro: 'Imóvel inválido.' };
  const escolhidas = Array.from(new Set((fotos || []).map((f) => String(f).trim()).filter((f) => /^https?:\/\//.test(f))));
  if (escolhidas.length < MIN_FOTOS) return { ok: false, erro: `Escolha pelo menos ${MIN_FOTOS} fotos.` };
  if (escolhidas.length > MAX_FOTOS) return { ok: false, erro: `No máximo ${MAX_FOTOS} fotos.` };

  // O imóvel precisa ser do corretor e as fotos precisam ser do anúncio.
  const sb = supabaseAdmin();
  const { data: xml } = await sb.from('xml_cache').select('dados_jsonb').eq('listing_id', lid).maybeSingle();
  const dados = (xml as { dados_jsonb?: { corretor_email?: string; fotos?: { url?: string }[] } } | null)?.dados_jsonb;
  if (!dados) return { ok: false, erro: 'Imóvel não encontrado no cache do NonStop.' };
  if (String(dados.corretor_email || '').toLowerCase() !== String(cor.email || '').toLowerCase()) {
    return { ok: false, erro: 'Este imóvel não está no nome deste corretor.' };
  }
  const urls = new Set((dados.fotos || []).map((f) => String(f.url || '')));
  if (escolhidas.some((f) => !urls.has(f))) return { ok: false, erro: 'Alguma foto escolhida não é do anúncio. Recarregue a página.' };

  // Já existe um carrossel em andamento para este imóvel?
  const { data: aberto } = await sb
    .from('postagem_pedidos')
    .select('id,status')
    .eq('listing_id', lid)
    .eq('corretor_id', cor.id)
    .in('status', ['novo', 'gerando', 'previa_pronta', 'aguardando_admin'])
    .limit(1);
  if (aberto && aberto.length) return { ok: false, erro: 'Já existe um carrossel deste imóvel em andamento. Veja em "Carrosséis recentes".' };

  const { data: pedido, error } = await sb
    .from('postagem_pedidos')
    .insert({
      corretor_id: cor.id,
      listing_id: lid,
      fotos: escolhidas,
      criado_por: eu.email,
      origem: proprio ? 'corretor' : 'admin',
      // Admin montando para outro corretor: a prévia vai direto para o admin.
      pular_corretor: !proprio,
    })
    .select('id')
    .single();
  if (error || !pedido) return { ok: false, erro: 'Não foi possível registrar o pedido: ' + (error?.message ?? '') };

  const falha = await avisarN8n({ evento: 'gerar', pedido_id: pedido.id });
  if (falha) {
    await sb.from('postagem_pedidos').update({ status: 'erro', erro_msg: falha }).eq('id', pedido.id);
    return { ok: false, erro: falha };
  }
  return { ok: true, id: pedido.id as string };
}

type PedidoRow = { id: string; corretor_id: number; criativo_id: number | null; status: string };

async function pedidoPermitido(pedidoId: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('postagem_pedidos')
    .select('id,corretor_id,criativo_id,status')
    .eq('id', String(pedidoId))
    .maybeSingle();
  const p = data as PedidoRow | null;
  if (!p) return { p: null, erro: 'Pedido não encontrado.' };
  const perm = await corretorPermitido(p.corretor_id);
  if (perm.erro) return { p: null, erro: perm.erro };
  return { p, eu: perm.eu, erro: null };
}

// Corretor (ou admin) aprova a prévia: vai para a aprovação final do admin.
export async function aprovarPrevia(pedidoId: string): Promise<Resultado> {
  const { p, erro } = await pedidoPermitido(pedidoId);
  if (erro || !p) return { ok: false, erro: erro ?? 'Sem permissão.' };
  if (!p.criativo_id || p.status !== 'previa_pronta') return { ok: false, erro: 'Esta prévia não está aguardando aprovação.' };
  const falha = await avisarN8n({ evento: 'aprovado_corretor', criativo_id: p.criativo_id });
  if (falha) return { ok: false, erro: falha };
  await supabaseAdmin().from('postagem_pedidos').update({ status: 'aguardando_admin', atualizado_em: new Date().toISOString() }).eq('id', p.id);
  return { ok: true };
}

// Admin aprova e posta (mesmo efeito do "aprovo" no WhatsApp da Eva).
export async function aprovarEPostar(pedidoId: string): Promise<Resultado> {
  const { p, eu, erro } = await pedidoPermitido(pedidoId);
  if (erro || !p || !eu) return { ok: false, erro: erro ?? 'Sem permissão.' };
  if (!eu.is_admin) return { ok: false, erro: 'Só o admin pode publicar.' };
  if (!p.criativo_id || !['previa_pronta', 'aguardando_admin'].includes(p.status)) return { ok: false, erro: 'Este carrossel não está pronto para publicar.' };
  const sb = supabaseAdmin();
  if (p.status === 'previa_pronta') {
    // Garante a etapa do corretor como cumprida antes de publicar.
    const falha = await avisarN8n({ evento: 'aprovado_corretor', criativo_id: p.criativo_id });
    if (falha) return { ok: false, erro: falha };
  }
  const falha = await avisarN8n({ evento: 'aprovado_admin', criativo_id: p.criativo_id });
  if (falha) return { ok: false, erro: falha };
  await sb.from('postagem_pedidos').update({ status: 'postando', atualizado_em: new Date().toISOString() }).eq('id', p.id);
  return { ok: true };
}

export async function rejeitarPostagem(pedidoId: string): Promise<Resultado> {
  const { p, erro } = await pedidoPermitido(pedidoId);
  if (erro || !p) return { ok: false, erro: erro ?? 'Sem permissão.' };
  if (!['previa_pronta', 'aguardando_admin', 'erro'].includes(p.status)) return { ok: false, erro: 'Este pedido não pode ser cancelado agora.' };
  const sb = supabaseAdmin();
  await sb.from('postagem_pedidos').update({ status: 'rejeitado', atualizado_em: new Date().toISOString() }).eq('id', p.id);
  if (p.criativo_id) await sb.from('criativos_imoveis').update({ status: 'rejeitado' }).eq('id', p.criativo_id).neq('status', 'postado');
  return { ok: true };
}
