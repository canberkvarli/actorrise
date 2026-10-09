"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Audition } from "@/lib/auditions";
import { useDeleteAudition, useRestoreAudition } from "@/hooks/useAuditions";
import { SAVE_FAILED } from "./SidesSection";

/**
 * Remove an audition without a confirm box: it goes at once, the toast offers
 * it straight back, and Recently deleted keeps it for 30 days after that.
 */
export function useRemoveAudition() {
  const del = useDeleteAudition();
  const restore = useRestoreAudition();
  const router = useRouter();

  function bringBack(id: number, name: string) {
    restore.mutate(id, {
      onSuccess: () => {
        toast.success(`${name} is back.`);
        router.push(`/auditions/${id}`);
      },
      onError: () => toast.error(SAVE_FAILED),
    });
  }

  function remove(a: Audition) {
    del.mutate(a.id, {
      onSuccess: () => {
        router.push("/auditions");
        toast(`Took ${a.project} off your list.`, {
          description: "It stays in Recently deleted for 30 days.",
          action: { label: "Undo", onClick: () => bringBack(a.id, a.project) },
          duration: 8000,
        });
      },
      onError: () => toast.error(SAVE_FAILED),
    });
  }

  return { remove, bringBack, removing: del.isPending, restoring: restore.isPending };
}
