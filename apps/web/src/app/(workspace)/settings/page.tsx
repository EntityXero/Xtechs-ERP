'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsIndexPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace('/settings/organization');
  }, [router]);

  return null;
}
