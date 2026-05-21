"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  IconUser,
  IconCreditCard,
  IconShield,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { DeleteAccountModal } from "@/components/settings/DeleteAccountModal";

export default function SettingsPage() {
  const { user } = useAuth();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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

      {/* Danger Zone - Account Deletion */}
      <div className="mt-12 pt-8 border-t border-border">
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                  <IconAlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-medium text-foreground">Delete Account</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-3"
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DeleteAccountModal open={deleteModalOpen} onOpenChange={setDeleteModalOpen} />
    </div>
  );
}
