"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Audition } from "@/lib/auditions";
import { useAddCallback } from "@/hooks/useAuditions";
import { SAVE_FAILED } from "./SidesSection";

/** Add the callback, then open it on its details so the new date is the first thing asked. */
export function useCallbackAction(a: Audition) {
  const add = useAddCallback();
  const router = useRouter();
  return {
    busy: add.isPending,
    go: () => add.mutate(a.id, {
      onSuccess: (cb) => router.push(`/auditions/${cb.id}?edit=1`),
      onError: () => toast.error(SAVE_FAILED),
    }),
  };
}
