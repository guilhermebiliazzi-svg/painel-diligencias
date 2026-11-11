// rquatro — envio de arquivo direto no card (mesmo caminho do painel da Ville,
// ver app/api/adm/diligencia-upload/route.ts), com a conferência de unidade:
// o card tem de ser de uma diligência da unidade de quem está logado.
//
// 1) { acao: "upload-url", certidao_id, nome, mime } -> URL assinada do Storage
// 2) { acao: "enviar", certidao_id, path, nome }    -> n8n salva na pasta do Drive
//    do card e manda conferir (WF-13). O arquivo enviado pela unidade fica
//    registrado com preço 0 (não é cobrado como emissão).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exigirCardPeloId, SemAcesso } from '@/lib/r4/diligencia';
import { registrarSemCobranca } from '@/lib/r4/motor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BUCKET = 'documentos';
const N8N = (process.env.N8N_WEBHOOK_BASE || 'https://villejds.app.n8n.cloud/webhook').replace(/\/+$/, '');
const TIPOS_OK = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function slug(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return (base || 'arquivo').slice(-120);
}

export async function POST(req: Request) {
  let body: { acao?: string; certidao_id?: string; nome?: string; mime?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return erro('Corpo inválido.');
  }

  let ctx;
  try {
    ctx = await exigirCardPeloId(String(body?.certidao_id || ''));
  } catch (e) {
    return erro(e instanceof SemAcesso ? e.message : 'Sem acesso.', 403);
  }
  const { dil, card } = ctx;
  if (!card.pasta_id) return erro('Este card não tem pasta no Drive. Use "Vincular PDF".');

  const sb = supabaseAdmin();
  const prefixo = `r4/${card.diligencia_id}/${card.id}/`;

  if (body.acao === 'upload-url') {
    const mime = String(body.mime || '');
    if (!TIPOS_OK.test(mime)) return erro('Envie um PDF ou uma foto (JPG/PNG).');
    if (!card.manual && !/pdf/i.test(mime)) {
      return erro('Certidão precisa ser em PDF para a conferência automática. Foto só nos documentos pessoais.');
    }
    const path = `${prefixo}${Date.now()}-${slug(String(body.nome || 'arquivo'))}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return erro('Falha ao preparar o envio.', 502);
    return NextResponse.json({ path: data.path, signedUrl: data.signedUrl });
  }

  if (body.acao === 'enviar') {
    const path = String(body.path || '');
    if (!path.startsWith(prefixo)) return erro('Arquivo inválido.');
    const nome = String(body.nome || 'arquivo').slice(0, 200);

    const { data: sec } = await sb.from('credenciais_sistema').select('valor').eq('chave', 'painel_upload_secret').maybeSingle();
    const segredo = (sec as { valor?: string } | null)?.valor;
    if (!segredo) return erro('Envio direto ainda não configurado.', 503);

    const { data: link, error: e1 } = await sb.storage.from(BUCKET).createSignedUrl(path, 900);
    if (e1 || !link?.signedUrl) return erro('Arquivo não encontrado no envio. Tente de novo.', 404);

    let resp: Response;
    try {
      resp = await fetch(`${N8N}/painel-enviar-arquivo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-painel-secret': segredo },
        body: JSON.stringify({ certidao_id: card.id, url: link.signedUrl, nome }),
        signal: AbortSignal.timeout(100_000),
      });
    } catch {
      return erro('O sistema não respondeu. Tente de novo em instantes.', 504);
    }
    const out = (await resp.json().catch(() => ({}))) as { ok?: boolean; erro?: string; drive_file_id?: string };
    if (!resp.ok || !out?.ok) return erro(out?.erro || `Falha ao salvar no Drive (HTTP ${resp.status}).`, 502);

    if (out.drive_file_id) {
      await registrarSemCobranca(dil, { certidao_id: card.id, tipo: card.tipo, titular: card.titular }, out.drive_file_id);
    }
    await sb.storage.from(BUCKET).remove([path]).catch(() => null);
    return NextResponse.json({ ok: true, drive_file_id: out.drive_file_id, manual: card.manual });
  }

  return erro('Ação desconhecida.');
}
