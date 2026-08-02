// Cliente Supabase para Server Components / Server Actions / Route Handlers.
// Lê e grava a sessão nos cookies da requisição (padrão @supabase/ssr).
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(list) {
          // Em Server Components o set pode falhar (só leitura) — ok ignorar,
          // o proxy cuida de renovar a sessão.
          try {
            list.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {}
        },
      },
    }
  );
}
