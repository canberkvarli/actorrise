"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { runAudio } from "@/lib/runAudio";

/**
 * "Hear it": the piece read aloud, one line at a time, before the actor says it.
 *
 * Lines come from POST /api/monologue-work/audio, the partner-line cache under
 * a narrator voice. A cold line is still being made when it is asked for, so
 * each one is polled; while line N plays, N+1 is already being waited on. A
 * line that is not there in time, or failed, is read by the browser's own voice
 * instead, so the read never stalls on the network.
 */

const POLL_MS = 700;
/** How long one line may keep the actor waiting before the browser reads it. */
const LINE_WAIT_MS = 7000;

type Source = { key: string; url: string | null; failed?: boolean };

export type HearState = "idle" | "loading" | "playing" | "blocked" | "done";

async function waitForUrl(src: Source, cancelled: () => boolean): Promise<string | null> {
  if (src.url) return src.url;
  if (src.failed) return null;
  const deadline = Date.now() + LINE_WAIT_MS;
  while (Date.now() < deadline && !cancelled()) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const res = await api.get<{ key: string; url: string | null }>(`/api/rehearsal/audio/${src.key}`);
      if (res.status === 200 && res.data?.url) return res.data.url;
    } catch {
      return null; // 502 = could not be synthesised
    }
  }
  return null;
}

function playUrl(url: string, cancelled: () => boolean): Promise<void> {
  const el = runAudio();
  return new Promise((resolve, reject) => {
    const done = () => {
      el.onended = null;
      el.onerror = null;
      resolve();
    };
    el.onended = done;
    el.onerror = () => done(); // a broken clip should not stop the read
    el.src = url;
    el.play().catch((err: unknown) => {
      el.onended = null;
      el.onerror = null;
      if (cancelled()) return resolve();
      reject(err);
    });
  });
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    // Some engines never fire onend; never wait longer than a slow read.
    const guard = setTimeout(resolve, 1500 + text.split(/\s+/).length * 450);
    u.onend = () => {
      clearTimeout(guard);
      resolve();
    };
    u.onerror = () => {
      clearTimeout(guard);
      resolve();
    };
    window.speechSynthesis.speak(u);
  });
}

export function useHearIt(monologueId: number, lines: string[]) {
  const [state, setState] = useState<HearState>("idle");
  const [index, setIndex] = useState(0);
  const runRef = useRef(0);
  const resumeRef = useRef<{ from: number; to: number; onDone: (fallbackLines: number) => void } | null>(null);

  const stop = useCallback(() => {
    runRef.current += 1;
    try {
      runAudio().pause();
    } catch {
      /* nothing playing */
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => stop, [stop]);

  /** Read lines[from, to). Calls onDone once the last one has been heard. */
  const hear = useCallback(
    async (from: number, to: number, onDone: (fallbackLines: number) => void) => {
      stop();
      const run = ++runRef.current;
      const cancelled = () => runRef.current !== run;
      resumeRef.current = { from, to, onDone };
      setIndex(from);
      setState("loading");

      let sources: Source[] = [];
      try {
        const res = await api.post<{ lines: Source[] }>("/api/monologue-work/audio", {
          monologue_id: monologueId,
          lines: lines.slice(from, to),
        });
        sources = res.data.lines;
      } catch {
        sources = []; // whole read falls back to the browser voice
      }
      if (cancelled()) return;

      // Start waiting on every line now; awaiting them in order means N+1 is
      // usually ready by the time N ends.
      const urls = lines.slice(from, to).map((_, i) =>
        sources[i] ? waitForUrl(sources[i], cancelled) : Promise.resolve(null),
      );

      let fallback = 0;
      for (let i = from; i < to; i++) {
        if (cancelled()) return;
        setIndex(i);
        const url = await urls[i - from];
        if (cancelled()) return;
        setState("playing");
        if (url) {
          try {
            await playUrl(url, cancelled);
          } catch {
            // The browser refused to play without a gesture. Hold here; the
            // room shows a play button whose tap calls resume().
            resumeRef.current = { from: i, to, onDone };
            setState("blocked");
            return;
          }
        } else {
          fallback += 1;
          await speak(lines[i]);
        }
      }
      if (cancelled()) return;
      setState("done");
      onDone(fallback);
    },
    [lines, monologueId, stop],
  );

  /** From a tap: carry on from the line the browser refused to play. */
  const resume = useCallback(() => {
    const r = resumeRef.current;
    if (!r) return;
    try {
      // Unlock inside this gesture before the async work starts.
      void runAudio().play().catch(() => {});
    } catch {
      /* hear() reports it again if it still cannot play */
    }
    void hear(r.from, r.to, r.onDone);
  }, [hear]);

  const reset = useCallback(() => {
    stop();
    setState("idle");
  }, [stop]);

  return { state, index, hear, resume, stop, reset };
}
