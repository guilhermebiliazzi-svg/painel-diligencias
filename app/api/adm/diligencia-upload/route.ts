// Envio de arquivo direto no card da diligência (sem passar pelo Drive na mão).
//
// 1) POST { acao: "upload-url", certidao_id, nome, mime }
//      -> URL assinada p/ o NAVEGADOR subir o arquivo no Storage do Supabase
//         (direto, sem passar pela Vercel -> sem limite de 4,5 MB)
// 2) POST { acao: "enviar", certidao_id, path, nome }
//      -> o n8n ("Painel — Enviar arquivo para o card") baixa do Storage, salva na
//         pasta do Drive do card (certidoes_status.pasta_id) e manda para o WF-13,
//         que confere com a IA (ou só conclui, se o card for documento manual).
//         Depois o arquivo temporário sai do Storage.
//
// Segurança: o webhook do n8n só aceita chamadas com o segredo
// credenciais_sistema['painel_upload_secret'] (lido aqui com service_role), e só
// baixa de URL assinada do Storage deste projeto.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { pool } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSessaoPerfil } from '@/lib/perfil';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BUCKET = 'documentos';
const N8N = (process.env.N8N_WEBHOOK_BASE || 'https://villejds.app.n8n.cloud/webhook').replace(/\/+$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_OK = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

// Mesmo acesso da tela /admin: admin ou pode_diligencias (ou a senha antiga).
async function acessoDiligencias(): Promise<boolean> {
  try {
    const c = (await cookies()).get('admin_session');
    const tok = process.env.ADMIN_SESSION_TOKEN;
    if (c && tok && c.value === tok) return true;
  } catch {
    /* sem cookie */
  }
  try {
    const { perfil } = await getSessaoPerfil();
    return !!perfil && perfil.ativo && (perfil.is_admin || perfil.pode_diligencias);
  } catch {
    return false;
  }
}

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

type Cert = { id: string; diligencia_id: string; pasta_id: string | null; manual: boolean | null };

async function carregarCertidao(id: string): Promise<Cert | null> {
  const r = await pool.query(
    `SELECT id::text AS id, diligencia_id::text AS diligencia_id, pasta_id, manual
       FROM certidoes_status WHERE id = $1`,
    [id]
  );
  return (r.rows[0] as Cert) ?? null;
}

export async function POST(req: Request) {
  if (!(await acessoDiligencias())) return erro('Sem acesso a diligências.', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return erro('Corpo inválido.');
  }
  const certidaoId = String(body?.certidao_id || '');
  if (!UUID_RE.test(certidaoId)) return erro('Card inválido.');
  const cert = await carregarCertidao(certidaoId);
  if (!cert) return erro('Card não encontrado.', 404);
  if (!cert.pasta_id) return erro('Este card não tem pasta no Drive. Use "Vincular PDF".');

  const sb = supabaseAdmin();
  const prefixo = `diligencias/${cert.diligencia_id}/${cert.id}/`;

  // 1) URL para o navegador subir o arquivo
  if (body.acao === 'upload-url') {
    const mime = String(body.mime || '');
    if (!TIPOS_OK.test(mime)) return erro('Envie um PDF ou uma foto (JPG/PNG).');
    if (!cert.manual && !/pdf/i.test(mime)) {
      return erro('Certidão precisa ser em PDF para a IA conferir. Foto só nos documentos pessoais.');
    }
    const path = `${prefixo}${Date.now()}-${slug(String(body.nome || 'arquivo'))}`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return erro('Falha ao preparar o envio.', 502);
    return NextResponse.json({ path: data.path, signedUrl: data.signedUrl });
  }

  // 2) Mandar para o Drive (n8n) e para a conferência
  if (body.acao === 'enviar') {
    const path = String(body.path || '');
    if (!path.startsWith(prefixo)) return erro('Arquivo inválido.');
    const nome = String(body.nome || 'arquivo').slice(0, 200);

    const { data: sec } = await sb
      .from('credenciais_sistema')
      .select('valor')
      .eq('chave', 'painel_upload_secret')
      .maybeSingle();
    const segredo = (sec as { valor?: string } | null)?.valor;
    if (!segredo) return erro('Envio direto ainda não configurado (segredo ausente).', 503);

    const { data: link, error: e1 } = await sb.storage.from(BUCKET).createSignedUrl(path, 900);
    if (e1 || !link?.signedUrl) return erro('Arquivo não encontrado no envio. Tente de novo.', 404);

    let resp: Response;
    try {
      resp = await fetch(`${N8N}/painel-enviar-arquivo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-painel-secret': segredo },
        body: JSON.stringify({ certidao_id: cert.id, url: link.signedUrl, nome }),
        signal: AbortSignal.timeout(100_000),
      });
    } catch {
      return erro('O n8n não respondeu. Tente de novo em instantes.', 504);
    }
    const out = await resp.json().catch(() => ({}) as any);
    if (!resp.ok || !out?.ok) {
      return erro(out?.erro || `Falha ao salvar no Drive (HTTP ${resp.status}).`, 502);
    }

    // o arquivo já está no Drive; a cópia temporária sai do Storage
    await sb.storage.from(BUCKET).remove([path]).catch(() => null);

    return NextResponse.json({ ok: true, drive_file_id: out.drive_file_id, manual: !!cert.manual });
  }

  return erro('Ação desconhecida.');
}
