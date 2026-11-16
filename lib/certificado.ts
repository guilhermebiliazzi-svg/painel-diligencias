// Certificado de participação nas oficinas da loja: quem tem presença em todas as
// oficinas ativas recebe o certificado em PDF. O link é público, pelo token de
// onb_certificados_oficinas (painel.villejardins.com.br/certificado/<token>), e vai pelo Max no WhatsApp.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { LOGO_DIPLOMA_B64 } from '@/lib/diploma-logo';
import { ASSINATURA_B64 } from '@/lib/certificado-assinatura';

export type DadosCertificado = {
  nome: string;
  concluido_em: string; // AAAA-MM-DD (data da última oficina)
  oficinas: { nome: string; data: string }[];
  token: string;
};

const NAVY = rgb(14 / 255, 39 / 255, 73 / 255);
const AZUL = rgb(0, 67 / 255, 1);
const VERMELHO = rgb(1, 18 / 255, 0);
const CINZA = rgb(90 / 255, 107 / 255, 133 / 255);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function nomeCertificado(nome: string): string {
  return String(nome || '').split(' - ')[0].trim();
}

function porExtenso(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  return `${dd} de ${MESES[m - 1]} de ${y}`;
}

function curta(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
}

// Lê o certificado pelo token. null se o token não existir.
export async function lerCertificado(token: string): Promise<DadosCertificado | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const sb = supabaseAdmin();
  const { data: dip } = await sb.from('onb_certificados_oficinas').select('corretor_id,concluido_em,token').eq('token', token).maybeSingle();
  if (!dip) return null;
  const [cor, ofi, pre] = await Promise.all([
    sb.from('corretores_associados').select('nome').eq('id', dip.corretor_id).maybeSingle(),
    sb.from('onb_oficinas').select('id,nome,ordem').eq('ativa', true).order('ordem'),
    sb.from('onb_oficina_presencas').select('oficina_id,data').eq('corretor_id', dip.corretor_id).order('data'),
  ]);
  const primeira = new Map<number, string>();
  for (const p of (pre.data ?? []) as { oficina_id: number; data: string }[]) {
    if (!primeira.has(Number(p.oficina_id))) primeira.set(Number(p.oficina_id), p.data);
  }
  return {
    nome: nomeCertificado((cor.data as { nome: string } | null)?.nome ?? ''),
    concluido_em: String(dip.concluido_em),
    token: String(dip.token),
    oficinas: ((ofi.data ?? []) as { id: number; nome: string }[]).map((o) => ({ nome: o.nome, data: primeira.get(Number(o.id)) ?? '' })),
  };
}

// Token do certificado de um corretor; cria o registro se ele já fez todas as oficinas
// (o gatilho do banco cria na hora da presença; isto cobre quem concluiu antes).
export async function tokenCertificado(corretorId: number): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('onb_certificados_oficinas').select('token').eq('corretor_id', corretorId).maybeSingle();
  if (data?.token) return String(data.token);
  const [ofi, pre] = await Promise.all([
    sb.from('onb_oficinas').select('id').eq('ativa', true),
    sb.from('onb_oficina_presencas').select('oficina_id,data').eq('corretor_id', corretorId),
  ]);
  const ids = ((ofi.data ?? []) as { id: number }[]).map((o) => Number(o.id));
  const primeira = new Map<number, string>();
  for (const p of (pre.data ?? []) as { oficina_id: number; data: string }[]) {
    const id = Number(p.oficina_id);
    if (!primeira.has(id) || p.data < primeira.get(id)!) primeira.set(id, p.data);
  }
  if (!ids.length || ids.some((id) => !primeira.has(id))) return null;
  const concluido = ids.map((id) => primeira.get(id)!).sort().at(-1)!;
  const { data: novo } = await sb
    .from('onb_certificados_oficinas')
    .upsert({ corretor_id: corretorId, concluido_em: concluido }, { onConflict: 'corretor_id', ignoreDuplicates: true })
    .select('token')
    .maybeSingle();
  if (novo?.token) return String(novo.token);
  const { data: de } = await sb.from('onb_certificados_oficinas').select('token').eq('corretor_id', corretorId).maybeSingle();
  return de?.token ? String(de.token) : null;
}

function centro(page: PDFPage, txt: string, y: number, size: number, font: PDFFont, color = NAVY) {
  const w = font.widthOfTextAtSize(txt, size);
  page.drawText(txt, { x: (page.getWidth() - w) / 2, y, size, font, color });
}

// Ajusta o corpo do nome para caber na largura disponível.
function corpoQueCabe(txt: string, font: PDFFont, max: number, larg: number): number {
  let s = max;
  while (s > 16 && font.widthOfTextAtSize(txt, s) > larg) s -= 1;
  return s;
}

export async function gerarCertificadoPDF(d: DadosCertificado): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado de participação — ${d.nome}`);
  pdf.setAuthor('REMAX Ville');
  const page = pdf.addPage([841.89, 595.28]); // A4 deitado
  const W = page.getWidth();
  const H = page.getHeight();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // molduras
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: NAVY, borderWidth: 3 });
  page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: VERMELHO, borderWidth: 0.8 });
  // faixas de cor no topo (vermelho, branco, azul do balão)
  page.drawRectangle({ x: 28, y: H - 34, width: (W - 56) / 2, height: 6, color: VERMELHO });
  page.drawRectangle({ x: 28 + (W - 56) / 2, y: H - 34, width: (W - 56) / 2, height: 6, color: AZUL });

  // logo
  const logo = await pdf.embedPng(Buffer.from(LOGO_DIPLOMA_B64, 'base64'));
  const lw = 150;
  const lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: (W - lw) / 2, y: H - 62 - lh, width: lw, height: lh });

  let y = H - 62 - lh - 42;
  centro(page, 'C E R T I F I C A D O   D E   P A R T I C I P A Ç Ã O', y, 15, bold, NAVY);
  y -= 34;
  centro(page, 'Certificamos que', y, 13, ital, CINZA);
  y -= 46;
  const sNome = corpoQueCabe(d.nome, bold, 34, W - 160);
  centro(page, d.nome, y, sNome, bold, NAVY);
  const nw = Math.min(bold.widthOfTextAtSize(d.nome, sNome) + 40, W - 140);
  page.drawLine({ start: { x: (W - nw) / 2, y: y - 10 }, end: { x: (W + nw) / 2, y: y - 10 }, thickness: 0.8, color: AZUL });
  y -= 38;
  centro(page, `participou das ${d.oficinas.length} oficinas da Formação de Corretores da REMAX Ville:`, y, 13, reg, NAVY);

  // oficinas com as datas
  y -= 28;
  for (const o of d.oficinas) {
    const t = `${o.nome}${o.data ? `  ·  ${curta(o.data)}` : ''}`;
    centro(page, t, y, 11, reg, CINZA);
    y -= 17;
  }

  // local e data
  y -= 12;
  centro(page, `São Paulo, ${porExtenso(d.concluido_em)}.`, y, 12, reg, NAVY);

  // assinatura
  const ay = 78;
  const ass = await pdf.embedPng(Buffer.from(ASSINATURA_B64, 'base64'));
  const sw = 190;
  const sh = (ass.height / ass.width) * sw;
  page.drawImage(ass, { x: (W - sw) / 2, y: ay + 12, width: sw, height: sh });
  page.drawLine({ start: { x: W / 2 - 120, y: ay + 16 }, end: { x: W / 2 + 120, y: ay + 16 }, thickness: 0.8, color: NAVY });
  centro(page, 'Guilherme Biliazzi', ay, 12, bold, NAVY);
  centro(page, 'Broker · REMAX Ville', ay - 15, 10, reg, CINZA);

  // verificação
  const v = `Autenticidade: painel.villejardins.com.br/certificado/${d.token}`;
  page.drawText(v, { x: W - 40 - reg.widthOfTextAtSize(v, 7), y: 36, size: 7, font: reg, color: CINZA });

  return pdf.save();
}
