"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function LandingHeaderActions() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled className="rounded-full px-5">
          …
        </Button>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <Button asChild size="sm" className="rounded-full px-5">
          <Link href="/search">Search</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" className="rounded-full px-5">
        <Link href="/signup">Get started</Link>
      </Button>
    </div>
  );
}
