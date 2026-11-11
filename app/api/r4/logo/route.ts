// POST /api/r4/logo — logo da unidade (multipart: arquivo, [unidade_id], [acao=remover]).
// Responsável da unidade: a própria unidade. Superadmin: qualquer uma (unidade_id).
// Vai para o Storage do rquatro (bucket público "logos") e unidades.logo_url.
// Usado no cabeçalho do rquatro, no link do cliente e na capa do PDF das certidões.
import { NextResponse } from 'next/server';
import { r4Admin, r4UsuarioAtual } from '@/lib/r4/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITE = 2 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(req: Request) {
  const u = await r4UsuarioAtual();
  if (!u || !u.ativo) return erro('Sessão expirada. Entre de novo.', 401);
  if (u.papel !== 'admin' && u.papel !== 'superadmin') return erro('Só o responsável da unidade pode trocar o logo.', 403);

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return erro('Envio inválido.');
  }
  const unidadeId = u.papel === 'superadmin' ? String(fd.get('unidade_id') || '') : u.unidade_id || '';
  if (!UUID_RE.test(unidadeId)) return erro('Unidade inválida.');

  const adm = r4Admin();
  const { data: un } = await adm.from('unidades').select('id,logo_url').eq('id', unidadeId).maybeSingle();
  if (!un) return erro('Unidade não encontrada.', 404);

  if (fd.get('acao') === 'remover') {
    await adm.from('unidades').update({ logo_url: null }).eq('id', unidadeId);
    return NextResponse.json({ ok: true, logo_url: null });
  }

  const arq = fd.get('arquivo');
  if (!(arq instanceof File) || !arq.size) return erro('Escolha a imagem do logo.');
  if (arq.size > LIMITE) return erro('Imagem acima de 2 MB. Use um PNG ou JPG menor.');
  const b = new Uint8Array(await arq.arrayBuffer());
  // confere o conteúdo, não só a extensão (o PDF aceita PNG e JPG)
  const tipo = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : null;
  if (!tipo) return erro('Envie o logo em PNG (de preferência com fundo transparente) ou JPG.');

  const path = `${unidadeId}/logo-${Date.now()}.${tipo}`;
  const up = await adm.storage
    .from('logos')
    .upload(path, Buffer.from(b), { contentType: tipo === 'png' ? 'image/png' : 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (up.error) {
    console.error('[r4 logo] upload', up.error.message);
    return erro('Não consegui salvar a imagem. Tente de novo.', 502);
  }
  const { data: pub } = adm.storage.from('logos').getPublicUrl(path);
  const { error } = await adm.from('unidades').update({ logo_url: pub.publicUrl }).eq('id', unidadeId);
  if (error) return erro('Imagem salva, mas não consegui ligar à unidade. Tente de novo.', 502);
  return NextResponse.json({ ok: true, logo_url: pub.publicUrl });
}
