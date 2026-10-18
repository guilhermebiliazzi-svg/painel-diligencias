// POST /api/adm/ccv-gdocs/[id]
// "Abrir no Google Docs": gera o .docx do CCV mais recente da diligência (o mesmo
// do botão "Baixar .docx"), manda para o n8n ("Painel — CCV no Google Docs"), que
// salva na pasta da diligência no Drive de guilhermebiliazzi@remax.com.br já
// convertido em Google Docs, e devolve o link para abrir.
//
// Segurança: só quem pode ver a diligência; o webhook do n8n só aceita chamadas com
// o segredo credenciais_sistema['painel_upload_secret'] (o mesmo do envio de arquivo).
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { podeVerDiligencia } from '@/lib/diligencia-acesso';
import { gerarCcvDocx } from '@/lib/ccv-docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const N8N = (process.env.N8N_WEBHOOK_BASE || 'https://villejds.app.n8n.cloud/webhook').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

function nomeDoc(endereco: string | null): string {
  const quando = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const base = (endereco || 'Compromisso de Compra e Venda').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 120);
  return `CCV - ${base} - ${quando}`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return erro('Diligência inválida.');
  if (!(await podeVerDiligencia(id))) return erro('Sem acesso a esta diligência.', 403);

  const r = await pool.query(
    `SELECT c.documento_md, c.status, d.endereco, d.pasta_drive_id
       FROM ccvs c
       JOIN diligencias d ON d.id = c.diligencia_id
      WHERE c.diligencia_id = $1
      ORDER BY c.criado_em DESC
      LIMIT 1`,
    [id]
  );
  const row = r.rows[0];
  if (!row?.documento_md) return erro('CCV ainda não gerado para esta diligência.', 404);
  if (!row.pasta_drive_id) return erro('Esta diligência não tem pasta no Drive.', 409);

  let docx: Buffer;
  try {
    docx = Buffer.from(await gerarCcvDocx({ documento_md: row.documento_md, status: row.status }));
  } catch (e) {
    console.error('ccv-gdocs docx:', e);
    return erro('Falha ao montar o documento.', 500);
  }

  const { data: sec } = await supabaseAdmin()
    .from('credenciais_sistema')
    .select('valor')
    .eq('chave', 'painel_upload_secret')
    .maybeSingle();
  const segredo = (sec as { valor?: string } | null)?.valor;
  if (!segredo) return erro('Integração com o Drive não configurada (segredo ausente).', 503);

  let resp: Response;
  try {
    resp = await fetch(`${N8N}/painel-ccv-gdocs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-painel-secret': segredo },
      body: JSON.stringify({ diligencia_id: id, nome: nomeDoc(row.endereco), docx_base64: docx.toString('base64') }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return erro('O n8n não respondeu. Tente de novo em instantes.', 504);
  }
  const out = await resp.json().catch(() => ({}) as any);
  if (!resp.ok || !out?.ok || !out?.url) {
    return erro(out?.erro || `Falha ao abrir no Google Docs (HTTP ${resp.status}).`, 502);
  }
  return NextResponse.json({ url: out.url });
}
