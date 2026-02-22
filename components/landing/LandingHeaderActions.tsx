"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalContext";

export function LandingHeaderActions() {
  const { user, loading } = useAuth();
  const authModal = useAuthModal();

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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => authModal?.openAuthModal("login")}
      >
        Sign in
      </Button>
      <Button
        size="sm"
        className="rounded-full px-5"
        onClick={() => authModal?.openAuthModal("signup")}
      >
        Get started
      </Button>
    </div>
  );
}
