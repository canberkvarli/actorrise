"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export function LandingFooterAuthLink() {
  const { user, loading } = useAuth();
  const t = useT();

  if (loading) return null;

  if (user) {
    return (
      <Link href="/practice" className="hover:text-foreground transition-colors">
        {t("nav.practice")}
      </Link>
    );
  }

  return (
    <Link href="/login" className="hover:text-foreground transition-colors">
      {t("nav.signIn")}
    </Link>
  );
}
