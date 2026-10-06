/**
 * node-postgres currently treats `sslmode=require` as full certificate
 * verification, and has announced that its next major version will weaken that
 * to "encrypt without verifying". Asking for `verify-full` explicitly keeps the
 * stronger guarantee across that upgrade.
 *
 * URLs without an `sslmode`, such as a local or CI Postgres, are left alone.
 */
export function requireVerifiedTls(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (url.searchParams.get('sslmode') === 'require') {
    url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
}
