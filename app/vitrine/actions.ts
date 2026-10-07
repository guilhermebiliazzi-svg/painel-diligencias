'use server';

// Vitrine — grava as vitrines e em quais vitrines cada imóvel aparece. Só admin.
// Só as vitrines marcadas "Anunciar no Google Ads" viram grupo da campanha
// "Imóveis à venda por região" (a sincronização diária do n8n cria/pausa os grupos).
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Resultado = { ok: boolean; erro?: string; id?: string };

async function vitrinesAtivas(): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from('ads_vitrines').select('id').eq('ativo', true);
  return new Set((data ?? []).map((v: { id: string }) => v.id));
}

export async function salvarGrupos(codigo: string, grupos: string[]): Promise<Resultado> {
  const eu = await exigirAdmin();
  const cod = String(codigo || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(cod)) return { ok: false, erro: 'Código de imóvel inválido.' };
  const validas = await vitrinesAtivas();
  const limpos = Array.from(new Set(grupos)).filter((g) => validas.has(g));

  const sb = supabaseAdmin();
  const { error } = limpos.length
    ? await sb.from('ads_vitrine_selecao').upsert(
        { codigo: cod, grupos: limpos, atualizado_em: new Date().toISOString(), atualizado_por: eu.email },
        { onConflict: 'codigo' }
      )
    : await sb.from('ads_vitrine_selecao').delete().eq('codigo', cod);

  if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message };
  return { ok: true };
}

export type VitrineEntrada = {
  id?: string;
  nome: string;
  bairros: string[];
  tipos: string[];
  preco_min: number | null;
  preco_max: number | null;
  publico: string[];
  anunciar_ads?: boolean;
};

const lista = (v: unknown, max: number) =>
  Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))).slice(0, max);
const valor = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

export async function salvarVitrine(entrada: VitrineEntrada): Promise<Resultado> {
  const eu = await exigirAdmin();
  const nome = String(entrada.nome || '').trim().slice(0, 60);
  if (nome.length < 3) return { ok: false, erro: 'Dê um nome à vitrine (mínimo 3 letras).' };
  const publico = lista(entrada.publico, 60).filter((g) => /^\d{4,12}$/.test(g));
  if (!publico.length) return { ok: false, erro: 'Escolha onde a vitrine aparece (público).' };
  const preco_min = valor(entrada.preco_min);
  const preco_max = valor(entrada.preco_max);
  if (preco_min && preco_max && preco_min > preco_max) return { ok: false, erro: 'O preço mínimo está maior que o máximo.' };

  const sb = supabaseAdmin();
  const dados = {
    nome,
    bairros: lista(entrada.bairros, 80),
    tipos: lista(entrada.tipos, 30),
    preco_min,
    preco_max,
    publico,
    // Só vitrines marcadas vão para o Google Ads (as demais servem só ao Instagram).
    anunciar_ads: entrada.anunciar_ads === true,
    atualizado_em: new Date().toISOString(),
    atualizado_por: eu.email,
  };

  if (entrada.id) {
    const { error } = await sb.from('ads_vitrines').update(dados).eq('id', entrada.id).eq('ativo', true);
    if (error) return { ok: false, erro: 'Não foi possível salvar: ' + error.message };
    return { ok: true, id: entrada.id };
  }

  const id = `${slug(nome) || 'vitrine'}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await sb.from('ads_vitrines').insert({ id, ...dados, ativo: true, ordem: 100 });
  if (error) return { ok: false, erro: 'Não foi possível criar: ' + error.message };
  return { ok: true, id };
}

// Arquivar: a vitrine some do painel, os imóveis saem dela e a sincronização
// pausa o grupo e os anúncios no Google Ads.
export async function arquivarVitrine(id: string): Promise<Resultado> {
  const eu = await exigirAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('ads_vitrines')
    .update({ ativo: false, atualizado_em: new Date().toISOString(), atualizado_por: eu.email })
    .eq('id', id);
  if (error) return { ok: false, erro: 'Não foi possível arquivar: ' + error.message };

  const { data } = await sb.from('ads_vitrine_selecao').select('codigo,grupos').contains('grupos', [id]);
  for (const s of (data ?? []) as { codigo: string; grupos: string[] }[]) {
    const resto = s.grupos.filter((g) => g !== id);
    if (resto.length) await sb.from('ads_vitrine_selecao').update({ grupos: resto, atualizado_por: eu.email }).eq('codigo', s.codigo);
    else await sb.from('ads_vitrine_selecao').delete().eq('codigo', s.codigo);
  }
  return { ok: true };
}

// Carrossel de curadoria para o Instagram (independente dos anúncios).
// Grava o pedido e avisa o n8n, que monta os slides e manda a prévia para
// aprovação no WhatsApp — o mesmo fluxo da mensagem [CURADORIA] para a Eva.
const WEBHOOK_CURADORIA = 'https://villejds.app.n8n.cloud/webhook/curadoria-painel';

export async function gerarCarrossel(titulo: string, codigos: string[]): Promise<Resultado> {
  const eu = await exigirAdmin();
  const t = String(titulo || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (t.length < 3) return { ok: false, erro: 'Dê um título ao carrossel (ex.: Jardim Paulista).' };
  const cods = Array.from(new Set((codigos || []).map((c) => String(c).trim().toUpperCase()))).filter((c) =>
    /^[A-Z0-9]{3,12}$/.test(c)
  );
  if (cods.length < 5) return { ok: false, erro: 'O carrossel precisa de pelo menos 5 imóveis.' };
  if (cods.length > 8) return { ok: false, erro: 'O carrossel aceita no máximo 8 imóveis.' };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('curadoria_pedidos')
    .insert({ titulo: t, codigos: cods, criado_por: eu.email })
    .select('id')
    .single();
  if (error || !data) return { ok: false, erro: 'Não foi possível registrar o pedido: ' + (error?.message ?? '') };

  try {
    const r = await fetch(WEBHOOK_CURADORIA, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pedido_id: data.id }),
      cache: 'no-store',
    });
    if (!r.ok) return { ok: false, erro: 'O gerador de carrossel não respondeu (' + r.status + '). Tente de novo em instantes.' };
  } catch {
    return { ok: false, erro: 'O gerador de carrossel não respondeu. Tente de novo em instantes.' };
  }
  return { ok: true, id: data.id };
}
