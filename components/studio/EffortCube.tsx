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
import {
  activeRole,
  loadNotebook,
  newId,
  newRole,
  saveNotebook,
  updateRole,
  type Notebook as NotebookData,
  type Role,
} from "@/lib/studio/notebook";
import type { ArcState, CornerLabel, PinLabel, SceneApi } from "./EffortCubeScene";
import { useAuth } from "@/lib/auth";
import Notebook, { type Tab } from "./Notebook";
import { display, EASE, mono } from "./style";
import { useStudioSync } from "./useStudioSync";

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
function subscribeResize(fn: () => void) {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
}

/** The notebook's width on a wide screen. */
const DRAWER = 400;

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "TEXTAREA" || el.isContentEditable) return true;
  return el.tagName === "INPUT" && (el as HTMLInputElement).type !== "range";
};

export default function EffortCube() {
  const router = useRouter();
  const [point, setPoint] = useState<EffortPoint>(CENTRE);
  const pointRef = useRef<EffortPoint>(CENTRE);
  const apiRef = useRef<SceneApi | null>(null);
  const arcRef = useRef<ArcState>({ version: 0, points: [], active: null });
  const [labels, setLabels] = useState<CornerLabel[]>([]);
  const [pinLabels, setPinLabels] = useState<PinLabel[]>([]);
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
  const wide = useSyncExternalStore(subscribeResize, () => window.innerWidth >= 900, () => true);

  // Arrival: the HUD comes in after the lights, in a cascade. Leaving: it all goes at once.
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [hud, setHud] = useState(true);
  const [hint, setHint] = useState(true);

  // The role's notebook, kept in this browser for now.
  const [nb, setNb] = useState<NotebookData | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("text");
  const [line, setLine] = useState<number | null>(null);
  const { user } = useAuth();
  const [activeMoment, setActiveMoment] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = window.setTimeout(() => setEntered(true), 120);
    const b = window.setTimeout(() => setHint(false), 9000);
    const c = window.requestAnimationFrame(() => setNb(loadNotebook()));
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.cancelAnimationFrame(c);
    };
  }, []);

  useEffect(() => {
    if (!nb) return;
    const t = window.setTimeout(() => saveNotebook(nb), 250);
    return () => window.clearTimeout(t);
  }, [nb]);

  const sync = useStudioSync(nb, setNb);
  const role: Role | null = nb ? activeRole(nb) : null;
  const moments = useMemo(() => role?.moments ?? [], [role]);

  // Hand the arc to the stage.
  useEffect(() => {
    const idx = moments.findIndex((m) => m.id === activeMoment);
    arcRef.current = {
      version: arcRef.current.version + 1,
      points: moments.map((m) => m.point),
      active: idx >= 0 ? idx : null,
    };
  }, [moments, activeMoment]);

  // Keep the stage centred beside the drawer.
  const inset = open && wide ? DRAWER + 16 : 0;
  useEffect(() => {
    apiRef.current?.setInset(inset);
    const t = window.setTimeout(() => apiRef.current?.setInset(inset), 400); // the stage may still be starting
    return () => window.clearTimeout(t);
  }, [inset]);

  const move = useCallback((p: EffortPoint) => {
    const c = clampPoint(p);
    pointRef.current = c;
    setPoint(c);
    setHint(false);
  }, []);

  const jump = useCallback((id: ActionId) => move(actionPoint(id)), [move]);

  const editRole = useCallback(
    (fn: (r: Role) => Role) => setNb((cur) => (cur ? updateRole(cur, activeRole(cur).id, fn) : cur)),
    [],
  );

  const pin = useCallback(() => {
    const id = newId();
    editRole((r) => ({
      ...r,
      moments: [
        ...r.moments,
        { id, label: "", point: { ...pointRef.current }, note: "", ...(r.piece && line !== null ? { line } : {}) },
      ],
    }));
    setActiveMoment(id);
    // Pinning from the text keeps you on the text; otherwise name the new moment.
    if (!(role?.piece && line !== null && tab === "text")) setTab("moments");
    setOpen(true);
  }, [editRole, line, role?.piece, tab]);

  const goTo = useCallback(
    (id: string) => {
      const m = moments.find((x) => x.id === id);
      if (!m) return;
      setActiveMoment(id);
      if (typeof m.line === "number") setLine(m.line);
      move(m.point);
    },
    [moments, move],
  );

  // Play the arc: walk the point through each moment in order.
  useEffect(() => {
    if (!playing) return;
    if (moments.length < 2) {
      const t = window.setTimeout(() => setPlaying(false), 0);
      return () => window.clearTimeout(t);
    }
    let i = 0;
    const step = () => {
      const m = moments[i];
      if (!m) return setPlaying(false);
      setActiveMoment(m.id);
      if (typeof m.line === "number") setLine(m.line);
      move(m.point);
      i += 1;
    };
    step();
    const t = window.setInterval(step, 2600);
    return () => window.clearInterval(t);
  }, [playing, moments, move]);

  const leave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    router.prefetch("/");
    await Promise.race([apiRef.current?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 700))]);
    router.push("/");
  }, [leaving, router]);

  // Hands on the keys (not while writing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const inRange = (e.target as HTMLElement | null)?.tagName === "INPUT";
      const step = e.shiftKey ? 0.25 : 0.1;
      const p = pointRef.current;
      const k = e.key;
      const lower = k.length === 1 ? k.toLowerCase() : k;
      const keys: Record<string, () => void> = {
        Escape: () => (open ? setOpen(false) : void leave()),
        "0": () => move(CENTRE),
        c: () => move(CENTRE),
        h: () => setHud((v) => !v),
        f: () => apiRef.current?.home(),
        n: () => setOpen((v) => !v),
        p: pin,
        q: () => move({ ...p, time: p.time - step }),
        e: () => move({ ...p, time: p.time + step }),
      };
      ACTIONS.forEach((a, i) => (keys[String(i + 1)] = () => jump(a.id)));
      if (!inRange) {
        // the slider keeps the arrows for itself
        keys.ArrowLeft = () => move({ ...p, space: p.space - step });
        keys.ArrowRight = () => move({ ...p, space: p.space + step });
        keys.ArrowUp = () => move({ ...p, weight: p.weight - step });
        keys.ArrowDown = () => move({ ...p, weight: p.weight + step });
      }
      const run = keys[lower];
      if (!run) return;
      // Swallow the key, so a shortcut that moves focus into a field (P) doesn't type into it.
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, leave, move, open, pin]);

  const onLabels = useCallback((c: CornerLabel[], p: PinLabel[]) => {
    setLabels(c);
    setPinLabels(p);
  }, []);

  const reading = useMemo(() => read(point), [point]);
  const shown = entered && !leaving;
  const dur = reducedMotion ? 0 : 1;
  const enter = (delayMs: number, from = "translateY(10px)") => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : from,
    transition: `opacity ${(leaving ? 220 : 700) * dur}ms ${EASE} ${(leaving ? 0 : delayMs) * dur}ms, transform ${(leaving ? 220 : 800) * dur}ms ${EASE} ${(leaving ? 0 : delayMs) * dur}ms`,
  });
  // On a phone the notebook covers the stage; the reading panel steps aside.
  const panelVisible = hud && !(open && !wide);
  const centreX = `calc(50% + ${inset / 2}px)`;

  return (
    <main
      className="text-[#f3e6da]"
      style={{ position: "fixed", inset: 0, background: "#130b08", overflow: "hidden", userSelect: "none" }}
    >
      <EffortCubeScene
        pointRef={pointRef}
        apiRef={apiRef}
        arcRef={arcRef}
        onDrag={move}
        onCorner={jump}
        onHover={setHovered}
        onLabels={onLabels}
        onFail={setFailed}
        onGpuLost={() => setForceWebGL(true)}
        reducedMotion={reducedMotion}
        forceWebGL={forceWebGL || wantWebGL}
      />

      {/* Corner names and moment numbers, pinned to the 3D points. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", ...enter(450, "none") }}>
        {labels.map((l) => {
          if (!l.visible) return null;
          const hot = hovered === l.id || l.share > 0.3;
          return (
            <div
              key={l.id}
              className="uppercase tracking-[0.16em] font-semibold"
              style={{
                position: "absolute",
                left: l.x,
                top: l.y,
                transform: `translate(-50%, -50%) scale(${hovered === l.id ? 1.12 : 1})`,
                transition: `transform 200ms ${EASE}, color 200ms, background 200ms`,
                fontSize: 11,
                lineHeight: 1,
                padding: "4px 7px",
                background: hot ? "rgba(203,75,0,0.28)" : "rgba(19,11,8,0.62)",
                border: `1px solid ${hot ? "rgba(255,178,122,0.45)" : "rgba(243,217,191,0.1)"}`,
                color: hot ? "#ffe2c4" : "#ead8c6",
                opacity: hot ? 1 : 0.82,
                whiteSpace: "nowrap",
              }}
            >
              {ACTIONS.find((a) => a.id === l.id)?.name}
            </div>
          );
        })}
        {pinLabels.map((p) => {
          if (!p.visible) return null;
          const m = moments[p.index];
          const on = m && m.id === activeMoment;
          return (
            <div
              key={p.index}
              style={{
                ...mono,
                position: "absolute",
                left: p.x + 12,
                top: p.y - 12,
                fontSize: 10,
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: on ? "#CB4B00" : "rgba(19,11,8,0.75)",
                border: "1px solid rgba(255,178,122,0.5)",
                color: "#fff1e4",
              }}
            >
              {p.index + 1}
            </div>
          );
        })}
      </div>

      {/* Top: a way out, the notebook, the instrument, and the live numbers. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: open && wide ? DRAWER + 16 : 0,
          right: 0,
          padding: "18px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          pointerEvents: "none",
          ...enter(250, "translateY(-8px)"),
          transition: `${enter(250).transition}, left 450ms ${EASE}`,
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center", pointerEvents: "auto" }}>
          {!(open && wide) && (
            <button
              type="button"
              onClick={leave}
              className="uppercase tracking-[0.22em] text-[#e9d6c4] hover:text-white"
              style={{ fontSize: 11, opacity: 0.7, background: "none", border: 0, cursor: "pointer" }}
            >
              ← {wide ? "ActorRise" : ""}
              {fine && wide && <span style={{ ...mono, opacity: 0.5, marginLeft: 8, letterSpacing: 0 }}>esc</span>}
            </button>
          )}
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="uppercase tracking-[0.18em]"
              style={{
                fontSize: 11,
                padding: "7px 12px",
                borderRadius: 999,
                background: "rgba(203,75,0,0.18)",
                border: "1px solid rgba(203,75,0,0.55)",
                color: "#ffd2a6",
                cursor: "pointer",
              }}
            >
              {role?.name ? role.name : "Notebook"}
              {fine && wide && <span style={{ ...mono, opacity: 0.6, marginLeft: 8, letterSpacing: 0 }}>N</span>}
            </button>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="uppercase tracking-[0.3em] text-[#CB4B00]" style={{ fontSize: 10.5 }}>
            Studio
          </div>
          <div style={{ ...display, fontSize: wide ? 20 : 17, lineHeight: 1.1 }}>The effort cube</div>
          {wide && (
            <div
              className="text-[#e9d6c4]"
              style={{ ...mono, fontSize: 10.5, marginTop: 6, opacity: 0.55, fontVariantNumeric: "tabular-nums" }}
            >
              W {signed(point.weight)} · S {signed(point.space)} · T {signed(point.time)}
            </div>
          )}
        </div>
      </div>

      {hint && !failed && !open && (
        <div
          className="text-center text-[#e9d6c4]"
          style={{
            position: "absolute",
            top: 96,
            left: "50%",
            translate: "-50% 0",
            fontSize: 13,
            pointerEvents: "none",
            width: "min(92vw, 470px)",
            ...enter(900),
            opacity: shown ? 0.75 : 0,
          }}
        >
          Drag the light inside the cube. Tap a corner to go there. Drag anywhere else to look around.
          {fine && (
            <div style={{ ...mono, fontSize: 10.5, marginTop: 8, opacity: 0.6 }}>
              1–8 corners · arrows, Q/E move · P pin · N notebook · H hide · F home · esc leave
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

      {/* Bottom: the reading, the three factors, and the pin. */}
      <section
        aria-hidden={!panelVisible}
        style={{
          position: "absolute",
          left: centreX,
          bottom: "max(16px, env(safe-area-inset-bottom))",
          translate: "-50% 0",
          width: `min(calc(100vw - 32px - ${inset}px), 640px)`,
          padding: "16px 18px 14px",
          borderRadius: 18,
          background: "rgba(26, 15, 11, 0.66)",
          border: "1px solid rgba(243, 217, 191, 0.12)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          pointerEvents: panelVisible ? "auto" : "none",
          ...enter(550, "translateY(24px)"),
          transition: `${enter(550).transition}, left 450ms ${EASE}, width 450ms ${EASE}`,
          ...(shown && !panelVisible
            ? {
                opacity: 0,
                transform: "translateY(calc(100% + 24px))",
                transition: `opacity ${300 * dur}ms ${EASE}, transform ${450 * dur}ms ${EASE}, left 450ms ${EASE}`,
              }
            : {}),
        }}
      >
        <div aria-live="polite" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div
              key={reading.sentence}
              style={{ ...display, fontSize: 26, lineHeight: 1.15, animation: `studio-in 380ms ${EASE}` }}
            >
              {reading.sentence}
            </div>
            <div className="text-[#e9d6c4]" style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
              {reading.factors}.{" "}
              {reading.mainShare >= 0.2 && <span style={{ opacity: 0.75 }}>{reading.main.feel}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignSelf: "flex-start", flex: "none" }}>
            <button
              type="button"
              onClick={pin}
              className="uppercase tracking-[0.16em]"
              title={fine ? "Pin this moment (P)" : "Pin this moment"}
              style={{
                fontSize: 10.5,
                padding: "7px 12px",
                borderRadius: 999,
                background: "#CB4B00",
                border: "1px solid #CB4B00",
                color: "#fff6ee",
                cursor: "pointer",
              }}
            >
              Pin moment
            </button>
            <button
              type="button"
              onClick={() => setHud(false)}
              aria-label="Hide the panel (H)"
              className="text-[#e9d6c4]"
              style={{
                ...mono,
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
          left: centreX,
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
          opacity: shown && !hud && !(open && !wide) ? 0.85 : 0,
          transform: shown && !hud ? "none" : "translateY(12px)",
          pointerEvents: shown && !hud && !(open && !wide) ? "auto" : "none",
          transition: `opacity ${400 * dur}ms ${EASE} ${hud ? 0 : 150 * dur}ms, transform ${500 * dur}ms ${EASE}, left 450ms ${EASE}`,
        }}
      >
        {reading.sentence}
      </button>

      {nb && role && (
        <Notebook
          open={open && shown}
          wide={wide}
          width={DRAWER}
          nb={nb}
          role={role}
          tab={tab}
          onTab={setTab}
          onClose={() => setOpen(false)}
          onLeave={leave}
          onEdit={editRole}
          onSwitch={(id) => {
            setNb((cur) => (cur ? { ...cur, activeId: id } : cur));
            setActiveMoment(null);
            setPlaying(false);
            setLine(null);
          }}
          onNewRole={() => {
            const r = newRole();
            setNb((cur) => (cur ? { ...cur, roles: [...cur.roles, r], activeId: r.id } : cur));
            setActiveMoment(null);
            setTab("questions");
          }}
          onDeleteRole={() =>
            setNb((cur) => {
              if (!cur) return cur;
              const gone = cur.activeId;
              const deleted = gone ? { ...(cur.deleted ?? {}), [gone]: Date.now() } : cur.deleted;
              const roles = cur.roles.filter((r) => r.id !== gone);
              if (!roles.length) {
                const r = newRole();
                return { ...cur, roles: [r], activeId: r.id, deleted };
              }
              return { ...cur, roles, activeId: roles[0].id, deleted };
            })
          }
          point={point}
          activeMoment={activeMoment}
          onPin={pin}
          onGoTo={goTo}
          playing={playing}
          onPlay={() => setPlaying((v) => !v)}
          fine={fine}
          sync={sync}
          signedIn={!!user}
          line={line}
          onLine={setLine}
        />
      )}

      <style>{`
        @keyframes studio-in { from { opacity: 0; transform: translateY(6px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
        .studio-scroll { scrollbar-width: thin; scrollbar-color: rgba(243,217,191,0.18) transparent; }
        .studio-field { width: 100%; background: rgba(243,217,191,0.04); border: 1px solid rgba(243,217,191,0.12); border-radius: 10px; color: #f3e6da; padding: 9px 11px; font-size: 14px; line-height: 1.45; outline: none; resize: none; transition: border-color 200ms, background 200ms; user-select: text; }
        .studio-field:focus { border-color: rgba(203,75,0,0.7); background: rgba(243,217,191,0.07); }
        .studio-field::placeholder { color: rgba(233,214,196,0.38); }
        .studio-bare { width: 100%; background: transparent; border: 0; outline: none; color: #f3e6da; padding: 0; user-select: text; }
        .studio-bare::placeholder { color: rgba(233,214,196,0.38); }
      `}</style>
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
