// Ficha de captação: o corretor preenche na visita e manda tudo de uma vez
// para a Eva fazer o estudo de mercado (WhatsApp). Liberada para quem tem
// Postagens (corretores associados) e para admin.
import { exigirPostagens } from '@/lib/perfil';
import Ficha from './ficha';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ficha de captação — REMAX Ville' };

export default async function Page() {
  await exigirPostagens();
  return <Ficha />;
}
