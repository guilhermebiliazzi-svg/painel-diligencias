import { redirect } from 'next/navigation';
import { r4Base } from '@/lib/r4/supabase';

// rquatro — qualquer endereço que não existe volta para o início (que leva ao
// login), em vez de cair na página "Diligência não encontrada" da Ville.
export const dynamic = 'force-dynamic';

export default async function EnderecoInexistenteR4() {
  const base = await r4Base();
  redirect(`${base}/`);
}
