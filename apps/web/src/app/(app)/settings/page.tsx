import type { Metadata } from 'next';

import { AccountSettings } from '@/features/account/account-settings';

export const metadata: Metadata = { title: 'Settings' };

/** The account, and the way to delete it. */
export default function SettingsPage() {
  return <AccountSettings />;
}
