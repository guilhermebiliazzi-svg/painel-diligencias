// POST /api/adm/diligencia-pdf/[id]
// Junta num PDF só todas as certidões da diligência (as que têm arquivo no Drive),
// com uma capa-índice na ordem da tela. Cards e titulares ocultos ficam de fora.
//
// O PDF pronto vai para o Storage (documentos/diligencia-pdf/<id>.pdf, sobrescrito
// a cada geração) e a resposta traz um link assinado de download — a Vercel não
// devolve respostas acima de 4,5 MB, e o PDF de uma diligência grande passa disso.
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { podeVerDiligencia } from '@/lib/diligencia-acesso';
import { downloadDriveFile, driveFileMeta, type DriveMeta } from '@/lib/drive';
import type { RowOrdem } from '@/lib/diligencia-ordem';
import { montarPdfCertidoes, secoesDaDiligencia, type ItemPdf } from '@/lib/diligencia-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUCKET = 'documentos';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARALELO = 6;
// Arquivos acima disso ficam fora (listados na capa) para o PDF não passar do
// limite do Storage nem estourar memória/tempo da função.
const LIMITE_ARQUIVO = 20 * 1048576;
const LIMITE_TOTAL = 45 * 1048576;

type Row = RowOrdem & {
  endereco: string;
  cliente_nome: string | null;
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
    .replace(/[\u0300-\u036f]/g, '')
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
  try {
    return await gerar(id);
  } catch (e) {
    console.error('[diligencia-pdf] erro', e);
    const msg = e instanceof Error ? e.message : String(e);
    return erro(`Não consegui gerar o PDF (${msg.slice(0, 200)}).`, 500);
  }
}

async function gerar(id: string) {
  if (!UUID_RE.test(id)) return erro('Diligência inválida.');
  if (!(await podeVerDiligencia(id))) return erro('Sem acesso a esta diligência.', 403);

  const { rows: todas } = await pool.query(
    `SELECT * FROM painel.v_painel_cliente_admin WHERE diligencia_id = $1 ORDER BY titular NULLS FIRST, certidao`,
    [id]
  );
  if (!todas.length) return erro('Diligência não encontrada.', 404);
  const rows = (todas as Row[]).filter((r) => !r.card_oculto && !r.titular_oculto);
  if (!rows.length) return erro('Todos os cards desta diligência estão ocultos.');

  const { endereco, cliente_nome } = todas[0] as Row;

  // 1) Tamanho de cada arquivo no Drive; 2) escolhe o que cabe; 3) baixa (em paralelo)
  type Baixado = { arquivo: ItemPdf['arquivo']; fora: ItemPdf['foraMotivo'] };
  const porCert = new Map<string, Baixado>();
  const comArquivo = rows.filter((r) => r.drive_file_id);
  const metas = await emParalelo(comArquivo, PARALELO, async (r) => {
    try {
      return await driveFileMeta(r.drive_file_id!);
    } catch (e) {
      console.error('[diligencia-pdf] meta', r.certidao_id, e);
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
      console.error('[diligencia-pdf] download', r.certidao_id, e);
      porCert.set(r.certidao_id, { arquivo: null, fora: { tipo: 'falha' } });
    }
  });

  // Mesma ordem e numeração da tela
  const secoes = secoesDaDiligencia(rows, endereco, porCert);

  const geradoEm = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let pdf;
  try {
    pdf = await montarPdfCertidoes({ endereco, cliente: cliente_nome, geradoEm, secoes });
  } catch (e) {
    console.error('[diligencia-pdf] montar', e);
    return erro('Não consegui montar o PDF.', 500);
  }
  if (!pdf.incluidas) return erro('Nenhuma certidão desta diligência tem arquivo ainda.', 404);

  const path = `diligencia-pdf/${id}.pdf`;
  const sb = supabaseAdmin();
  const up = await sb.storage.from(BUCKET).upload(path, Buffer.from(pdf.bytes), { contentType: 'application/pdf', upsert: true });
  if (up.error) {
    console.error('[diligencia-pdf] upload', up.error.message);
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
