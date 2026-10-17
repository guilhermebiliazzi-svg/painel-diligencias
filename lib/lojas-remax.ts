// Lojas REMAX mais próximas de um endereço (17/10).
// 1) Endereço → coordenada pelo OpenStreetMap (Nominatim), com cache na tabela geo_cache.
// 2) Coordenada → lojas ativas pela busca pública de unidades do site da REMAX Brasil (office-search),
//    ordenadas por distância. Regra fixa, sem IA.
import { supabaseAdmin } from '@/lib/supabase/admin';

export type Loja = { id: number; nome: string; cidade: string; uf: string; endereco: string; telefone: string; email: string | null; anuncios: number; km: number };
export type LojasProximas = { cidade: string; uf: string; capital: boolean; consulta: string; lojas: Loja[] };

type Geo = { lat: number; lon: number; cidade: string; uf: string };

async function geocodificar(q: string): Promise<Geo | null> {
  const sb = supabaseAdmin();
  const chave = q.toLowerCase().replace(/\s+/g, ' ').trim();
  if (chave.length < 4) return null;
  const { data: c } = await sb.from('geo_cache').select('lat,lon,cidade,uf').eq('chave', chave).maybeSingle();
  if (c) return c.lat == null ? null : { lat: Number(c.lat), lon: Number(c.lon), cidade: String(c.cidade ?? ''), uf: String(c.uf ?? '') };
  let g: Geo | null = null;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=br&q=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'painel.villejardins.com.br (SDR REMAX Ville)', 'Accept-Language': 'pt-BR' }, cache: 'no-store',
    });
    if (r.ok) {
      const j = (await r.json()) as { lat: string; lon: string; address?: Record<string, string> }[];
      if (j[0]) {
        const a = j[0].address ?? {};
        g = { lat: Number(j[0].lat), lon: Number(j[0].lon), cidade: a.city || a.town || a.village || a.municipality || '', uf: a.state || '' };
      }
    } else return null; // erro do serviço: não grava cache
  } catch { return null; }
  await sb.from('geo_cache').upsert({ chave, lat: g?.lat ?? null, lon: g?.lon ?? null, cidade: g?.cidade ?? null, uf: g?.uf ?? null });
  return g;
}

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, r = Math.PI / 180;
  const d = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(d));
}

export async function lojasProximas(endereco: string): Promise<LojasProximas | null> {
  const partes = endereco.split(',').map((s) => s.trim()).filter(Boolean);
  let g: Geo | null = null; let consulta = '';
  // Tenta o endereço inteiro; se não achar, vai tirando o começo (rua) até sobrar bairro/cidade.
  for (let i = 0; i < partes.length && !g; i++) { consulta = partes.slice(i).join(', '); g = await geocodificar(consulta); }
  if (!g) return null;
  const capital = /^s[ãa]o paulo$/i.test(g.cidade) && /s[ãa]o paulo/i.test(g.uf);
  const ponto = `geography'POINT(${g.lon} ${g.lat})'`;
  let lojas: Loja[] = [];
  try {
    const r = await fetch('https://ville.remax.com.br/search/office-search/docs/search', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://ville.remax.com.br', Referer: 'https://ville.remax.com.br/' },
      body: JSON.stringify({ count: false, skip: 0, top: 12, search: '*', filter: `content/Country eq 'Brazil' and content/Disabled eq false and geo.distance(content/Coordinates, ${ponto}) le 150`, orderby: `geo.distance(content/Coordinates, ${ponto})` }),
    });
    const j = (await r.json()) as { value?: { content: Record<string, unknown> }[] };
    lojas = (j.value ?? []).map(({ content: o }) => {
      const co = (o.Coordinates as { coordinates?: [number, number] } | null)?.coordinates;
      return {
        id: Number(o.OfficeId), nome: String(o.OfficeName ?? '').trim(), cidade: String(o.City ?? ''), uf: String(o.Province ?? ''),
        endereco: String(o.OfficeAddress ?? ''), telefone: String(o.WhatsApp || o.MobilePhone || o.Phone || ''), email: (o.Email as string) || null,
        anuncios: Number(o.OfficeListingCount ?? 0), km: co ? Math.round(km(g as Geo, { lat: co[1], lon: co[0] }) * 10) / 10 : 999,
      };
    }).filter((l) => l.id !== 60124);
  } catch { lojas = []; }
  // Entre as 6 mais próximas, preferência para quem tem anúncios ativos; dentro disso, a mais próxima.
  lojas = lojas.slice(0, 6);
  lojas.sort((a, b) => (Number(b.anuncios > 0) - Number(a.anuncios > 0)) || a.km - b.km);
  return { cidade: g.cidade, uf: g.uf, capital, consulta, lojas: lojas.slice(0, 3) };
}
