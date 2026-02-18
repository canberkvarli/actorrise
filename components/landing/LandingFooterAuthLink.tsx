"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function LandingFooterAuthLink() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    return (
      <Link href="/dashboard" className="hover:text-foreground transition-colors">
        Dashboard
      </Link>
    );
  }

  return (
    <Link href="/login" className="hover:text-foreground transition-colors">
      Sign in
    </Link>
  );
}
