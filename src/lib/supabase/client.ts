/**
 * Cliente Supabase para el navegador.
 * Se crea una vez por sesión y se reutiliza en todos los componentes cliente.
 * Patrón basado en la guía oficial de @supabase/ssr para Next.js App Router.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

export function createSupabaseBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
