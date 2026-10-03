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
import { writeHandoff } from "@/lib/guided-handoff";
import { primeAudio } from "@/lib/primed-audio";
import {
  DEFAULT_VOICE,
  sceneVoiceContext,
  ttsInstructions,
  ttsText,
  type VoiceLine,
} from "@/lib/scene-voice";
import { useOpenAITTS } from "@/hooks/useOpenAITTS";
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
  const { preload: preloadTTS } = useOpenAITTS();

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

  // Everything the rehearse page will need, fetched while they read the line:
  // its own chunk, and the scene with its lines, put where that page already
  // looks first (sessionStorage, see loadSession there). Answer then cuts to a
  // stage that is already drawn; only the partner's audio is still to come.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ scene_id: number }>("/api/scenes/rehearse/guided");
        if (cancelled) return;
        router.prefetch(`/scenes/${data.scene_id}/rehearse`);
        const scene = await api.get<unknown>(`/api/scenes/${data.scene_id}`);
        if (cancelled) return;
        try {
          sessionStorage.setItem(`actorrise_scene_${data.scene_id}`, JSON.stringify(scene.data));
        } catch {}

        /* ...and the partner's VOICE, which the comment above used to end by
           admitting was still to come. It was 3 to 4 seconds of silence after
           Answer on a phone: the page had to mount, create the session, fetch
           the scene and only then ask for audio.

           Nothing needs to wait. The scene is fixed, Riley is whoever is not
           ALEX, and the guided session never sets ai_voice_id, so her voice is
           always DEFAULT_VOICE. Every input to the cache key is known here, and
           the actor spends seconds reading "I'll read Riley. You're Alex."
           before they tap. The cache is module-level in useOpenAITTS, so it
           survives the route change and the rehearse page finds it warm.

           All three of text, voice and instructions come from lib/scene-voice,
           the same module the player uses. If they are computed even slightly
           differently this is not a warm cache, it is a wasted request. */
        const s = scene.data as {
          lines?: Array<VoiceLine & { character_name: string; line_order?: number }>;
        } & Parameters<typeof sceneVoiceContext>[0];
        const lines = [...(s?.lines ?? [])].sort(
          (a, b) => (a.line_order ?? 0) - (b.line_order ?? 0),
        );
        const partnerLine = lines.find((l) => l.character_name !== GUIDED_ACTOR);
        if (!partnerLine || cancelled) return;
        const context = sceneVoiceContext(s, partnerLine.character_name);
        void preloadTTS(
          ttsText(partnerLine),
          DEFAULT_VOICE,
          ttsInstructions(partnerLine, context),
        ).catch(() => {});
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [router, preloadTTS]);

  const answer = async () => {
    if (starting) return;
    // First, and before anything is awaited: the audio element the partner
    // will speak through, started by THIS tap. An iPhone plays nothing from
    // code on an element no gesture has touched (lib/primed-audio).
    primeAudio();
    setStarting(true);
    setFailed(false);
    // Ask for the mic here, inside the tap, with the line still on screen. On
    // phones the rehearse page otherwise puts a second screen and a second
    // button between Answer and the scene, and the first day's runs on iOS and
    // Android both ended there inside five seconds. Granted once, the page
    // finds the mic ready and goes straight on stage; denied, it runs in tap
    // mode. The tracks are released at once; only the permission is kept.
    //
    // The answer is written down for the rehearse page, because on an iPhone
    // it cannot find out for itself: neither Safari nor Chrome there will say
    // whether the mic is granted, so the page read "unknown" and put its Begin
    // screen up anyway (lib/guided-handoff).
    let mic: "granted" | "denied" = "denied";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      mic = "granted";
    } catch {}
    try {
      writeHandoff(sessionStorage, mic, Date.now());
    } catch {}
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
