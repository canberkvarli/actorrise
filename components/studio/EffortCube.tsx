"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ACTIONS,
  CENTRE,
  FACTORS,
  actionPoint,
  clampPoint,
  read,
  type ActionId,
  type EffortPoint,
  type FactorKey,
} from "@/lib/studio/effort";
import type { CornerLabel, SceneApi } from "./EffortCubeScene";

// three/webgpu touches `navigator` and `window`; keep it out of the server render.
const EffortCubeScene = dynamic(() => import("./EffortCubeScene"), { ssr: false });

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(fn: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}
const getReducedMotion = () => window.matchMedia(REDUCED).matches;
const noSubscribe = () => () => {};

const display = { fontFamily: "var(--font-brand), Georgia, serif" } as const;
const mono = { fontFamily: "var(--font-mono), ui-monospace, monospace" } as const;
/** One curve for everything that moves in the HUD: fast out, soft landing. */
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

export default function EffortCube() {
  const router = useRouter();
  const [point, setPoint] = useState<EffortPoint>(CENTRE);
  const pointRef = useRef<EffortPoint>(CENTRE);
  const apiRef = useRef<SceneApi | null>(null);
  const [labels, setLabels] = useState<CornerLabel[]>([]);
  const [hovered, setHovered] = useState<ActionId | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // WebGPU first; if the device is lost or will not start, WebGL2. `?gl=webgl` forces it.
  const [forceWebGL, setForceWebGL] = useState(false);
  const wantWebGL = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("gl") === "webgl",
    () => false,
  );
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const fine = useSyncExternalStore(noSubscribe, () => window.matchMedia("(pointer: fine)").matches, () => true);

  // Arrival: the HUD comes in after the lights, in a cascade. Leaving: it all goes at once.
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [hud, setHud] = useState(true);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const a = window.setTimeout(() => setEntered(true), 120);
    const b = window.setTimeout(() => setHint(false), 9000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);

  const move = useCallback((p: EffortPoint) => {
    const c = clampPoint(p);
    pointRef.current = c;
    setPoint(c);
    setHint(false);
  }, []);

  const jump = useCallback((id: ActionId) => move(actionPoint(id)), [move]);

  const leave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    router.prefetch("/");
    await Promise.race([apiRef.current?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 700))]);
    router.push("/");
  }, [leaving, router]);

  // Hands on the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const inRange = (e.target as HTMLElement | null)?.tagName === "INPUT";
      const step = e.shiftKey ? 0.25 : 0.1;
      const p = pointRef.current;
      const k = e.key;
      if (k === "Escape") return void leave();
      if (k >= "1" && k <= "8") return jump(ACTIONS[Number(k) - 1].id);
      if (k === "0" || k === "c" || k === "C") return move(CENTRE);
      if (k === "h" || k === "H") return setHud((v) => !v);
      if (k === "f" || k === "F") return apiRef.current?.home();
      if (k === "q" || k === "Q") return move({ ...p, time: p.time - step });
      if (k === "e" || k === "E") return move({ ...p, time: p.time + step });
      if (inRange) return; // the slider has the arrows
      if (k === "ArrowLeft") move({ ...p, space: p.space - step });
      else if (k === "ArrowRight") move({ ...p, space: p.space + step });
      else if (k === "ArrowUp") move({ ...p, weight: p.weight - step });
      else if (k === "ArrowDown") move({ ...p, weight: p.weight + step });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, leave, move]);

  const reading = useMemo(() => read(point), [point]);
  const shown = entered && !leaving;
  const dur = reducedMotion ? 0 : 1;
  const enter = (delayMs: number, from = "translateY(10px)") => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : from,
    transition: `opacity ${(leaving ? 220 : 700) * dur}ms ${EASE} ${(leaving ? 0 : delayMs) * dur}ms, transform ${(leaving ? 220 : 800) * dur}ms ${EASE} ${(leaving ? 0 : delayMs) * dur}ms`,
  });

  return (
    <main
      className="text-[#f3e6da]"
      style={{ position: "fixed", inset: 0, background: "#130b08", overflow: "hidden", userSelect: "none" }}
    >
      <EffortCubeScene
        pointRef={pointRef}
        apiRef={apiRef}
        onDrag={move}
        onCorner={jump}
        onHover={setHovered}
        onLabels={setLabels}
        onFail={setFailed}
        onGpuLost={() => setForceWebGL(true)}
        reducedMotion={reducedMotion}
        forceWebGL={forceWebGL || wantWebGL}
      />

      {/* Corner names, pinned to the 3D corners. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", ...enter(450, "none") }}>
        {labels.map((l) => {
          if (!l.visible) return null;
          const hot = hovered === l.id;
          return (
            <div
              key={l.id}
              className="uppercase tracking-[0.18em] font-semibold"
              style={{
                position: "absolute",
                left: l.x,
                top: l.y,
                transform: `translate(-50%, -50%) scale(${hot ? 1.15 : 1})`,
                transition: `transform 200ms ${EASE}, color 200ms`,
                fontSize: 10.5,
                opacity: hot ? 1 : 0.4 + Math.min(1, l.share * 2.2) * 0.6,
                color: hot || l.share > 0.3 ? "#ffd2a6" : "#e9d6c4",
                textShadow: "0 0 12px rgba(203,75,0,0.55)",
                whiteSpace: "nowrap",
              }}
            >
              {ACTIONS.find((a) => a.id === l.id)?.name}
            </div>
          );
        })}
      </div>

      {/* Top: a way out, the instrument, and the live numbers. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "18px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          pointerEvents: "none",
          ...enter(250, "translateY(-8px)"),
        }}
      >
        <button
          type="button"
          onClick={leave}
          className="uppercase tracking-[0.22em] text-[#e9d6c4] hover:text-white"
          style={{ fontSize: 11, pointerEvents: "auto", opacity: 0.7, background: "none", border: 0, cursor: "pointer" }}
        >
          ← ActorRise{fine && <span style={{ ...mono, opacity: 0.5, marginLeft: 8, letterSpacing: 0 }}>esc</span>}
        </button>
        <div style={{ textAlign: "right" }}>
          <div className="uppercase tracking-[0.3em] text-[#CB4B00]" style={{ fontSize: 10.5 }}>
            Studio
          </div>
          <div style={{ ...display, fontSize: 20, lineHeight: 1.1 }}>The effort cube</div>
          <div
            className="text-[#e9d6c4]"
            style={{ ...mono, fontSize: 10.5, marginTop: 6, opacity: 0.55, fontVariantNumeric: "tabular-nums" }}
          >
            W {signed(point.weight)} · S {signed(point.space)} · T {signed(point.time)}
          </div>
        </div>
      </div>

      {hint && !failed && (
        <div
          className="text-center text-[#e9d6c4]"
          style={{
            position: "absolute",
            top: 92,
            left: "50%",
            translate: "-50% 0",
            fontSize: 13,
            pointerEvents: "none",
            width: "min(92vw, 460px)",
            ...enter(900),
            opacity: shown ? 0.75 : 0,
          }}
        >
          Drag the light inside the cube. Tap a corner to go there. Drag anywhere else to look around.
          {fine && (
            <div style={{ ...mono, fontSize: 10.5, marginTop: 8, opacity: 0.6 }}>
              1–8 corners · arrows, Q/E move · H hide · F home · esc leave
            </div>
          )}
        </div>
      )}

      {failed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 380 }}>
            <div style={{ ...display, fontSize: 24 }}>The stage could not light up.</div>
            <p style={{ marginTop: 10, fontSize: 14, opacity: 0.7 }}>
              This browser could not start 3D. Try a recent Chrome or Safari.
            </p>
          </div>
        </div>
      )}

      {/* Bottom: the reading and the three factors. H hides it for the full stage. */}
      <section
        aria-hidden={!hud}
        style={{
          position: "absolute",
          left: "50%",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          translate: "-50% 0",
          width: "min(calc(100vw - 32px), 640px)",
          padding: "16px 18px 14px",
          borderRadius: 18,
          background: "rgba(26, 15, 11, 0.62)",
          border: "1px solid rgba(243, 217, 191, 0.12)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          pointerEvents: hud ? "auto" : "none",
          ...enter(550, "translateY(24px)"),
          ...(shown && !hud
            ? {
                opacity: 0,
                transform: "translateY(calc(100% + 24px))",
                transition: `opacity ${300 * dur}ms ${EASE}, transform ${450 * dur}ms ${EASE}`,
              }
            : {}),
        }}
      >
        <div aria-live="polite" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div key={reading.sentence} style={{ ...display, fontSize: 26, lineHeight: 1.15, animation: `studio-in 380ms ${EASE}` }}>
              {reading.sentence}
            </div>
            <div className="text-[#e9d6c4]" style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
              {reading.factors}.{" "}
              {reading.mainShare >= 0.2 && <span style={{ opacity: 0.75 }}>{reading.main.feel}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHud(false)}
            aria-label="Hide the panel (H)"
            className="text-[#e9d6c4]"
            style={{
              ...mono,
              flex: "none",
              alignSelf: "flex-start",
              fontSize: 10.5,
              opacity: 0.5,
              background: "none",
              border: "1px solid rgba(243,217,191,0.18)",
              borderRadius: 6,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            H
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {(Object.keys(FACTORS) as FactorKey[]).map((k) => (
            <FactorSlider key={k} k={k} value={point[k]} onChange={(v) => move({ ...point, [k]: v })} />
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {ACTIONS.map((a, i) => {
            const on = reading.mainShare >= 0.2 && reading.main.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => jump(a.id)}
                onPointerEnter={() => setHovered(a.id)}
                onPointerLeave={() => setHovered(null)}
                className="uppercase tracking-[0.14em]"
                title={fine ? `${a.name} (${i + 1})` : a.name}
                style={{
                  fontSize: 10.5,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${on ? "#CB4B00" : "rgba(243,217,191,0.18)"}`,
                  background: on ? "rgba(203,75,0,0.22)" : "transparent",
                  color: on ? "#ffd2a6" : "#e9d6c4",
                  cursor: "pointer",
                  flex: "none",
                  transition: `background 250ms ${EASE}, border-color 250ms ${EASE}, color 250ms`,
                }}
              >
                {a.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => move(CENTRE)}
            className="uppercase tracking-[0.14em]"
            style={{
              fontSize: 10.5,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px dashed rgba(243,217,191,0.18)",
              background: "transparent",
              color: "#e9d6c4",
              opacity: 0.7,
              cursor: "pointer",
              flex: "none",
            }}
          >
            Centre
          </button>
        </div>
      </section>

      {/* With the panel hidden: one small way to bring it back. */}
      <button
        type="button"
        onClick={() => setHud(true)}
        aria-label="Show the panel (H)"
        className="uppercase tracking-[0.18em] text-[#e9d6c4]"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "max(18px, env(safe-area-inset-bottom))",
          translate: "-50% 0",
          fontSize: 10.5,
          padding: "8px 14px",
          borderRadius: 999,
          background: "rgba(26, 15, 11, 0.55)",
          border: "1px solid rgba(243, 217, 191, 0.14)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          cursor: "pointer",
          opacity: shown && !hud ? 0.85 : 0,
          transform: shown && !hud ? "none" : "translateY(12px)",
          pointerEvents: shown && !hud ? "auto" : "none",
          transition: `opacity ${400 * dur}ms ${EASE} ${hud ? 0 : 150 * dur}ms, transform ${500 * dur}ms ${EASE}`,
        }}
      >
        {reading.sentence}
      </button>

      <style>{`@keyframes studio-in { from { opacity: 0; transform: translateY(6px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }`}</style>
    </main>
  );
}

function FactorSlider({ k, value, onChange }: { k: FactorKey; value: number; onChange: (v: number) => void }) {
  const f = FACTORS[k];
  return (
    <label style={{ display: "grid", gridTemplateColumns: "68px 1fr 68px", alignItems: "center", gap: 10 }}>
      <span className="uppercase tracking-[0.14em] text-[#e9d6c4]" style={{ fontSize: 10.5, opacity: 0.75 }}>
        {f.neg}
      </span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${f.name}: ${f.neg} to ${f.pos}`}
        style={{ width: "100%", accentColor: "#CB4B00" }}
      />
      <span
        className="uppercase tracking-[0.14em] text-[#e9d6c4]"
        style={{ fontSize: 10.5, opacity: 0.75, textAlign: "right" }}
      >
        {f.pos}
      </span>
    </label>
  );
}
