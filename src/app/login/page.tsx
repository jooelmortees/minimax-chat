import { LoginForm } from './LoginForm';

interface LoginPageProps {
  searchParams: Promise<{ next?: string; message?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg text-fg p-4">
      <LoginForm next={params.next} message={params.message} />
    </div>
  );
}
