"use client";

import { useEffect, useRef } from "react";

import { useAuth } from "@/lib/auth";
import { trackEvent } from "@/lib/events";
import { GuidedChoices } from "@/components/practice/GuidedChoices";
import { useUpload } from "@/components/practice/UploadProvider";
import { useT } from "@/lib/i18n";

/**
 * The hub, for an actor who has never rehearsed.
 *
 * Not a description of ScenePartner: three short scenes, and one tap starts
 * one as the part that speaks first. The shelf, the walkthrough and the tour are all
 * absent on this state; see lib/guided-invite.ts for who gets it.
 *
 * Until 2026-11-03 this was "Late" alone (Riley's "You're late." and Answer).
 */
export function GuidedInvitation() {
  const { refreshUser } = useAuth();
  const t = useT();
  const { isUploading, openPicker } = useUpload();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    // Once per browser session, not per mount: the hub remounts on every
    // return and was counting one person as three.
    try {
      if (sessionStorage.getItem("actorrise_guided_shown") === "1") return;
      sessionStorage.setItem("actorrise_guided_shown", "1");
    } catch {}
    trackEvent("guided_scene_shown");
  }, []);

  // Starting IS seeing the first rehearsal. POST /api/rehearsal/runs/guided
  // sets has_seen_first_rehearsal on the server (lib/guided-invite reads it);
  // the user is pulled after the cut so the hub does not invite again if they
  // come straight back, and never before it (the shelf flashed past).
  const leaving = () => {
    setTimeout(() => void refreshUser(), 4000);
  };

  return (
    <section className="t-invite" aria-labelledby="guided-pick-title">
      <h1 id="guided-pick-title" className="t-invite__line">
        {t("appPracticeGuided.pickTitle")}
      </h1>
      <p className="t-invite__house">{t("appPracticeGuided.pickHouse")}</p>
      <div className="mt-6 w-full">
        <GuidedChoices from="hub" onLeaving={leaving} />
      </div>
      <div className="t-invite__alt">
        <button type="button" className="t-how-link" onClick={openPicker} disabled={isUploading}>
          {isUploading ? t("appPracticeGuided.bringingIn") : t("appPracticeGuided.bringInstead")}
        </button>
      </div>
    </section>
  );
}
