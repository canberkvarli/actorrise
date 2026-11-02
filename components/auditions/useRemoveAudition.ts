"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Audition } from "@/lib/auditions";
import { useDeleteAudition, useRestoreAudition } from "@/hooks/useAuditions";
import { useT } from "@/lib/i18n";

/**
 * Remove an audition without a confirm box: it goes at once, the toast offers
 * it straight back, and Recently deleted keeps it for 30 days after that.
 */
export function useRemoveAudition() {
  const del = useDeleteAudition();
  const restore = useRestoreAudition();
  const router = useRouter();
  const t = useT();

  function bringBack(id: number, name: string) {
    restore.mutate(id, {
      onSuccess: () => {
        toast.success(t("appAuditionsRemove.back", { name }));
        router.push(`/auditions/${id}`);
      },
      onError: () => toast.error(t("appAuditionsErr.saveFailed")),
    });
  }

  function remove(a: Audition) {
    del.mutate(a.id, {
      onSuccess: () => {
        router.push("/auditions");
        toast(t("appAuditionsRemove.took", { name: a.project }), {
          description: t("appAuditionsRemove.stays"),
          action: { label: t("appAuditionsRemove.undo"), onClick: () => bringBack(a.id, a.project) },
          duration: 8000,
        });
      },
      onError: () => toast.error(t("appAuditionsErr.saveFailed")),
    });
  }

  return { remove, bringBack, removing: del.isPending, restoring: restore.isPending };
}
