"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ACTIONS,
  CENTRE,
  FACTORS,
  actionPoint,
  read,
  type ActionId,
  type EffortPoint,
  type FactorKey,
} from "@/lib/studio/effort";
import type { CornerLabel } from "./EffortCubeScene";

// three/webgpu touches `navigator` and `window`; keep it out of the server render.
const EffortCubeScene = dynamic(() => import("./EffortCubeScene"), { ssr: false });

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(fn: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}
const getReducedMotion = () => window.matchMedia(REDUCED).matches;

const display = { fontFamily: "var(--font-brand), Georgia, serif" } as const;

export default function EffortCube() {
  const [point, setPoint] = useState<EffortPoint>(CENTRE);
  const pointRef = useRef<EffortPoint>(CENTRE);
  const [labels, setLabels] = useState<CornerLabel[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  // WebGPU first; if the device is lost or will not start, WebGL2. `?gl=webgl` forces it.
  const [forceWebGL, setForceWebGL] = useState(false);
  const wantWebGL = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("gl") === "webgl",
    () => false,
  );
  const [hint, setHint] = useState(true);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 7000);
    return () => window.clearTimeout(t);
  }, []);

  const move = useCallback((p: EffortPoint) => {
    pointRef.current = p;
    setPoint(p);
    setHint(false);
  }, []);

  const jump = useCallback((id: ActionId) => move(actionPoint(id)), [move]);

  const reading = useMemo(() => read(point), [point]);

  return (
    <main
      className="text-[#f3e6da]"
      style={{ position: "fixed", inset: 0, background: "#130b08", overflow: "hidden", userSelect: "none" }}
    >
      <EffortCubeScene
        pointRef={pointRef}
        onDrag={move}
        onCorner={jump}
        onLabels={setLabels}
        onFail={setFailed}
        onGpuLost={() => setForceWebGL(true)}
        reducedMotion={reducedMotion}
        forceWebGL={forceWebGL || wantWebGL}
      />

      {/* Corner names, pinned to the 3D corners. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {labels.map((l) =>
          l.visible ? (
            <div
              key={l.id}
              className="uppercase tracking-[0.18em] font-semibold"
              style={{
                position: "absolute",
                left: l.x,
                top: l.y,
                transform: "translate(-50%, -50%)",
                fontSize: 10.5,
                opacity: 0.4 + Math.min(1, l.share * 2.2) * 0.6,
                color: l.share > 0.3 ? "#ffd2a6" : "#e9d6c4",
                textShadow: "0 0 12px rgba(203,75,0,0.55)",
                whiteSpace: "nowrap",
              }}
            >
              {ACTIONS.find((a) => a.id === l.id)?.name}
            </div>
          ) : null,
        )}
      </div>

      {/* Top: a way out, and the name of the instrument. */}
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
        }}
      >
        <Link
          href="/"
          className="uppercase tracking-[0.22em] text-[#e9d6c4] hover:text-white"
          style={{ fontSize: 11, pointerEvents: "auto", opacity: 0.7 }}
        >
          ← ActorRise
        </Link>
        <div style={{ textAlign: "right" }}>
          <div className="uppercase tracking-[0.3em] text-[#CB4B00]" style={{ fontSize: 10.5 }}>
            Studio
          </div>
          <div style={{ ...display, fontSize: 20, lineHeight: 1.1 }}>The effort cube</div>
        </div>
      </div>

      {hint && !failed && (
        <div
          className="text-center text-[#e9d6c4]"
          style={{
            position: "absolute",
            top: 78,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 13,
            opacity: 0.75,
            pointerEvents: "none",
            width: "min(92vw, 420px)",
            transition: "opacity 600ms",
          }}
        >
          Drag the light inside the cube. Tap a corner to go there. Drag anywhere else to walk around.
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

      {/* Bottom: the reading and the three factors. */}
      <section
        style={{
          position: "absolute",
          left: "50%",
          bottom: "max(16px, env(safe-area-inset-bottom))",
          transform: "translateX(-50%)",
          width: "min(calc(100vw - 32px), 640px)",
          padding: "16px 18px 14px",
          borderRadius: 18,
          background: "rgba(26, 15, 11, 0.62)",
          border: "1px solid rgba(243, 217, 191, 0.12)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div aria-live="polite">
          <div style={{ ...display, fontSize: 26, lineHeight: 1.15 }}>{reading.sentence}</div>
          <div className="text-[#e9d6c4]" style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
            {reading.factors}.{" "}
            {reading.mainShare >= 0.2 && <span style={{ opacity: 0.75 }}>{reading.main.feel}</span>}
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {(Object.keys(FACTORS) as FactorKey[]).map((k) => (
            <FactorSlider key={k} k={k} value={point[k]} onChange={(v) => move({ ...point, [k]: v })} />
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {ACTIONS.map((a) => {
            const on = reading.main.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => jump(a.id)}
                className="uppercase tracking-[0.14em]"
                style={{
                  fontSize: 10.5,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${on ? "#CB4B00" : "rgba(243,217,191,0.18)"}`,
                  background: on ? "rgba(203,75,0,0.22)" : "transparent",
                  color: on ? "#ffd2a6" : "#e9d6c4",
                  cursor: "pointer",
                  flex: "none",
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
