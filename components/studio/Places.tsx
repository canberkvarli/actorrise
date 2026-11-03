"use client";

/**
 * Places: the minute before you go on. It plays the role's own notebook over
 * the stage (a breath, your answers, the arc with its lines, your first line),
 * moving the performer through each moment, then says Go.
 *
 * Tap, space or → for the next cue, ← for the last one, esc to leave.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { read, type EffortPoint } from "@/lib/studio/effort";
import type { Role } from "@/lib/studio/notebook";
import { trackEvent } from "@/lib/events";
import { buildCues } from "@/lib/studio/places";
import { describe, type GestureSpec } from "@/lib/studio/gesture";
import { display, EASE, mono } from "./style";

type Props = {
  role: Role;
  lines: string[];
  reducedMotion: boolean;
  onPoint: (p: EffortPoint) => void;
  onLine: (i: number | null) => void;
  /** Which moment is playing (its air follows), or null between moments. */
  onMoment: (i: number | null) => void;
  /** The gesture cue: the figure takes the stage and goes inside over `ms`. */
  onGesture: (spec: GestureSpec | null, ms: number) => void;
  /** `worked`: they got at least halfway, so it counts as having run the piece. */
  onClose: (worked: boolean) => void;
};

export default function Places({ role, lines, reducedMotion, onPoint, onLine, onMoment, onGesture, onClose }: Props) {
  // Built once: the cues shouldn't shift under the actor while it plays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cues = useMemo(() => buildCues(role, lines, reducedMotion), []);
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const cue = cues[Math.min(i, cues.length - 1)];
  // The page re-renders many times a second; keep its callbacks out of the timers' deps.
  const cb = useRef({ onPoint, onLine, onMoment, onGesture, onClose });
  useEffect(() => {
    cb.current = { onPoint, onLine, onMoment, onGesture, onClose };
  });

  const close = useCallback(() => {
    trackEvent("studio_places_finished", { cues: cues.length, reached: i + 1, completed: i >= cues.length - 1 });
    setLeaving(true);
    const worked = i >= Math.floor(cues.length / 2);
    window.setTimeout(() => cb.current.onClose(worked), reducedMotion ? 0 : 450);
  }, [reducedMotion, cues.length, i]);

  const next = useCallback(() => {
    if (i >= cues.length - 1) close();
    else setI(i + 1);
  }, [i, cues.length, close]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Each cue moves on by itself after its time.
  useEffect(() => {
    const t = window.setTimeout(next, cue.ms);
    return () => window.clearTimeout(t);
  }, [cue, next]);

  // A moment puts the performer there and lights its line.
  useEffect(() => {
    cb.current.onMoment(cue.kind === "moment" ? cue.index : null);
    cb.current.onGesture(cue.kind === "gesture" ? cue.spec : null, cue.ms);
    if (cue.kind === "moment") {
      cb.current.onPoint(cue.point);
      const m = role.moments[cue.index];
      cb.current.onLine(typeof m?.line === "number" ? m.line : null);
    } else if (cue.kind === "first") cb.current.onLine(0);
  }, [cue, role.moments]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Capture, so the stage's own shortcuts stay quiet while Places runs.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, next, back]);

  const total = cues.length;

  return (
    <div
      role="dialog"
      aria-label="Places"
      onClick={next}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        cursor: "pointer",
        userSelect: "none",
        background:
          "linear-gradient(to top, rgba(19,11,8,0.94) 0%, rgba(19,11,8,0.6) 42%, rgba(19,11,8,0.12) 70%, rgba(19,11,8,0.3) 100%)",
        opacity: leaving ? 0 : 1,
        animation: reducedMotion ? undefined : `places-in 700ms ${EASE}`,
        transition: `opacity 450ms ${EASE}`,
      }}
    >
      {/* One segment a cue; the current one fills over its time. */}
      <div
        aria-hidden
        style={{ position: "absolute", top: 14, left: 16, right: 16, display: "flex", gap: 4 }}
      >
        {cues.map((c, n) => (
          <div key={n} style={{ flex: 1, height: 2, background: "rgba(243,217,191,0.15)", overflow: "hidden" }}>
            <div
              key={n === i ? `on-${i}` : "off"}
              style={{
                height: "100%",
                background: "#E9C3BC",
                width: n < i ? "100%" : n > i ? "0%" : undefined,
                animation: n === i ? `places-fill ${c.ms}ms linear forwards` : undefined,
              }}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className="uppercase tracking-[0.2em] text-[#e9d6c4]"
        style={{
          position: "absolute",
          top: 28,
          right: 16,
          fontSize: 10.5,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(19,11,8,0.5)",
          border: "1px solid rgba(243,217,191,0.16)",
          cursor: "pointer",
          opacity: 0.75,
        }}
      >
        Leave · esc
      </button>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "max(48px, calc(env(safe-area-inset-bottom) + 32px))",
          translate: "-50% 0",
          width: "min(calc(100vw - 40px), 620px)",
          textAlign: "center",
        }}
      >
        <div key={i} style={{ animation: reducedMotion ? undefined : `studio-in 600ms ${EASE}` }}>
          {cue.kind === "breath" && (
            <>
              <div
                aria-hidden
                style={{
                  width: 88,
                  height: 88,
                  margin: "0 auto 22px",
                  borderRadius: 44,
                  border: "1px solid rgba(233,195,188,0.55)",
                  boxShadow: "0 0 40px rgba(155,28,34,0.35) inset, 0 0 30px rgba(155,28,34,0.25)",
                  animation: reducedMotion ? undefined : "places-breath 7s ease-in-out forwards",
                }}
              />
              <div style={{ ...display, fontSize: 44, lineHeight: 1 }}>Places.</div>
              <p style={{ marginTop: 12, fontSize: 14, color: "#e9d6c4", opacity: 0.75 }}>
                {role.name ? `${role.name}. ` : ""}Breathe in with the light, and out.
              </p>
            </>
          )}

          {cue.kind === "answer" && (
            <>
              <div className="uppercase tracking-[0.26em] text-[#C9444A]" style={{ fontSize: 10.5 }}>
                {cue.ask}
              </div>
              <p style={{ ...display, fontSize: 28, lineHeight: 1.3, marginTop: 12 }}>{cue.text}</p>
            </>
          )}

          {cue.kind === "moment" && (
            <>
              <div className="uppercase tracking-[0.24em] text-[#e9d6c4]" style={{ fontSize: 10.5, opacity: 0.7 }}>
                <span style={{ ...mono, letterSpacing: 0 }}>{cue.index + 1}</span>
                {"  ·  "}
                {read(cue.point).main.name}
              </div>
              {cue.label && <div style={{ ...display, fontSize: 30, lineHeight: 1.2, marginTop: 10 }}>{cue.label}</div>}
              {cue.line && (
                <p className="font-typewriter" style={{ fontSize: 17, lineHeight: 1.6, marginTop: 12, color: "#F5ECE2" }}>
                  {cue.line}
                </p>
              )}
              {cue.note && (
                <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 10, color: "#e9d6c4", opacity: 0.75 }}>
                  {cue.note}
                </p>
              )}
              {!cue.label && !cue.line && !cue.note && (
                <div style={{ ...display, fontSize: 30, marginTop: 10 }}>{read(cue.point).sentence}</div>
              )}
            </>
          )}

          {cue.kind === "gesture" && (
            <>
              <div className="uppercase tracking-[0.26em] text-[#C9444A]" style={{ fontSize: 10.5 }}>
                Your gesture
              </div>
              <p style={{ ...display, fontSize: 30, lineHeight: 1.25, marginTop: 12 }}>{describe(cue.spec)}</p>
              <p style={{ fontSize: 14, marginTop: 10, color: "#e9d6c4", opacity: 0.75 }}>
                Do it with the figure, full out. Then smaller. Then only inside.
              </p>
            </>
          )}

          {cue.kind === "first" && (
            <>
              <div className="uppercase tracking-[0.26em] text-[#C9444A]" style={{ fontSize: 10.5 }}>
                Your first line
              </div>
              <p className="font-typewriter" style={{ fontSize: 21, lineHeight: 1.55, marginTop: 14, color: "#F5ECE2" }}>
                {cue.line}
              </p>
            </>
          )}

          {cue.kind === "go" && <div style={{ ...display, fontSize: 64, lineHeight: 1 }}>Go.</div>}
        </div>

        <div style={{ ...mono, fontSize: 10, marginTop: 26, opacity: 0.35, color: "#e9d6c4" }}>
          {i + 1} / {total} · tap for next
        </div>
      </div>

      <style>{`
        @keyframes places-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes places-fill { from { width: 0%; } to { width: 100%; } }
        @keyframes places-breath { 0% { transform: scale(0.7); } 55% { transform: scale(1.25); } 100% { transform: scale(0.8); } }
      `}</style>
    </div>
  );
}
