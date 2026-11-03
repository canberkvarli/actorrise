"use client";

/**
 * Building a psychological gesture: the verb (what you want, as one movement),
 * the direction, the quality (how), tempo, legato or staccato. The figure on
 * the stage does it as you choose. Then make it smaller and smaller until it
 * lives inside: "Take it inside" runs that by itself.
 */

import { useEffect } from "react";
import { trackEvent } from "@/lib/events";
import { read } from "@/lib/studio/effort";
import { heatCSS, heatOf } from "@/lib/studio/heat";
import {
  DIRECTIONS,
  QUALITIES,
  TEMPOS,
  VERBS,
  describe,
  effortOf,
  verbOf,
  type GestureSpec,
} from "@/lib/studio/gesture";
import type { Role } from "@/lib/studio/notebook";
import { display, EASE } from "./style";

const quiet = { fontSize: 12.5, color: "#cfcfcb", opacity: 0.62, lineHeight: 1.5 } as const;

const chip = (on: boolean) =>
  ({
    fontSize: 11.5,
    padding: "5px 11px",
    borderRadius: 999,
    border: `1px solid ${on ? "#f4f4f2" : "rgba(244,244,242,0.15)"}`,
    background: on ? "rgba(244,244,242,0.14)" : "transparent",
    color: on ? "#f4f4f2" : "#cfcfcb",
    cursor: "pointer",
    transition: `background 200ms ${EASE}, border-color 200ms ${EASE}`,
  }) as const;

const same = (a?: GestureSpec | null, b?: GestureSpec | null) =>
  !!a && !!b && a.verb === b.verb && a.direction === b.direction && a.quality === b.quality && a.tempo === b.tempo && a.staccato === b.staccato;

type Props = {
  wide: boolean;
  width: number;
  role: Role;
  spec: GestureSpec;
  onSpec: (s: GestureSpec) => void;
  size: number;
  onSize: (n: number) => void;
  sculpt: boolean;
  onSculpt: (v: boolean) => void;
  inward: boolean;
  onInward: () => void;
  onKeep: () => void;
  /** Open the camera: do it yourself and have it read. */
  onCamera: () => void;
  onClose: () => void;
};

export default function GesturePanel(p: Props) {
  const { wide, width, role, spec, onSpec, size, onSize, sculpt, onSculpt, inward, onInward, onKeep, onCamera, onClose } = p;
  const take = role.gestureTake;
  const yours = take ? read(take.point) : null;
  const v = verbOf(spec.verb);
  const reading = read(effortOf(spec));
  const kept = same(spec, role.gesture);
  const set = (patch: Partial<GestureSpec>) => onSpec({ ...spec, ...patch });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const frame = wide
    ? { top: 12, bottom: 12, left: 12, width, borderRadius: 20 }
    : { left: 0, right: 0, bottom: 0, height: "58dvh", borderRadius: "20px 20px 0 0" };

  return (
    <aside
      aria-label="Gesture"
      style={{
        position: "absolute",
        zIndex: 6,
        display: "flex",
        flexDirection: "column",
        background: "rgba(16, 16, 17, 0.88)",
        border: "1px solid rgba(244, 244, 242, 0.12)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        animation: `prep-in 480ms ${EASE}`,
        ...frame,
      }}
    >
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(244,244,242,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...display, fontSize: 24, lineHeight: 1.2, color: heatCSS(heatOf(effortOf(spec))), transition: "color 400ms" }}>
              {describe(spec)}
            </div>
            <div style={{ fontSize: 12, color: "#8f8f8b", marginTop: 4 }}>reads as {reading.main.name.toLowerCase()}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close gesture" style={{ ...chip(false), fontSize: 10, padding: "5px 9px", flex: "none" }}>
            Close
          </button>
        </div>
      </div>

      <div className="studio-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 18px 14px", display: "grid", gap: 16, alignContent: "start" }}>
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VERBS.map((x) => (
              <button key={x.id} type="button" title={x.feel} aria-pressed={spec.verb === x.id} onClick={() => set({ verb: x.id })} style={chip(spec.verb === x.id)}>
                {x.name}
              </button>
            ))}
          </div>
          <p style={{ ...quiet, marginTop: 8, color: "#f4f4f2", opacity: 0.8 }}>{v.feel}</p>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {QUALITIES.map((q) => (
            <button key={q.id} type="button" aria-pressed={spec.quality === q.id} onClick={() => set({ quality: q.id })} style={chip(spec.quality === q.id)}>
              {q.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              trackEvent("studio_gesture_inward", { verb: spec.verb, quality: spec.quality });
              onInward();
            }}
            disabled={inward}
            style={{ ...chip(inward || size < 0.05), padding: "8px 14px" }}
          >
            {inward ? "Going inside…" : "Take it inside"}
          </button>
          {(size < 0.95 || inward) && !inward && (
            <button type="button" onClick={() => onSize(1)} style={{ ...chip(false), padding: "8px 14px" }}>
              Full out
            </button>
          )}
          <button type="button" aria-pressed={sculpt} onClick={() => onSculpt(!sculpt)} style={{ ...chip(sculpt), padding: "8px 14px" }}>
            Shape
          </button>
          <button type="button" onClick={onCamera} style={{ ...chip(false), padding: "8px 14px" }}>
            Do it yourself
          </button>
        </div>
        {yours && (
          <p style={{ fontSize: 12.5, color: "#cfe0ff", lineHeight: 1.5 }}>
            Yours read as {yours.main.name.toLowerCase()}
            {yours.main.id !== reading.main.id ? `, the figure's as ${reading.main.name.toLowerCase()}. Which is the character?` : "."}
          </p>
        )}

        <details>
          <summary style={{ fontSize: 12, color: "#8f8f8b", cursor: "pointer", listStyle: "none" }}>More</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DIRECTIONS.map((d) => (
                <button key={d.id} type="button" aria-pressed={spec.direction === d.id} onClick={() => set({ direction: d.id })} style={chip(spec.direction === d.id)}>
                  {d.name}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TEMPOS.map((t) => (
                <button key={t.id} type="button" aria-pressed={spec.tempo === t.id} onClick={() => set({ tempo: t.id })} style={chip(spec.tempo === t.id)}>
                  {t.name}
                </button>
              ))}
              <button type="button" aria-pressed={!spec.staccato} onClick={() => set({ staccato: false })} style={chip(!spec.staccato)}>
                Legato
              </button>
              <button type="button" aria-pressed={spec.staccato} onClick={() => set({ staccato: true })} style={chip(spec.staccato)}>
                Staccato
              </button>
            </div>
          </div>
        </details>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 18px 16px", borderTop: "1px solid rgba(244,244,242,0.08)" }}>
        <span style={{ ...quiet, fontSize: 12 }}>{kept ? "Places plays it." : ""}</span>
        <button
          type="button"
          onClick={() => {
            trackEvent("studio_gesture_kept", { verb: spec.verb, quality: spec.quality, tempo: spec.tempo, staccato: spec.staccato });
            onKeep();
          }}
          disabled={kept}
          style={{
            fontSize: 12,
            padding: "9px 16px",
            borderRadius: 999,
            border: "1px solid #f4f4f2",
            background: kept ? "transparent" : "#f4f4f2",
            color: kept ? "#f4f4f2" : "#0b0b0c",
            cursor: kept ? "default" : "pointer",
            flex: "none",
          }}
        >
          {kept ? "Kept" : "Keep this gesture"}
        </button>
      </div>
    </aside>
  );
}
