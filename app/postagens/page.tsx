// Postagens — o corretor (ou o admin em nome dele) escolhe um imóvel do
// NonStop e as fotos do anúncio para montar o carrossel do Instagram.
// Imóveis: xml_cache (XML VRSync do NonStop, atualizado de hora em hora),
// filtrado pelo e-mail do corretor. Pedidos: postagem_pedidos + criativos_imoveis.
import Link from 'next/link';
import { exigirPostagens } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Postagens, { type Corretor, type ImovelNS, type Pedido } from './postagens';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Postagens — REMAX Ville' };

type Dados = {
  corretor_email?: string;
  title?: string;
  property_type?: string;
  address?: string;
  street_number?: string;
  neighborhood?: string;
  list_price?: string | number;
  bedrooms?: string | number;
  suites?: string | number;
  living_area?: string | number;
  garage?: string | number;
  fotos?: { url?: string; primary?: boolean }[];
};

const limpa = (s: unknown) => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
// Tipo do imóvel vem em inglês do XML da REMAX; mostramos em português.
const TIPO_PT: Record<string, string> = {
  'Residential / Apartment': 'Apartamento', 'Residential / Studio': 'Studio', 'Residential / Home': 'Casa',
  'Residential / Condo': 'Casa em condomínio', 'Residential / Penthouse': 'Cobertura', 'Residential / Flat': 'Flat',
  'Residential / Farm Ranch': 'Chácara / Sítio', 'Residential / Sobrado': 'Sobrado', 'Residential / Land Lot': 'Terreno',
  'Commercial / Office': 'Sala comercial', 'Commercial / Building': 'Prédio comercial', 'Commercial / Edificio Comercial': 'Prédio comercial',
  'Commercial / Business': 'Ponto comercial', 'Commercial / Land Lot': 'Terreno comercial', 'Commercial / Store': 'Loja', 'Commercial / Warehouse': 'Galpão',
};
const tipoPt = (s: unknown) => { const t = limpa(s); return TIPO_PT[t] ?? (t.split('/').pop() ?? t).trim(); };
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function carregar(email: string, isAdmin: boolean, corretorParam: string | undefined) {
  const sb = supabaseAdmin();
  const { data: cors, error: e1 } = await sb
    .from('corretores_associados')
    .select('id,nome,apelido,email,phone,id_agente,foto_url,creci,instagram_handle')
    .eq('status', 'ativo')
    .order('nome');
  if (e1) throw new Error(e1.message);
  const todos = (cors ?? []) as Corretor[];

  // Quem é o corretor desta tela: admin escolhe; corretor é ele mesmo.
  const meu = todos.find((c) => (c.email || '').toLowerCase() === email.toLowerCase()) ?? null;
  let corretor: Corretor | null = meu;
  if (isAdmin && corretorParam) corretor = todos.find((c) => String(c.id) === corretorParam) ?? null;
  if (!corretor && !isAdmin) return { corretores: [], corretor: null, imoveis: [], pedidos: [] };

  let imoveis: ImovelNS[] = [];
  let pedidos: Pedido[] = [];
  if (corretor?.email) {
    const { data: xml, error: e2 } = await sb
      .from('xml_cache')
      .select('listing_id,dados_jsonb,updated_at')
      .eq('fonte', 'remax')
      .ilike('dados_jsonb->>corretor_email', corretor.email)
      .order('listing_id');
    if (e2) throw new Error(e2.message);
    imoveis = ((xml ?? []) as { listing_id: string; dados_jsonb: Dados }[]).map((r) => {
      const d = r.dados_jsonb || {};
      // A versão LargeWM tem a marca d'água da REMAX no meio da foto; Large é a mesma foto limpa.
      const fotos = (d.fotos || []).map((f) => String(f.url || '').replace('/LargeWM/', '/Large/')).filter((u) => /^https?:\/\//.test(u));
      return {
        listing_id: r.listing_id,
        titulo: limpa(d.title),
        tipo: tipoPt(d.property_type),
        endereco: [limpa(d.address), limpa(d.street_number)].filter(Boolean).join(', '),
        bairro: limpa(d.neighborhood),
        preco: num(d.list_price),
        quartos: num(d.bedrooms),
        suites: num(d.suites),
        area: num(d.living_area),
        vagas: num(d.garage),
        fotos,
      };
    });

    const { data: ped } = await sb
      .from('postagem_pedidos')
      .select('id,listing_id,status,criativo_id,drive_folder_url,erro_msg,criado_em,criado_por,origem,fotos')
      .eq('corretor_id', corretor.id)
      .order('criado_em', { ascending: false })
      .limit(12);
    const lista = (ped ?? []) as Omit<Pedido, 'criativo'>[];
    const ids = lista.map((p) => p.criativo_id).filter((x): x is number => !!x);
    const criativos = new Map<number, Pedido['criativo']>();
    if (ids.length) {
      const { data: cri } = await sb
        .from('criativos_imoveis')
        .select('id,status,pngs_carrossel_urls,post_ig_url,erro_msg')
        .in('id', ids);
      for (const c of (cri ?? []) as NonNullable<Pedido['criativo']>[]) criativos.set(c.id, c);
    }
    pedidos = lista.map((p) => ({ ...p, criativo: p.criativo_id ? criativos.get(p.criativo_id) ?? null : null }));
  }

  return { corretores: isAdmin ? todos : [], corretor, imoveis, pedidos };
}

export default async function PostagensPage({ searchParams }: { searchParams: Promise<{ corretor?: string }> }) {
  const perfil = await exigirPostagens();
  const { corretor: corretorParam } = await searchParams;
  let dados: Awaited<ReturnType<typeof carregar>> | null = null;
  let erro: string | null = null;
  try {
    dados = await carregar(perfil.email, perfil.is_admin, corretorParam);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  return (
    <div style={{ backgroundColor: '#f8fafc' }} className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Postagens no Instagram</h1>
        <p className="mt-1 text-sm text-slate-600">
          Escolha um imóvel e de 5 a 7 fotos do anúncio. A Eva monta o carrossel, manda a prévia para aprovação e
          publica no @remaxville com o corretor marcado como colaborador.
        </p>
        {erro || !dados ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Não consegui carregar os imóveis agora: {erro}
          </div>
        ) : (
          <Postagens
            isAdmin={perfil.is_admin}
            meuEmail={perfil.email}
            corretores={dados.corretores}
            corretor={dados.corretor}
            imoveis={dados.imoveis}
            pedidos={dados.pedidos}
          />
        )}
      </main>
    </div>
  );
}
