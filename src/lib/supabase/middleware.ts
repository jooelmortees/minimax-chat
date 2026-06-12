/**
 * Cliente Supabase para el middleware de Next.js. Refresca la sesión y
 * mantiene `getUser()` validado en cada request.
 *
 * Patrón: https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si no hay env vars (build fallido, deploy mal configurado, etc.) devolvemos
  // respuesta neutra: el caller decidirá qué hacer. Mejor un proxy permisivo
  // que un 500 que rompa toda la app.
  if (!url || !anonKey) {
    console.warn(
      '[supabase middleware] NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no están definidas; el proxy continúa sin verificar sesión.'
    );
    return { response, user: null, supabase: null };
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() hace una llamada a /auth/v1/user. Si falla (red, key inválida,
  // 5xx de Supabase) capturamos y degradamos a "no autenticado" en vez de
  // romper toda la request. La página renderizada luego hará su propio getUser
  // server-side con manejo de errores.
  let user: { id: string; email?: string | null } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error('[supabase middleware] getUser() falló:', err);
    user = null;
  }

  return { response, user, supabase };
}
