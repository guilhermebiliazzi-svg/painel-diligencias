// Vitrine Google Ads — escolha dos imóveis da campanha Demand Gen
// "Imóveis à venda por região". Só admin.
// Catálogo: public.ads_vitrine_catalogo (imóveis à venda do villejardins.com.br,
// atualizado pelo n8n; só os de corretor REMAX). Escolhas: public.ads_vitrine_selecao.
import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Vitrine, { type Imovel, type Vitrine as Vitrine_, type GeoAlvo, type Carrossel } from './vitrine';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vitrine de imóveis — REMAX Ville' };

async function carregar() {
  const sb = supabaseAdmin();
  const imoveis: Imovel[] = [];
  // O PostgREST devolve no máximo 1000 linhas por chamada: lê em páginas.
  for (let ini = 0; ini < 20000; ini += 1000) {
    const { data, error } = await sb
      .from('ads_vitrine_catalogo')
      .select('codigo,tipo,bairro,endereco,preco,quartos,area,vagas,unidade,condominio,sem_preco,imagem,gestor')
      .eq('ativo', true)
      // Só imóveis de corretores REMAX (e-mail @remax.com.br ou rede REMAX no site).
      .eq('remax', true)
      .order('codigo')
      .range(ini, ini + 999);
    if (error) throw new Error(error.message);
    imoveis.push(...((data ?? []) as Imovel[]));
    if (!data || data.length < 1000) break;
  }
  const { data: sel, error: e2 } = await sb.from('ads_vitrine_selecao').select('codigo,grupos');
  if (e2) throw new Error(e2.message);
  const selecao: Record<string, string[]> = {};
  for (const s of (sel ?? []) as { codigo: string; grupos: string[] }[]) {
    if (s.grupos?.length) selecao[s.codigo] = s.grupos;
  }
  const { data: vit, error: e3 } = await sb
    .from('ads_vitrines')
    .select('id,nome,ad_group_id,bairros,tipos,preco_min,preco_max,publico')
    .eq('ativo', true)
    .order('ordem')
    .order('criado_em');
  if (e3) throw new Error(e3.message);
  const { data: geo, error: e4 } = await sb.from('ads_geo_alvos').select('geo_id,nome,tipo').order('nome');
  if (e4) throw new Error(e4.message);
  // Carrosséis de curadoria recentes (só leitura; se a tabela falhar, a tela segue sem o histórico).
  const { data: car } = await sb
    .from('curadoria_carrosseis')
    .select('id,bairro_nome,status,qtd_imoveis,created_at,postado_em')
    .order('id', { ascending: false })
    .limit(6);
  return {
    imoveis,
    selecao,
    vitrines: (vit ?? []) as Vitrine_[],
    geo: (geo ?? []) as GeoAlvo[],
    carrosseis: (car ?? []) as Carrossel[],
  };
}

export default async function VitrinePage() {
  await exigirAdmin();
  let dados: Awaited<ReturnType<typeof carregar>> | null = null;
  let erro: string | null = null;
  try {
    dados = await carregar();
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Vitrine de imóveis</h1>
        <p className="mt-1 text-sm text-slate-600">
          Para cada imóvel, marque o que fazer: anúncio no Google Ads (dentro de uma vitrine) e/ou post no carrossel
          de curadoria do Instagram. As vitrines viram grupos da campanha &quot;Imóveis à venda por região&quot; e as
          mudanças vão para o Google todo dia às 6h30. O carrossel segue para a sua aprovação no WhatsApp antes de postar.
        </p>
        {erro || !dados ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Não consegui carregar os imóveis agora: {erro}
          </div>
        ) : (
          <Vitrine imoveis={dados.imoveis} selecaoInicial={dados.selecao} vitrines={dados.vitrines} geo={dados.geo}
            carrosseis={dados.carrosseis} />
        )}
      </main>
    </div>
  );
}
