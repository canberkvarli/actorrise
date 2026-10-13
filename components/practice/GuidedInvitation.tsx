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
} from "@/lib/guided-scene";
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
  const { isUploading, canUpload, start: startUpload, openUpgrade } = useUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [starting, setStarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownRef = useRef(false);

  // The same picker UploadScriptButton owns, without its pill: on this page
  // bringing in a script is the footnote, not the way in.
  const bringIn = () => {
    if (isUploading) return;
    if (!canUpload) {
      openUpgrade();
      return;
    }
    fileInputRef.current?.click();
  };
  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await startUpload(file);
  };

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
        const { data } = await api.get<{ scene_id: number; character: string }>(
          "/api/rehearsal/guided",
        );
        if (cancelled) return;
        setSceneId(data.scene_id);
        router.prefetch(`/scenes/${data.scene_id}/rehearse`);
        await api.get(`/api/rehearsal/scenes/${data.scene_id}`);
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
    // Ask for the mic here, inside the tap, with the line still on screen. On
    // phones the first day's runs on iOS and Android both ended at the mic
    // prompt inside five seconds; asked once here, the rehearse page's Curtain
    // finds it granted and does not ask again. The tracks are released at
    // once; only the permission is kept.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {}
    // The page opens the guided run itself when it sees ?guided=1; this
    // component only navigates. If the scene id has not arrived yet, ask once
    // more rather than send them to a page that cannot open.
    let id = sceneId;
    if (id === null) {
      try {
        const { data } = await api.get<{ scene_id: number; character: string }>(
          "/api/rehearsal/guided",
        );
        id = data.scene_id;
      } catch {
        setFailed(true);
        setStarting(false);
        return;
      }
    }
    const ua = navigator.userAgent;
    trackEvent("guided_scene_started", {
      platform: /iPhone|iPad/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "desktop",
    });
    router.push(`/scenes/${id}/rehearse?guided=1`);
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={onFile}
          aria-hidden
          tabIndex={-1}
        />
        <button type="button" className="t-how-link" onClick={bringIn} disabled={isUploading}>
          {isUploading ? "bringing it in" : "bring in a script instead"}
        </button>
      </div>
    </section>
  );
}

function titleCase(name: string): string {
  return name.charAt(0) + name.slice(1).toLowerCase();
}
