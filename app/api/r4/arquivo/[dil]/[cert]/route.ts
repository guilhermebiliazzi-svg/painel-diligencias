// GET /api/r4/arquivo/<diligência do rquatro>/<card>
// Abre o PDF de um card para o CLIENTE (link público da diligência), sem a
// unidade precisar deixar a pasta do Drive aberta para qualquer pessoa.
// Só serve card visível ao cliente (painel.v_painel_cliente) da diligência do link.
// Arquivo grande demais para passar pela Vercel (> 4 MB) abre direto no Drive.
import { pool } from '@/lib/db';
import { downloadDriveFile, driveFileMeta } from '@/lib/drive';
import { pdfDeHtml, tipoDoArquivo } from '@/lib/diligencia-pdf';
import { r4Admin } from '@/lib/r4/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE = 4 * 1048576;

const nada = () => new Response('Documento não encontrado.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(_req: Request, { params }: { params: Promise<{ dil: string; cert: string }> }) {
  const { dil, cert } = await params;
  if (!UUID_RE.test(dil) || !UUID_RE.test(cert)) return nada();
  const { data } = await r4Admin().from('diligencias').select('motor_id').eq('id', dil).maybeSingle();
  const motorId = data?.motor_id as string | undefined;
  if (!motorId) return nada();

  const r = await pool.query(
    `SELECT cs.drive_file_id, cs.url_pdf, COALESCE(v.certidao, cs.tipo) AS nome
       FROM painel.v_painel_cliente v
       JOIN certidoes_status cs ON cs.id = v.certidao_id
       JOIN diligencias d ON d.id = v.diligencia_id
      WHERE v.diligencia_id = $1 AND v.certidao_id = $2 AND d.dados_completos ->> 'origem' = 'rquatro'`,
    [motorId, cert]
  );
  const row = r.rows[0] as { drive_file_id: string | null; url_pdf: string | null; nome: string } | undefined;
  if (!row?.drive_file_id) return nada();

  try {
    const meta = await driveFileMeta(row.drive_file_id);
    if ((meta.size ?? 0) > LIMITE) {
      return Response.redirect(row.url_pdf || `https://drive.google.com/file/d/${row.drive_file_id}/view`, 302);
    }
    const f = await downloadDriveFile(row.drive_file_id, meta);
    const nome = String(row.nome || 'documento')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9 ._-]+/g, '')
      .trim()
      .slice(0, 80);
    // Confere o conteúdo, não o tipo gravado no Drive: alguns sites devolvem um
    // comprovante em HTML que foi salvo com nome .pdf (Mobiliária, SEFAZ-SP).
    const tipo = tipoDoArquivo(f.bytes, f.mimeType);
    let corpo: Uint8Array = f.bytes;
    let ct = f.mimeType || 'application/octet-stream';
    let ext = '';
    if (tipo === 'pdf') {
      ct = 'application/pdf';
      ext = '.pdf';
    } else if (tipo === 'html') {
      corpo = await pdfDeHtml(f.bytes, String(row.nome || 'Documento'));
      ct = 'application/pdf';
      ext = '.pdf';
    } else if (tipo === 'jpg' || tipo === 'png') {
      ct = tipo === 'jpg' ? 'image/jpeg' : 'image/png';
      ext = tipo === 'jpg' ? '.jpg' : '.png';
    }
    return new Response(Buffer.from(corpo), {
      headers: {
        'content-type': ct,
        'content-disposition': `inline; filename="${nome || 'documento'}${ext}"`,
        'cache-control': 'private, max-age=300',
        'x-robots-tag': 'noindex',
      },
    });
  } catch (e) {
    console.error('[r4 arquivo]', cert, e);
    // sem leitura pela conta do painel: tenta o link do Drive
    if (row.url_pdf) return Response.redirect(row.url_pdf, 302);
    return nada();
  }
}
