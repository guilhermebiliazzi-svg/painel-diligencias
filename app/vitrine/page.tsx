// Vitrine Google Ads — escolha dos imóveis da campanha Demand Gen
// "Imóveis à venda por região". Só admin.
// Catálogo: public.ads_vitrine_catalogo (imóveis à venda do villejardins.com.br,
// atualizado pelo n8n; só os de corretor REMAX). Escolhas: public.ads_vitrine_selecao.
import Link from 'next/link';
import { exigirAdmin } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Vitrine, { type Imovel } from './vitrine';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Vitrine Google Ads — REMAX Ville' };

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
  return { imoveis, selecao };
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
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Vitrine Google Ads</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escolha os imóveis da campanha &quot;Imóveis à venda por região&quot;. Cada vitrine é o público de uma
          região de São Paulo: o imóvel aparece para quem está naquela região.
        </p>
        {erro || !dados ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Não consegui carregar os imóveis agora: {erro}
          </div>
        ) : (
          <Vitrine imoveis={dados.imoveis} selecaoInicial={dados.selecao} />
        )}
      </main>
    </div>
  );
}
