"use client";

import { useAuth } from "@/lib/auth";
import Link from "next/link";
import {
  IconUser,
  IconCreditCard,
  IconShield,
} from "@tabler/icons-react";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto px-4 py-8 max-w-xl">
      <h1 className="text-2xl font-semibold mb-6">Account settings</h1>

      {user?.email && (
        <p className="text-sm text-muted-foreground mb-6">
          Signed in as {user.email}
        </p>
      )}

      <nav className="flex flex-col gap-1">
        <Link
          href="/profile"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/60 transition-colors text-foreground"
        >
          <IconUser className="h-4 w-4 text-muted-foreground" />
          <span>Edit profile</span>
        </Link>
        <Link
          href="/billing"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/60 transition-colors text-foreground"
        >
          <IconCreditCard className="h-4 w-4 text-muted-foreground" />
          <span>Billing</span>
        </Link>
        <Link
          href="/privacy"
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted/60 transition-colors text-foreground"
        >
          <IconShield className="h-4 w-4 text-muted-foreground" />
          <span>Privacy policy</span>
        </Link>
      </nav>
    </div>
  );
}
