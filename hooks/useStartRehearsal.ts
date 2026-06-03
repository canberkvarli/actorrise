"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import api from "@/lib/api";
import { parseUpgradeError } from "@/lib/upgradeError";

interface UpgradeModalState {
  open: boolean;
  feature: string;
  message: string;
}

/**
 * Start a rehearsal session for a scene and navigate into it.
 *
 * Mirrors the flow on the script detail page: POST to create the session,
 * cache it in sessionStorage so the rehearsal page skips a round-trip, then
 * route to `/scenes/:id/rehearse`. On a plan limit it surfaces an upgrade
 * modal (render `upgradeModal` via <UpgradeModal/> in the consumer).
 */
export function useStartRehearsal() {
  const router = useRouter();
  const [startingSceneId, setStartingSceneId] = useState<number | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    open: false,
    feature: "ScenePartner",
    message: "",
  });

  const startRehearsal = useCallback(
    async (sceneId: number, userCharacter: string) => {
      setStartingSceneId(sceneId);
      try {
        const { data } = await api.post<{ id: number } & Record<string, unknown>>(
          "/api/scenes/rehearse/start",
          { scene_id: sceneId, user_character: userCharacter },
        );
        try {
          sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data));
        } catch {
          /* sessionStorage quota — the rehearsal page will just refetch */
        }
        router.push(`/scenes/${sceneId}/rehearse?session=${data.id}`);
        // Intentionally leave startingSceneId set — we're navigating away and
        // want the row to stay in its loading state until the route changes.
      } catch (err: unknown) {
        const upgrade = parseUpgradeError(err);
        if (upgrade) {
          setUpgradeModal({ open: true, feature: "ScenePartner", message: upgrade.message });
        } else {
          const message =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
              : "Failed to start rehearsal";
          toast.error(typeof message === "string" ? message : "Failed to start rehearsal");
        }
        setStartingSceneId(null);
      }
    },
    [router],
  );

  return { startRehearsal, startingSceneId, upgradeModal, setUpgradeModal };
}
