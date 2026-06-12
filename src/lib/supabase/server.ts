/**
 * Cliente Supabase para Server Components, Route Handlers y Server Actions.
 * - Lee/escribe cookies en el request actual.
 * - El refresco de token vive en middleware.ts; este cliente solo se beneficia.
 * - SIEMPRE se crea por request. Nunca lo guardes en singleton entre peticiones.
 *
 * Patrón: @supabase/ssr docs para Next.js 16.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';

export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Llamar `set` desde un Server Component falla (read-only). En ese
            // caso el middleware se encarga de refrescar. Es esperado.
          }
        },
      },
    }
  );
}
