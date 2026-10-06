import type { Metadata } from 'next';

import { CredentialsForm } from '@/features/auth/credentials-form';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Create an account' };

type RegisterPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const next = safeNextPath((await searchParams).next);

  return (
    <>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-muted-foreground">
          Keep your visits beyond the 24 hours a guest session lasts.
        </p>
      </div>
      <CredentialsForm mode="register" next={next} />
    </>
  );
}
