// 15/11: arquivo de um estudo gerado pelo painel (painel_estudo_pedidos). No primeiro acesso depois de pronto,
// o PowerPoint sai da tabela (base64) e vai para o Storage; daí em diante, link assinado de 24 h.
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'documentos';
const PASTA = 'estudos-painel';
const VALIDADE_LINK = 24 * 3600;

export type PedidoEstudo = {
  id: string; email: string | null; status: string; mensagem: string | null; arquivo_path: string | null;
  criado_em: string; nome_arquivo: string | null; lead_id: string | null;
  // 20/11: aprovação do Guilherme (aguardando | aprovado | correcao; null = estudos antigos)
  aprovacao: string | null; aprovacao_obs: string | null;
};

export async function lerPedido(id: string): Promise<PedidoEstudo | null> {
  const { data } = await supabaseAdmin()
    .from('painel_estudo_pedidos')
    .select('id, email, status, mensagem, arquivo_path, criado_em, lead_id, aprovacao, aprovacao_obs, nome_arquivo:payload->>nome_arquivo')
    .eq('id', id)
    .maybeSingle();
  return (data as PedidoEstudo | null) ?? null;
}

/** Link para baixar (null se ainda não há arquivo). */
export async function linkDoEstudo(p: PedidoEstudo): Promise<{ url: string; nome: string } | { erro: string } | null> {
  const sb = supabaseAdmin();
  const nome = String(p.nome_arquivo || 'Estudo_Mercado.pptx');
  let path = p.arquivo_path;
  if (!path && p.status === 'pronto') {
    const { data: b } = await sb.from('painel_estudo_pedidos').select('arquivo_b64').eq('id', p.id).single();
    if (b?.arquivo_b64) {
      path = `${PASTA}/${p.id}.pptx`;
      const up = await sb.storage.from(BUCKET).upload(path, Buffer.from(b.arquivo_b64, 'base64'), {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      });
      if (up.error) {
        console.error('[estudo] storage', up.error);
        return { erro: 'O estudo ficou pronto, mas não consegui guardar o arquivo. Tente de novo.' };
      }
      await sb.from('painel_estudo_pedidos').update({ arquivo_path: path, arquivo_b64: null }).eq('id', p.id);
    }
  }
  if (!path) return null;
  const { data: link } = await sb.storage.from(BUCKET).createSignedUrl(path, VALIDADE_LINK, { download: nome });
  return link?.signedUrl ? { url: link.signedUrl, nome } : { erro: 'Não consegui gerar o link do arquivo.' };
}
