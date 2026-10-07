"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Moderators only while Canberk tries the tracker. Everyone else is sent to
 * the Collection before any page under /auditions mounts, so no audition API
 * call is ever made for them. The backend refuses them too (403).
 */
export default function AuditionsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = !!user?.is_moderator;

  useEffect(() => {
    if (loading) return;
    if (!allowed) router.replace("/rehearse");
  }, [allowed, loading, router]);

  if (loading || !allowed) return null;
  return <>{children}</>;
}
