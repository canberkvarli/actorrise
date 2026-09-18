"use client";

import { ContentRequestsTab } from "@/components/admin/searches/ContentRequestsTab";
import { useMarkSeen } from "@/hooks/useMarkSeen";

/**
 * Titles actors asked for and could not find.
 *
 * This was a tab inside Search, which meant it had no nav entry, no badge and
 * no URL. Fifteen requests accumulated there unseen, the oldest five months
 * old. It is a work queue like Review, not a view of search behaviour, so it
 * lives in Library and carries its own counter.
 */
export default function AdminRequestsPage() {
  useMarkSeen("requests");

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold sm:text-xl">Requests</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Titles actors asked for and could not find.
        </p>
      </header>
      <ContentRequestsTab />
    </div>
  );
}
