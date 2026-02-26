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
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <Button asChild size="sm" className="rounded-full px-3 sm:px-5 text-xs sm:text-sm whitespace-nowrap">
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
        className="hidden sm:inline-flex"
      >
        Sign in
      </Button>
      <Button
        size="sm"
        className="rounded-full px-3 sm:px-5 text-xs sm:text-sm whitespace-nowrap"
        onClick={() => authModal?.openAuthModal("signup")}
      >
        <span className="hidden sm:inline">Try Free Search</span>
        <span className="sm:hidden">Try Free</span>
      </Button>
    </div>
  );
}
