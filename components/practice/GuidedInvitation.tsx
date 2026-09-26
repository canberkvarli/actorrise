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

type StartedSession = { id: number; scene_id: number };

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
    trackEvent("guided_scene_shown");
  }, []);

  // The rehearse page is a large chunk. Fetch it while they read the line, so
  // Answer is a cut, not a spinner.
  useEffect(() => {
    router.prefetch("/scenes/0/rehearse");
  }, [router]);

  const answer = async () => {
    if (starting) return;
    setStarting(true);
    setFailed(false);
    try {
      const { data } = await api.post<StartedSession>("/api/scenes/rehearse/start-guided", {});
      try {
        sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data));
      } catch {}
      const ua = navigator.userAgent;
      trackEvent("guided_scene_started", {
        platform: /iPhone|iPad/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "desktop",
      });
      router.push(`/scenes/${data.scene_id}/rehearse?session=${data.id}&guided=1`);
      // The endpoint flipped has_seen_first_rehearsal; pull it so the hub does
      // not invite again if they come straight back. After the cut, not before:
      // refreshing first re-rendered this page as the shelf for the beat the
      // route change took, which read as two pages flashing past.
      setTimeout(() => void refreshUser(), 4000);
    } catch {
      setFailed(true);
      setStarting(false);
    }
  };

  return (
    <section className="t-invite" aria-labelledby="guided-opening-line">
      <p className="t-invite__cue">{GUIDED_PARTNER}</p>
      <h1 id="guided-opening-line" className="t-invite__line">
        {GUIDED_OPENING_LINE}
      </h1>
      <p className="t-invite__house">
        I&apos;ll read {titleCase(GUIDED_PARTNER)}. You&apos;re {titleCase(GUIDED_ACTOR)}. {GUIDED_LINE_COUNT} lines,
        under a minute.
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
