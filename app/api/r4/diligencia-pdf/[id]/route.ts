// POST /api/r4/diligencia-pdf/[id]   (id = diligência do rquatro)
// Junta num PDF só as certidões da diligência que têm arquivo, com capa-índice
// e o LOGO DA UNIDADE (mesma montagem do painel da Ville, outra marca).
// Cards e pessoas ocultos ficam de fora. O PDF vai para o Storage e a resposta
// traz um link assinado (a Vercel não devolve respostas acima de 4,5 MB).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { downloadDriveFile, driveFileMeta, type DriveMeta } from '@/lib/drive';
import type { RowOrdem } from '@/lib/diligencia-ordem';
import { montarPdfCertidoes, secoesDaDiligencia, type ItemPdf } from '@/lib/diligencia-pdf';
import { bytesDoLogo, exigirDiligenciaR4, marcaDaUnidade, SemAcesso } from '@/lib/r4/diligencia';
import { linhasAdminDoMotor } from '@/lib/r4/motor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUCKET = 'documentos';
const PARALELO = 6;
const LIMITE_ARQUIVO = 20 * 1048576;
const LIMITE_TOTAL = 45 * 1048576;

type Row = RowOrdem & {
  endereco: string;
  certidao: string | null;
  situacao: string;
  data_emissao: string | null;
  drive_file_id: string | null;
  card_oculto: boolean;
  titular_oculto: boolean;
};

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function nomeArquivo(endereco: string): string {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-');
  const base = String(endereco || 'diligencia')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `Certidoes_${base || 'diligencia'}_${hoje}.pdf`;
}

async function emParalelo<T, R>(lista: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(lista.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (i < lista.length) {
        const k = i++;
        out[k] = await fn(lista[k]);
      }
    })
  );
  return out;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await exigirDiligenciaR4(id);
  } catch (e) {
    return erro(e instanceof SemAcesso ? e.message : 'Sem acesso.', 403);
  }
  try {
    return await gerar(ctx.dil);
  } catch (e) {
    console.error('[r4 diligencia-pdf] erro', e);
    const msg = e instanceof Error ? e.message : String(e);
    return erro(`Não consegui gerar o PDF (${msg.slice(0, 200)}).`, 500);
  }
}

async function gerar(dil: { id: string; unidade_id: string; motor_id: string; titulo: string | null }) {
  const todas = await linhasAdminDoMotor<Row>(dil.motor_id);
  if (!todas.length) return erro('As certidões ainda estão sendo criadas.', 404);
  const rows = todas.filter((r) => !r.card_oculto && !r.titular_oculto);
  if (!rows.length) return erro('Todos os cards desta diligência estão ocultos.');
  const endereco = todas[0].endereco || dil.titulo || '';

  type Baixado = { arquivo: ItemPdf['arquivo']; fora: ItemPdf['foraMotivo'] };
  const porCert = new Map<string, Baixado>();
  const comArquivo = rows.filter((r) => r.drive_file_id);
  const metas = await emParalelo(comArquivo, PARALELO, async (r) => {
    try {
      return await driveFileMeta(r.drive_file_id!);
    } catch (e) {
      console.error('[r4 diligencia-pdf] meta', r.certidao_id, e);
      return null;
    }
  });
  const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
  let total = 0;
  const baixar: { r: Row; meta: DriveMeta }[] = [];
  comArquivo.forEach((r, i) => {
    const meta = metas[i];
    if (!meta) {
      porCert.set(r.certidao_id, { arquivo: null, fora: { tipo: 'falha' } });
      return;
    }
    const tam = meta.size ?? 0;
    if (tam > LIMITE_ARQUIVO || total + tam > LIMITE_TOTAL) {
      porCert.set(r.certidao_id, { arquivo: null, fora: { tipo: 'grande', mb: mb(tam) } });
      return;
    }
    total += tam;
    baixar.push({ r, meta });
  });
  await emParalelo(baixar, PARALELO, async ({ r, meta }) => {
    try {
      const f = await downloadDriveFile(r.drive_file_id!, meta);
      porCert.set(r.certidao_id, { arquivo: { bytes: f.bytes, mimeType: f.mimeType }, fora: null });
    } catch (e) {
      console.error('[r4 diligencia-pdf] download', r.certidao_id, e);
      porCert.set(r.certidao_id, { arquivo: null, fora: { tipo: 'falha' } });
    }
  });

  const secoes = secoesDaDiligencia(rows, endereco, porCert);
  const geradoEm = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const un = await marcaDaUnidade(dil.unidade_id);
  const logo = await bytesDoLogo(un.logo_url);

  const pdf = await montarPdfCertidoes({ endereco, cliente: null, geradoEm, secoes, marca: { nome: un.nome, logo } });
  if (!pdf.incluidas) {
    if (porCert.size && [...porCert.values()].every((b) => b.fora?.tipo === 'falha')) {
      return erro('O sistema ainda não tem leitura da pasta do Drive da unidade. Peça ao responsável para salvar a pasta de novo em Minha unidade.', 409);
    }
    return erro('Nenhuma certidão desta diligência tem arquivo ainda.', 404);
  }

  const path = `r4/diligencia-pdf/${dil.id}.pdf`;
  const sb = supabaseAdmin();
  const up = await sb.storage.from(BUCKET).upload(path, Buffer.from(pdf.bytes), { contentType: 'application/pdf', upsert: true });
  if (up.error) {
    console.error('[r4 diligencia-pdf] upload', up.error.message);
    return erro('Não consegui salvar o PDF para download.', 502);
  }
  const nome = nomeArquivo(endereco);
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600, { download: nome });
  if (!data?.signedUrl) return erro('Não consegui gerar o link de download.', 502);

  return NextResponse.json({
    ok: true,
    url: data.signedUrl,
    nome,
    incluidas: pdf.incluidas,
    paginas: pdf.paginas,
    pendentes: pdf.pendentes,
    nao_incluidas: pdf.naoIncluidas,
    tamanho_mb: Math.round((pdf.bytes.length / 1048576) * 10) / 10,
  });
}
