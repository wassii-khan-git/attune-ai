import type { Metadata } from 'next';

import { AccountSettings } from '@/features/account/account-settings';

export const metadata: Metadata = { title: 'Settings' };

/** The account, the theme, how data is treated, and the way to delete everything. */
export default function SettingsPage() {
  return <AccountSettings />;
}
