// Certificado de participação nas oficinas (PDF). Público pelo token: o link vai pelo Max no WhatsApp
// e fica em "Minhas oficinas" no painel.
import { gerarCertificadoPDF, lerCertificado } from '@/lib/certificado';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await lerCertificado(token);
  if (!d) return new Response('Certificado não encontrado.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const pdf = await gerarCertificadoPDF(d);
  const arq = `Certificado oficinas - ${d.nome}.pdf`.replace(/[^\p{L}\p{N} ._-]/gu, '');
  return new Response(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(arq)}`,
      'cache-control': 'private, no-store',
    },
  });
}
