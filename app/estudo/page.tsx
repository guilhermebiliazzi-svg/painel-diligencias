// Ficha de captação: o corretor preenche na visita e manda tudo de uma vez
// para a Eva fazer o estudo de mercado (WhatsApp). Liberada para quem tem
// Postagens (corretores associados) e para admin.
import Link from 'next/link';
import { exigirTela } from '@/lib/perfil';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Ficha from './ficha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ficha de captação — REMAX Ville' };

export default async function Page() {
  const perfil = await exigirTela('estudo');
  // 20/11: para a gestão, quantos estudos esperam aprovação
  let aguardando = 0;
  if (perfil.is_admin) {
    const { count } = await supabaseAdmin().from('painel_estudo_pedidos').select('id', { count: 'exact', head: true }).eq('aprovacao', 'aguardando');
    aguardando = count ?? 0;
  }
  return (
    <>
      {aguardando > 0 && (
        <div style={{ background: '#fff7e6', borderBottom: '1px solid #f5c26b', color: '#7a4b00', padding: '10px 16px', fontSize: 14, textAlign: 'center' }}>
          {aguardando === 1 ? '1 estudo espera' : aguardando + ' estudos esperam'} a sua aprovação.{' '}
          <Link href="/estudo/aprovar" style={{ fontWeight: 700, textDecoration: 'underline', color: '#7a4b00' }}>Abrir aprovações</Link>
        </div>
      )}
      <Ficha />
    </>
  );
}
