'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Scene Partner entry point is now My Scripts.
 * Redirect so /scenes and /scenes/ always land on My Scripts (single entry point).
 */
export default function ScenesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/my-scripts');
  }, [router]);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary" />
    </div>
  );
}
