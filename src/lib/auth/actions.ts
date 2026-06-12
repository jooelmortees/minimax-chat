'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  if (!email || !password) {
    return { error: 'Email y contraseña son obligatorios.' };
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  revalidatePath('/', 'layout');
  redirect(next || '/');
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

function mapAuthError(message: string): string {
  // Mensajes de Supabase en inglés → los pasamos a algo entendible.
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirma tu email antes de iniciar sesión.';
  }
  if (lower.includes('user not found')) {
    return 'No existe ninguna cuenta con ese email.';
  }
  if (lower.includes('rate limit')) {
    return 'Demasiados intentos. Espera unos minutos.';
  }
  return message;
}
