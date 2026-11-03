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

const quiet = { fontSize: 12.5, color: "#e9d6c4", opacity: 0.62, lineHeight: 1.5 } as const;
const label = { fontSize: 10, opacity: 0.55, color: "#e9d6c4", marginBottom: 6 } as const;

const chip = (on: boolean) =>
  ({
    fontSize: 11.5,
    padding: "5px 11px",
    borderRadius: 999,
    border: `1px solid ${on ? "#9B1C22" : "rgba(243,217,191,0.15)"}`,
    background: on ? "rgba(155,28,34,0.24)" : "transparent",
    color: on ? "#F3DDD6" : "#e9d6c4",
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
        background: "rgba(22, 13, 10, 0.88)",
        border: "1px solid rgba(243, 217, 191, 0.12)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        animation: `prep-in 480ms ${EASE}`,
        ...frame,
      }}
    >
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid rgba(243,217,191,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="uppercase tracking-[0.28em] text-[#C9444A]" style={{ fontSize: 10.5 }}>
            Gesture{role.name ? ` · ${role.name}` : ""}
          </div>
          <button type="button" onClick={onClose} aria-label="Close gesture" style={{ ...chip(false), fontSize: 10, padding: "5px 9px" }}>
            Close
          </button>
        </div>
        <div style={{ ...display, fontSize: 24, lineHeight: 1.2, marginTop: 10 }}>{describe(spec)}</div>
        <div style={{ fontSize: 12.5, color: "#E9C3BC", marginTop: 4 }}>
          Reads as {reading.main.name.toLowerCase()} · {reading.factors.toLowerCase()}
        </div>
      </div>

      <div className="studio-scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 18px 14px", display: "grid", gap: 16, alignContent: "start" }}>

        <div>
          <div className="uppercase tracking-[0.2em]" style={label}>
            The verb
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VERBS.map((x) => (
              <button key={x.id} type="button" title={x.feel} aria-pressed={spec.verb === x.id} onClick={() => set({ verb: x.id })} style={chip(spec.verb === x.id)}>
                {x.name}
              </button>
            ))}
          </div>
          <p style={{ ...quiet, marginTop: 8, color: "#E9C3BC", opacity: 0.85 }}>{v.feel}</p>
        </div>

        <div>
          <div className="uppercase tracking-[0.2em]" style={label}>
            How
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {QUALITIES.map((q) => (
              <button key={q.id} type="button" aria-pressed={spec.quality === q.id} onClick={() => set({ quality: q.id })} style={chip(spec.quality === q.id)}>
                {q.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="uppercase tracking-[0.2em]" style={label}>
            Direction
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DIRECTIONS.map((d) => (
              <button key={d.id} type="button" aria-pressed={spec.direction === d.id} onClick={() => set({ direction: d.id })} style={chip(spec.direction === d.id)}>
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="uppercase tracking-[0.2em]" style={label}>
              Tempo
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {TEMPOS.map((t) => (
                <button key={t.id} type="button" aria-pressed={spec.tempo === t.id} onClick={() => set({ tempo: t.id })} style={chip(spec.tempo === t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-[0.2em]" style={label}>
              Line
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" aria-pressed={!spec.staccato} onClick={() => set({ staccato: false })} style={chip(!spec.staccato)}>
                Legato
              </button>
              <button type="button" aria-pressed={spec.staccato} onClick={() => set({ staccato: true })} style={chip(spec.staccato)}>
                Staccato
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="uppercase tracking-[0.2em]" style={label}>
            Size
          </div>
          <label style={{ display: "grid", gridTemplateColumns: "48px 1fr 48px", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, opacity: 0.7, color: "#e9d6c4" }}>Inside</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={size}
              disabled={inward}
              onChange={(e) => onSize(Number(e.target.value))}
              aria-label="Size of the gesture, from inside to full out"
              style={{ width: "100%", accentColor: "#9B1C22" }}
            />
            <span style={{ fontSize: 11, opacity: 0.7, color: "#e9d6c4", textAlign: "right" }}>Full out</span>
          </label>
          <button
            type="button"
            onClick={() => {
              trackEvent("studio_gesture_inward", { verb: spec.verb, quality: spec.quality });
              onInward();
            }}
            disabled={inward}
            style={{ ...chip(inward), marginTop: 10, padding: "8px 14px" }}
          >
            {inward ? "Going inside…" : "Take it inside"}
          </button>
        </div>

        <div style={{ borderTop: "1px solid rgba(243,217,191,0.08)", paddingTop: 14 }}>
          <div className="uppercase tracking-[0.2em]" style={label}>
            Your body
          </div>
          <button type="button" onClick={onCamera} style={{ ...chip(true), marginTop: 10, padding: "8px 14px" }}>
            Do it yourself
          </button>
          {yours && (
            <p style={{ fontSize: 12.5, color: "#cfe0ff", marginTop: 10, lineHeight: 1.5 }}>
              Yours read as {yours.main.name.toLowerCase()} · {yours.factors.toLowerCase()}
              {yours.main.id !== reading.main.id ? `. The figure's reads as ${reading.main.name.toLowerCase()}: which is the character?` : "."}
            </p>
          )}
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={sculpt} onChange={(e) => onSculpt(e.target.checked)} style={{ accentColor: "#9B1C22" }} />
          <span style={{ fontSize: 13, color: "#e9d6c4" }}>Keep the shape the hands make</span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 18px 16px", borderTop: "1px solid rgba(243,217,191,0.08)" }}>
        <span style={{ ...quiet, fontSize: 12 }}>
          {kept ? "This is the role's gesture. Places plays it." : role.gesture ? `Kept: ${describe(role.gesture)}` : "Not kept yet."}
        </span>
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
            border: "1px solid #9B1C22",
            background: kept ? "transparent" : "#9B1C22",
            color: kept ? "#E9C3BC" : "#F7EFE6",
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
