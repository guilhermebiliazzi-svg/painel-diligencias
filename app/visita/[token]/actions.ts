'use server';

// Registro da visita pelo link do corretor: quem valida o token (uso único, 7 dias) e grava é o n8n
// (sdr-painel-acao, acao registrar_visita), que segue o mesmo caminho do botão "Confirmar" da visita.
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ResVisita = { ok: boolean; msg?: string; erro?: string };
export type ResImovel = { ok: boolean; id?: string; rotulo?: string; erro?: string };

const WEBHOOK_ACAO = 'https://villejds.app.n8n.cloud/webhook/sdr-painel-acao';
const CHAVE_ACAO = 'ville-sdr-painel-7c2e9a41f0b84d6e';

export async function registrarVisita(token: string, imovelLeadId: string, data: string, hora: string): Promise<ResVisita> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, erro: 'Link inválido.' };
  if (!/^[0-9a-f-]{36}$/i.test(imovelLeadId)) return { ok: false, erro: 'Escolha o imóvel.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return { ok: false, erro: 'Preencha o dia e a hora.' };
  try {
    const r = await fetch(WEBHOOK_ACAO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-chave': CHAVE_ACAO },
      body: JSON.stringify({ acao: 'registrar_visita', token, imovel_lead_id: imovelLeadId, quando: data + 'T' + hora }),
      cache: 'no-store',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; resposta?: string };
    if (!r.ok) return { ok: false, erro: 'Não consegui registrar agora (' + r.status + '). Tente de novo em instantes.' };
    return j.ok ? { ok: true, msg: j.resposta || 'Visita registrada.' } : { ok: false, erro: j.resposta || 'Não foi possível registrar.' };
  } catch {
    return { ok: false, erro: 'Não consegui registrar agora. Tente de novo em instantes.' };
  }
}

// 26/11: o corretor marca visita num imóvel que ELE ofereceu (não o do anúncio). Pelo código (Ville, REMAX ou iList)
// o endereço e o valor vêm da base; sem código cadastrado, vale o endereço digitado. O imóvel entra no lead como
// "oferecido pelo corretor" e a visita segue o caminho normal (registrarVisita).
export async function incluirOutroImovel(token: string, codigo: string, endereco: string): Promise<ResImovel> {
  if (!/^[0-9a-f]{32}$/.test(token)) return { ok: false, erro: 'Link inválido.' };
  const sb = supabaseAdmin();
  const { data: lk } = await sb.from('sdr_visita_links').select('lead_id,usado_em,expira_em').eq('token', token).maybeSingle();
  const link = lk as { lead_id: string; usado_em: string | null; expira_em: string } | null;
  if (!link || link.usado_em || new Date(link.expira_em).getTime() < Date.now()) return { ok: false, erro: 'Este link não vale mais. Toque de novo em "Visita agendada" na mensagem da Eva.' };
  const { data: ld } = await sb.from('sdr_leads').select('corretor_phone,status').eq('id', link.lead_id).maybeSingle();
  const lead = ld as { corretor_phone: string | null; status: string } | null;
  if (!lead || ['arquivado', 'encerrado'].includes(lead.status)) return { ok: false, erro: 'Este lead já foi encerrado.' };

  const cod = String(codigo || '').trim().toUpperCase().replace(/^C[ÓO]D(IGO)?\.?\s*:?\s*/, '').replace(/\s+/g, '');
  const end = String(endereco || '').trim().slice(0, 200);
  if (!cod && end.length < 6) return { ok: false, erro: 'Digite o código do imóvel ou o endereço (rua e número).' };

  let ref: string | null = cod || null, enderecoF = end, bairro: string | null = null, valor: number | null = null;
  let url: string | null = null, fonte = 'outro', achou = false;
  if (cod) {
    if (!/^[A-Z0-9-]{4,20}$/.test(cod)) return { ok: false, erro: 'Código inválido. Use só letras, números e hífen (ex.: NA4T0 ou 601241007-131).' };
    const dig = cod.replace(/-/g, '');
    const longo = /^\d{10,13}$/.test(dig);
    const hif = longo ? dig.slice(0, 9) + '-' + dig.slice(9) : cod;
    if (longo) ref = hif;
    const { data: v } = await sb.from('ads_vitrine_catalogo').select('codigo,endereco,bairro,preco').in('codigo', longo ? [dig, hif] : [cod]).limit(1);
    const vi = (v ?? [])[0] as { codigo: string; endereco: string | null; bairro: string | null; preco: number | null } | undefined;
    if (vi) { achou = true; enderecoF = vi.endereco || enderecoF; bairro = vi.bairro; valor = vi.preco; }
    if (!achou && longo) {
      const { data: c } = await sb.from('carteira_imoveis').select('logradouro,numero,bairro,valor').eq('ilist_listing_id', hif).limit(1);
      const ci = (c ?? [])[0] as { logradouro: string | null; numero: string | null; bairro: string | null; valor: number | null } | undefined;
      if (ci) { achou = true; enderecoF = [ci.logradouro, ci.numero].filter(Boolean).join(', ') || enderecoF; bairro = ci.bairro; valor = ci.valor; }
    }
    if (!achou) {
      const { data: a } = await sb.from('alianca_catalogo').select('endereco,bairro,preco').eq('ativo', true).ilike('codigo_anuncio', '%#' + cod).limit(1);
      const ai = (a ?? [])[0] as { endereco: string | null; bairro: string | null; preco: number | null } | undefined;
      if (ai) { achou = true; enderecoF = ai.endereco || enderecoF; bairro = ai.bairro; valor = ai.preco; }
    }
    const { data: f } = await sb.from('feed_imoveis_site').select('url').eq('id', longo ? dig : cod).limit(1);
    url = ((f ?? [])[0] as { url: string } | undefined)?.url ?? null;
    fonte = url ? 'villejardins' : (longo ? 'remax' : 'outro');
    if (!achou && end.length < 6) return { ok: false, erro: 'Não achei o código ' + cod + ' na nossa base. Confira o código ou digite o endereço do imóvel.' };
  }
  if (!enderecoF) return { ok: false, erro: 'Digite o endereço do imóvel.' };

  // mesmo imóvel já no lead: reaproveita
  const { data: ja } = await sb.from('sdr_imoveis_lead').select('id,endereco,ref,valor').eq('lead_id', link.lead_id);
  const igual = ((ja ?? []) as { id: string; endereco: string | null; ref: string | null; valor: number | null }[])
    .find((i) => (ref && i.ref && i.ref.toUpperCase() === ref.toUpperCase()) || (!ref && i.endereco && i.endereco.toLowerCase() === enderecoF.toLowerCase()));
  const brl = (n: number | null) => (n ? ' · R$ ' + Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '');
  if (igual) return { ok: true, id: igual.id, rotulo: (igual.endereco || igual.ref || 'Imóvel') + brl(igual.valor) + (igual.ref ? ' (ref. ' + igual.ref + ')' : '') };

  const { data: novo, error } = await sb.from('sdr_imoveis_lead').insert({
    lead_id: link.lead_id, ref, url, fonte, endereco: enderecoF, bairro, valor,
    aprovado_cliente: true, do_anuncio: false, oferecido_por: lead.corretor_phone || 'corretor',
  }).select('id').single();
  if (error || !novo) return { ok: false, erro: 'Não consegui incluir o imóvel agora. Tente de novo em instantes.' };
  return { ok: true, id: (novo as { id: string }).id, rotulo: enderecoF + brl(valor) + (ref ? ' (ref. ' + ref + ')' : '') + ' · oferecido por você' };
}
