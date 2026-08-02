// Cliente Supabase para Server Components / Server Actions / Route Handlers.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

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
        setAll(list: CookieParaGravar[]) {
          try {
            list.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {}
        },
      },
    }
  );
}
