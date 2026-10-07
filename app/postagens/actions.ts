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

type Corretor = { id: number; email: string | null; phone: string | null; id_agente: string | null; foto_url: string | null; creci: string | null; instagram_handle: string | null };

// Corretor que a pessoa logada pode operar: admin → qualquer um; corretor → só ele.
async function corretorPermitido(corretorId: number) {
  const eu = await exigirPostagens();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('corretores_associados')
    .select('id,email,phone,id_agente,foto_url,creci,instagram_handle')
    .eq('id', corretorId)
    .eq('status', 'ativo')
    .maybeSingle();
  const cor = data as Corretor | null;
  if (!cor) return { eu, cor: null, erro: 'Corretor não encontrado.' };
  const proprio = !!cor.email && cor.email.toLowerCase() === eu.email.toLowerCase();
  if (!eu.is_admin && !proprio) return { eu, cor: null, erro: 'Você só pode montar carrossel dos seus próprios imóveis.' };
  return { eu, cor, proprio, erro: null };
}

const limparHandle = (v: unknown) => String(v ?? '').trim().replace(/^@/, '').toLowerCase();

// Salva/corrige o @ do Instagram do corretor (admin ou o próprio corretor).
export async function salvarInstagram(corretorId: number, handle: string): Promise<Resultado> {
  const { cor, erro } = await corretorPermitido(Number(corretorId));
  if (erro || !cor) return { ok: false, erro: erro ?? 'Sem permissão.' };
  const h = limparHandle(handle);
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return { ok: false, erro: 'Informe um @ válido (letras, números, ponto ou _).' };
  const { error } = await supabaseAdmin().from('corretores_associados').update({ instagram_handle: h }).eq('id', cor.id);
  if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message };
  return { ok: true };
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
  // O slide final usa foto e CRECI do corretor; sem eles o gerador não cria o carrossel.
  const faltando = [!cor.foto_url ? 'foto de perfil' : '', !String(cor.creci || '').trim() ? 'CRECI' : ''].filter(Boolean);
  if (faltando.length) return { ok: false, erro: `O cadastro do corretor está sem ${faltando.join(' e ')}. Peça para a Eva salvar pelo WhatsApp antes de gerar.` };
  // Sem o @ do Instagram o post sairia sem colaborador — não gera.
  if (!limparHandle(cor.instagram_handle)) return { ok: false, erro: 'Informe o @ do Instagram do corretor (campo ao lado do nome) antes de gerar — ele é marcado como colaborador no post.' };

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
  // Aceita a URL original (LargeWM) e a versão sem marca d'água (Large), que é a exibida na tela.
  const urls = new Set((dados.fotos || []).flatMap((f) => { const u = String(f.url || ''); return [u, u.replace('/LargeWM/', '/Large/')]; }));
  if (escolhidas.some((f) => !urls.has(f))) return { ok: false, erro: 'Alguma foto escolhida não é do anúncio. Recarregue a página.' };

  // Já existe um carrossel em andamento para este imóvel?
  const { data: aberto } = await sb
    .from('postagem_pedidos')
    .select('id,status')
    .eq('listing_id', lid)
    .eq('corretor_id', cor.id)
    .in('status', ['novo', 'gerando', 'textos_prontos', 'gerando_previa', 'previa_pronta', 'aguardando_admin'])
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
  if (!['textos_prontos', 'previa_pronta', 'aguardando_admin', 'erro'].includes(p.status)) return { ok: false, erro: 'Este pedido não pode ser cancelado agora.' };
  const sb = supabaseAdmin();
  await sb.from('postagem_pedidos').update({ status: 'rejeitado', atualizado_em: new Date().toISOString() }).eq('id', p.id);
  if (p.criativo_id) await sb.from('criativos_imoveis').update({ status: 'rejeitado' }).eq('id', p.criativo_id).neq('status', 'postado');
  return { ok: true };
}

// Textos que a IA escreveu, revisados pelo corretor antes da prévia.
export type TextosCarrossel = { destaques: string[]; descricao_bairro: string; cta_texto: string; caption: string };
const LIM = { destaque: 110, bairro: 320, cta: 260, caption: 2200 };

// Salva os textos revisados e pede a prévia (o n8n só renderiza os slides, sem chamar a IA de novo).
export async function gerarPrevia(pedidoId: string, t: TextosCarrossel): Promise<Resultado> {
  const { p, erro } = await pedidoPermitido(pedidoId);
  if (erro || !p) return { ok: false, erro: erro ?? 'Sem permissão.' };
  if (!p.criativo_id || p.status !== 'textos_prontos') return { ok: false, erro: 'Os textos deste carrossel não estão aguardando revisão.' };
  const limpa = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const destaques = (Array.isArray(t?.destaques) ? t.destaques : []).map(limpa);
  if (destaques.some((d) => !d)) return { ok: false, erro: 'Preencha o texto de todas as fotos (ou mantenha o da IA).' };
  if (destaques.some((d) => d.length > LIM.destaque)) return { ok: false, erro: `O texto de cada foto pode ter até ${LIM.destaque} caracteres.` };
  const bairro = limpa(t?.descricao_bairro), cta = limpa(t?.cta_texto);
  const caption = String(t?.caption ?? '').trim();
  if (!bairro || !cta || !caption) return { ok: false, erro: 'Descrição do bairro, convite e legenda não podem ficar vazios.' };
  if (bairro.length > LIM.bairro || cta.length > LIM.cta || caption.length > LIM.caption) return { ok: false, erro: 'Algum texto passou do limite de caracteres.' };

  const sb = supabaseAdmin();
  const { data: atual } = await sb.from('criativos_imoveis').select('destaques').eq('id', p.criativo_id).maybeSingle();
  const qtd = Array.isArray((atual as { destaques?: unknown[] } | null)?.destaques) ? ((atual as { destaques: unknown[] }).destaques.length) : destaques.length;
  if (destaques.length !== qtd) return { ok: false, erro: 'A quantidade de textos não confere com as fotos. Recarregue a página.' };
  const { error } = await sb.from('criativos_imoveis').update({ destaques, descricao_bairro: bairro, cta_texto: cta, caption }).eq('id', p.criativo_id);
  if (error) return { ok: false, erro: 'Não foi possível salvar os textos: ' + error.message };
  await sb.from('postagem_pedidos').update({ status: 'gerando_previa', atualizado_em: new Date().toISOString() }).eq('id', p.id).eq('status', 'textos_prontos');
  const falha = await avisarN8n({ evento: 'gerar_previa', pedido_id: p.id });
  if (falha) {
    await sb.from('postagem_pedidos').update({ status: 'textos_prontos' }).eq('id', p.id);
    return { ok: false, erro: falha };
  }
  return { ok: true };
}
