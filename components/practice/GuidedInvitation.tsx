"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { trackEvent } from "@/lib/events";
import {
  GUIDED_ACTOR,
  GUIDED_LINE_COUNT,
  GUIDED_OPENING_LINE,
  GUIDED_PARTNER,
  guidedRoute,
  titleCase,
} from "@/lib/guided-scene";
import { fetchGuidedSceneId, startGuidedScene } from "@/lib/guided-start";
import { useUpload } from "@/components/practice/UploadProvider";

/**
 * The hub, for an actor who has never rehearsed.
 *
 * Not a description of ScenePartner: the partner's first line, already said
 * to you, and one control that answers it. The shelf, the walkthrough and the
 * tour are all absent on this state; see lib/guided-invite.ts for who gets it.
 */
export function GuidedInvitation() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { isUploading, openPicker } = useUpload();
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
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

  // Warmed while they read the line: the rehearse page's own chunk, and the
  // scene payload it fetches first. Asking for the payload here is what queues
  // the partner's audio on the server, so by the time they tap Answer the
  // lines Riley speaks are synthesised or on their way. The page fetches the
  // payload again itself; the second ask finds the audio already there.
  const [sceneId, setSceneId] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await fetchGuidedSceneId();
        if (cancelled) return;
        setSceneId(id);
        router.prefetch(guidedRoute(id));
        await api.get(`/api/rehearsal/scenes/${id}`);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const answer = async () => {
    if (starting) return;
    setStarting(true);
    setFailed(false);
    // The tap itself lives in lib/guided-start (the onboarding card ends on
    // the same scene): mic asked for inside the gesture, the scene found, the
    // start logged. If the scene id has not arrived yet it asks once more
    // rather than send them to a page that cannot open.
    try {
      router.push(await startGuidedScene("hub", sceneId));
    } catch {
      setFailed(true);
      setStarting(false);
      return;
    }
    // Answering IS seeing the first rehearsal. POST /api/rehearsal/runs/guided
    // sets has_seen_first_rehearsal on the server (lib/guided-invite reads it);
    // the user is pulled afterwards so the hub does not invite again if they
    // come straight back. After the cut, not before: refreshing first
    // re-rendered this page as the shelf for the beat the route change took,
    // which read as two pages flashing past.
    setTimeout(() => void refreshUser(), 4000);
  };

  return (
    <section className="t-invite" aria-labelledby="guided-opening-line" data-starting={starting}>
      <p className="t-invite__cue">{GUIDED_PARTNER}</p>
      <h1 id="guided-opening-line" className="t-invite__line">
        {GUIDED_OPENING_LINE}
      </h1>
      <p className="t-invite__house">
        {starting
          ? `${titleCase(GUIDED_PARTNER)} is waiting.`
          : `I'll read ${titleCase(GUIDED_PARTNER)}. You're ${titleCase(GUIDED_ACTOR)}. ${GUIDED_LINE_COUNT} lines, under a minute.`}
      </p>
      <button type="button" className="t-invite__answer" onClick={answer} disabled={starting}>
        {starting ? "One moment" : "Answer"}
      </button>
      {failed && (
        <p className="t-invite__house" role="alert">
          That didn&apos;t start. Try once more.
        </p>
      )}
      <div className="t-invite__alt">
        <button type="button" className="t-how-link" onClick={openPicker} disabled={isUploading}>
          {isUploading ? "bringing it in" : "bring in a script instead"}
        </button>
      </div>
    </section>
  );
}

