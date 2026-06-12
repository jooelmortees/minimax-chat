import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ChatShell } from '@/components/chat/ChatShell';

export default async function HomePage() {
  let user: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error('[home] getUser() falló, redirigiendo a /login:', err);
    redirect('/login');
  }

  // Doble check: el middleware ya redirige, pero por si acedo directo a este componente.
  if (!user) redirect('/login');

  const supabase = await createSupabaseServer();
  // Carga inicial server-side del perfil y las prefs para que el shell ya
  // tenga los datos correctos en el primer render (sin parpadeo de defaults).
  const [profileRes, prefsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('prefs').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  return (
    <ChatShell
      initialEmail={user.email ?? null}
      initialDisplayName={profileRes.data?.display_name ?? null}
      initialPrefs={prefsRes.data ?? null}
    />
  );
}
