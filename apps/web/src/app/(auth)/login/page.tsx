import type { Metadata } from 'next';

import { CredentialsForm } from '@/features/auth/credentials-form';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Sign in' };

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const next = safeNextPath((await searchParams).next);

  return (
    <>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground">Welcome back. Enter your details to continue.</p>
      </div>
      <CredentialsForm mode="login" next={next} />
    </>
  );
}
