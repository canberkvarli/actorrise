"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ACTIONS,
  CENTRE,
  actionPoint,
  clampPoint,
  read,
  type ActionId,
  type EffortPoint,
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
import type { ArcState, CornerLabel, GestureState, PinLabel, SceneApi } from "./EffortCubeScene";
import { useAuth } from "@/lib/auth";
import { trackEvent } from "@/lib/events";
import { heatCSS, heatOf } from "@/lib/studio/heat";
import Notebook, { type Tab } from "./Notebook";
import { usePiece } from "./PieceText";
import Places from "./Places";
import Prep from "./Prep";
import { isBlank } from "@/lib/studio/sync";
import { hasPlaces } from "@/lib/studio/places";
import { afterDue } from "@/lib/studio/after";
import { when } from "./After";
import { airOf, type AirId } from "@/lib/studio/air";
import { AirSound } from "./airSound";
import Tour, { tourSeen } from "./Tour";
import GesturePanel from "./GesturePanel";
import GestureCamera from "./GestureCamera";
import type { MotionReading } from "@/lib/studio/motion";
import { DEFAULT_GESTURE, effortOf, type GestureSpec } from "@/lib/studio/gesture";
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
  const airRef = useRef<AirId>("still");
  const gestureRef = useRef<GestureState>({
    active: false,
    spec: null,
    size: 1,
    sculpt: false,
    inward: null,
    mine: null,
    version: 0,
  });
  const soundRef = useRef<AirSound | null>(null);
  const [soundOn, setSoundOn] = useState(false);
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
    const c = window.requestAnimationFrame(() => setNb(loadNotebook()));
    return () => {
      window.clearTimeout(a);
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
  const pieceState = usePiece(role?.piece?.id);
  const [places, setPlaces] = useState(false);
  const [prep, setPrep] = useState(false);
  const [writingAfter, setWritingAfter] = useState(false);
  // The gesture tool: a draft spec the figure performs until it's kept on the role.
  const [gesture, setGesture] = useState(false);
  const [gSpec, setGSpec] = useState<GestureSpec>(DEFAULT_GESTURE);
  const [gSize, setGSize] = useState(1);
  const [gSculpt, setGSculpt] = useState(false);
  const [gInward, setGInward] = useState<{ start: number; dur: number } | null>(null);
  const [camera, setCamera] = useState(false);
  const [mine, setMine] = useState<[number, number, number][][] | null>(null);
  const [placesGesture, setPlacesGesture] = useState<{ spec: GestureSpec; start: number; dur: number } | null>(null);
  // The clock the "how did it go?" card reads, a minute at a time.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 60000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, []);
  // A new, empty role opens straight into the guided path, once a visit.
  const prepOffered = useRef(false);
  useEffect(() => {
    if (prepOffered.current || !role) return;
    prepOffered.current = true;
    if (isBlank(role) && tourSeen()) {
      const t = window.setTimeout(() => setPrep(true), 900); // after the lights come up
      return () => window.clearTimeout(t);
    }
  }, [role]);
  const canPlaces = !!role && hasPlaces(role);

  // Once a visit, when we know who's here (signed out, the API drops it anyway).
  const openedSent = useRef(false);
  useEffect(() => {
    if (openedSent.current || !nb || !user) return;
    openedSent.current = true;
    trackEvent("studio_opened", { signed_in: true, roles: nb.roles.length });
  }, [nb, user]);
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

  // The stage takes the air of the moment you're on; with no moment, it is still.
  const air: AirId = moments.find((m) => m.id === activeMoment)?.air ?? "still";
  useEffect(() => {
    airRef.current = air;
    soundRef.current?.set(airOf(air));
  }, [air]);
  useEffect(() => () => soundRef.current?.stop(), []);
  const toggleSound = () => {
    if (soundRef.current) {
      soundRef.current.stop();
      soundRef.current = null;
      setSoundOn(false);
    } else {
      const s = new AirSound();
      s.start(airOf(airRef.current));
      soundRef.current = s;
      setSoundOn(true);
    }
  };

  // Keep the stage centred beside the drawer.
  const inset = (open || prep || gesture) && wide ? DRAWER + 16 : 0;

  // Hand the gesture to the stage: the tool's draft, or Places' gesture cue.
  useEffect(() => {
    const g = gestureRef.current;
    const pg = placesGesture;
    gestureRef.current = {
      active: gesture || !!pg,
      spec: pg ? pg.spec : gSpec,
      size: gSize,
      sculpt: gesture && gSculpt,
      inward: pg ? { start: pg.start, dur: pg.dur } : gInward,
      mine: gesture ? mine : null,
      version: g.version + 1,
    };
  }, [gesture, gSpec, gSize, gSculpt, gInward, placesGesture, mine]);
  useEffect(() => {
    apiRef.current?.setInset(inset);
    const t = window.setTimeout(() => apiRef.current?.setInset(inset), 400); // the stage may still be starting
    return () => window.clearTimeout(t);
  }, [inset]);

  const [moved, setMoved] = useState(false);
  // What this is, the first time: four cards, then the ? brings them back.
  const [tour, setTour] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => !tourSeen() && setTour(true), 1400); // after the lights come up
    return () => window.clearTimeout(t);
  }, []);
  const move = useCallback((p: EffortPoint) => {
    setMoved(true);
    const c = clampPoint(p);
    pointRef.current = c;
    setPoint(c);
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
    trackEvent("studio_moment_pinned", {
      moments: (role?.moments.length ?? 0) + 1,
      on_line: !!(role?.piece && line !== null),
    });
    // Pinning from the text keeps you on the text; otherwise name the new moment.
    if (!(role?.piece && line !== null && tab === "text")) setTab("moments");
    setOpen(true);
  }, [editRole, line, role?.piece, role?.moments.length, tab]);

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
    soundRef.current?.stop();
    soundRef.current = null;
    router.prefetch("/");
    await Promise.race([apiRef.current?.close() ?? Promise.resolve(), new Promise((r) => setTimeout(r, 700))]);
    router.push("/");
  }, [leaving, router]);

  // Hands on the keys (not while writing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (places || prep || gesture) return; // Places, Prep and Gesture have the keys while they run
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
  }, [jump, leave, move, open, pin, places, prep, gesture]);

  const onLabels = useCallback((c: CornerLabel[], p: PinLabel[]) => {
    setLabels(c);
    setPinLabels(p);
  }, []);

  const openGesture = () => {
    if (!role) return;
    trackEvent("studio_gesture_opened", { has_gesture: !!role.gesture });
    setGSpec(role.gesture ?? DEFAULT_GESTURE);
    setGSize(1);
    setGInward(null);
    setMine(role.gestureTake?.paths ?? null);
    setOpen(false);
    setPrep(false);
    setPlaying(false);
    setGesture(true);
    apiRef.current?.focusPerformer();
  };
  const closeGesture = () => {
    setCamera(false);
    setGesture(false);
    setGInward(null);
    apiRef.current?.home();
  };
  const changeGesture = (s: GestureSpec) => {
    setGSpec(s);
    setGInward(null);
    move(effortOf(s)); // the cube shows where it sits when you come back to it
  };
  const takeInside = () => {
    const dur = reducedMotion ? 4000 : 14000;
    setGInward({ start: performance.now(), dur });
    window.setTimeout(() => {
      setGInward(null);
      setGSize(0);
    }, dur);
  };

  const openPrep = () => {
    setOpen(false);
    setPlaying(false);
    setPrep(true);
  };

  const startPlaces = () => {
    if (role)
      trackEvent("studio_places_started", { moments: role.moments.length, has_piece: !!role.piece });
    setPlaying(false);
    setOpen(false);
    setPrep(false);
    setPlaces(true);
    apiRef.current?.focusPerformer();
  };
  /** The role was worked: saved at once, since Run it leaves the page. */
  const markRan = () =>
    setNb((cur) => {
      if (!cur) return cur;
      const next = updateRole(cur, activeRole(cur).id, (r) => ({ ...r, ranAt: Date.now() }));
      saveNotebook(next);
      return next;
    });

  const endPlaces = (worked: boolean) => {
    if (worked) markRan();
    setPlacesGesture(null);
    setPlaces(false);
    apiRef.current?.home();
  };

  const reading = useMemo(() => read(point), [point]);
  const shown = entered && !leaving && !places;
  const dur = reducedMotion ? 0 : 1;
  const enter = (delayMs: number, from = "translateY(10px)") => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : from,
    transition: `opacity ${(leaving ? 220 : 700) * dur}ms ${EASE} ${(leaving ? 0 : delayMs) * dur}ms, transform ${(leaving ? 220 : 800) * dur}ms ${EASE} ${(leaving ? 0 : delayMs) * dur}ms`,
  });
  // On a phone the notebook covers the stage; the reading panel steps aside.
  const panelVisible = hud && !gesture && !placesGesture && !((open || prep) && !wide);
  const centreX = `calc(50% + ${inset / 2}px)`;

  return (
    <main
      className="text-[#f4f4f2]"
      style={{ position: "fixed", inset: 0, background: "#0b0b0c", overflow: "hidden", userSelect: "none" }}
    >
      <EffortCubeScene
        pointRef={pointRef}
        apiRef={apiRef}
        arcRef={arcRef}
        airRef={airRef}
        gestureRef={gestureRef}
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
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          ...enter(450, "none"),
          ...(gesture || placesGesture ? { opacity: 0 } : {}),
        }}
      >
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
                background: hot ? "rgba(244,244,242,0.16)" : "rgba(11,11,12,0.62)",
                border: `1px solid ${hot ? "rgba(244,244,242,0.45)" : "rgba(244,244,242,0.1)"}`,
                color: hot ? "#f4f4f2" : "#e4e4e0",
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
                background: on ? "#f4f4f2" : "rgba(11,11,12,0.75)",
                border: "1px solid rgba(244,244,242,0.5)",
                color: "#f4f4f2",
              }}
            >
              {p.index + 1}
            </div>
          );
        })}
      </div>

      {/* Top: the role on the left (opens its notebook); what you can do with it on the right. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: (open || prep || gesture) && wide ? DRAWER + 16 : 0,
          right: 0,
          padding: wide ? "18px 22px" : "14px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          pointerEvents: "none",
          ...enter(250, "translateY(-8px)"),
          transition: `${enter(250).transition}, left 450ms ${EASE}`,
        }}
      >
        {!open && !prep && !gesture ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="This role's notebook"
            style={{
              pointerEvents: "auto",
              background: "none",
              border: 0,
              padding: 0,
              textAlign: "left",
              cursor: "pointer",
              color: "#f4f4f2",
              minWidth: 0,
            }}
          >
            <span style={{ ...display, fontSize: wide ? 22 : 19, lineHeight: 1.1, display: "block" }}>
              {role?.name || "Untitled role"} <span style={{ fontSize: 13, opacity: 0.5 }}>▾</span>
            </span>
            <span style={{ fontSize: 11, color: "#8f8f8b", display: "block", marginTop: 3 }}>
              {role?.scene || "Your notebook"}
            </span>
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", pointerEvents: "auto", flex: "none" }}>
          {!open && !prep && !gesture && (
            <>
              <TopAction label="Prep" sub="work the role" primary wide={wide} onClick={openPrep} />
              <TopAction label="Gesture" sub="find the body" wide={wide} onClick={openGesture} />
              {canPlaces && wide && <TopAction label="Places" sub="before you go on" wide={wide} onClick={startPlaces} />}
            </>
          )}
          <TopAction label="?" wide={false} onClick={() => setTour(true)} title="How this works" round />
          <TopAction label="Sound" wide={false} onClick={toggleSound} pressed={soundOn} title="The sound of the air" />
        </div>
      </div>

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

      {/* Bottom: where you are, the three factors, and the pin. */}
      <section
        aria-hidden={!panelVisible}
        style={{
          position: "absolute",
          left: centreX,
          bottom: "max(16px, env(safe-area-inset-bottom))",
          translate: "-50% 0",
          width: `min(calc(100vw - 32px - ${inset}px), 520px)`,
          padding: "16px 18px 14px",
          borderRadius: 18,
          background: "rgba(16, 16, 17, 0.66)",
          border: "1px solid rgba(244, 244, 242, 0.12)",
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
              style={{
                ...display,
                fontSize: 28,
                lineHeight: 1.1,
                color: heatCSS(heatOf(point)),
                transition: "color 400ms",
                animation: `studio-in 380ms ${EASE}`,
              }}
            >
              {reading.sentence}
            </div>
            <div style={{ fontSize: 13, color: "#cfcfcb", opacity: 0.75, marginTop: 6, lineHeight: 1.4 }}>
              {moved ? (reading.mainShare >= 0.2 ? reading.main.feel : "Move toward a corner.") : "Drag the light, or tap a corner."}
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
                background: "#f4f4f2",
                border: "1px solid #f4f4f2",
                color: "#0b0b0c",
                cursor: "pointer",
              }}
            >
              Pin
            </button>
          </div>
        </div>

      </section>

      {/* With the panel hidden: one small way to bring it back. */}
      <button
        type="button"
        onClick={() => setHud(true)}
        aria-label="Show the panel (H)"
        className="uppercase tracking-[0.18em] text-[#cfcfcb]"
        style={{
          position: "absolute",
          left: centreX,
          bottom: "max(18px, env(safe-area-inset-bottom))",
          translate: "-50% 0",
          fontSize: 10.5,
          padding: "8px 14px",
          borderRadius: 999,
          background: "rgba(16, 16, 17, 0.55)",
          border: "1px solid rgba(244, 244, 242, 0.14)",
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
          onPlay={() => {
            if (!playing) trackEvent("studio_arc_played", { moments: moments.length });
            setPlaying((v) => !v);
          }}
          fine={fine}
          sync={sync}
          pieceState={pieceState}
          writingAfter={writingAfter}
          onWritingAfter={setWritingAfter}
          onPlaces={canPlaces ? startPlaces : undefined}
          signedIn={!!user}
          line={line}
          onLine={setLine}
        />
      )}

      {role && now > 0 && afterDue(role, now) && shown && !open && !prep && (
        <AfterCard
          name={role.name}
          ranAt={role.ranAt ?? now}
          now={now}
          wide={wide}
          onTell={() => {
            setTab("after");
            setWritingAfter(true);
            setOpen(true);
          }}
          onLater={() => editRole((r) => ({ ...r, afterDismissedAt: r.ranAt ?? Date.now() }))}
        />
      )}

      {gesture && role && shown && (
        <GesturePanel
          wide={wide}
          width={DRAWER}
          role={role}
          spec={gSpec}
          onSpec={changeGesture}
          size={gSize}
          onSize={setGSize}
          sculpt={gSculpt}
          onSculpt={setGSculpt}
          inward={!!gInward}
          onInward={takeInside}
          onKeep={() => editRole((r) => ({ ...r, gesture: gSpec }))}
          onCamera={() => setCamera(true)}
          onClose={closeGesture}
        />
      )}

      {gesture && camera && shown && (
        <GestureCamera
          wide={wide}
          onReading={(r: MotionReading) => move(r.point)}
          onKeepShape={(r: MotionReading) => {
            // Keep it small: 32 points a hand, millimetres are plenty.
            const paths = r.paths.map((pts) =>
              pts
                .filter((_, i) => i % 2 === 0)
                .map((v) => v.map((n) => Math.round(n * 1000) / 1000) as [number, number, number]),
            );
            setMine(paths);
            editRole((x) => ({ ...x, gestureTake: { at: Date.now(), point: r.point, paths } }));
          }}
          onClose={() => setCamera(false)}
        />
      )}

      {prep && role && shown && (
        <Prep
          wide={wide}
          width={DRAWER}
          role={role}
          piece={pieceState}
          signedIn={!!user}
          activeMoment={activeMoment}
          onEdit={editRole}
          onPoint={move}
          onLine={setLine}
          onGoTo={goTo}
          onActive={setActiveMoment}
          onPlaces={startPlaces}
          onRunIt={markRan}
          onClose={() => setPrep(false)}
        />
      )}

      {tour && <Tour onClose={() => setTour(false)} />}

      {places && role && (
        <Places
          role={role}
          lines={pieceState.lines}
          reducedMotion={reducedMotion}
          onPoint={move}
          onLine={setLine}
          onMoment={(i) => setActiveMoment(i === null ? null : (role.moments[i]?.id ?? null))}
          onGesture={(spec, ms) => setPlacesGesture(spec ? { spec, start: performance.now(), dur: ms } : null)}
          onClose={endPlaces}
        />
      )}

      <style>{`
        @keyframes prep-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes studio-in { from { opacity: 0; transform: translateY(6px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
        .studio-scroll { scrollbar-width: thin; scrollbar-color: rgba(244,244,242,0.18) transparent; }
        .studio-field { width: 100%; background: rgba(244,244,242,0.04); border: 1px solid rgba(244,244,242,0.12); border-radius: 10px; color: #f4f4f2; padding: 9px 11px; font-size: 14px; line-height: 1.45; outline: none; resize: none; transition: border-color 200ms, background 200ms; user-select: text; }
        .studio-field:focus { border-color: rgba(244,244,242,0.7); background: rgba(244,244,242,0.07); }
        .studio-field::placeholder { color: rgba(216,216,212,0.38); }
        .studio-bare { width: 100%; background: transparent; border: 0; outline: none; color: #f4f4f2; padding: 0; user-select: text; }
        .studio-bare::placeholder { color: rgba(216,216,212,0.38); }
      `}</style>
    </main>
  );
}

function AfterCard({
  name,
  ranAt,
  now,
  wide,
  onTell,
  onLater,
}: {
  name: string;
  ranAt: number;
  now: number;
  wide: boolean;
  onTell: () => void;
  onLater: () => void;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent("studio_after_asked", {});
  }, []);
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        zIndex: 4,
        top: wide ? 96 : 84,
        left: "50%",
        translate: "-50% 0",
        width: "min(calc(100vw - 32px), 420px)",
        padding: "14px 16px",
        borderRadius: 16,
        background: "rgba(16,16,17,0.82)",
        border: "1px solid rgba(244,244,242,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
        animation: `studio-in 600ms ${EASE}`,
      }}
    >
      <div style={{ ...display, fontSize: 20, lineHeight: 1.25 }}>How did it go?</div>
      <p style={{ fontSize: 13, color: "#cfcfcb", opacity: 0.75, marginTop: 4, lineHeight: 1.45 }}>
        You worked {name || "this role"} {when(ranAt, now)}. Two lines while it&apos;s fresh, and the next run starts
        from them.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={onTell}
          style={{
            fontSize: 12,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid #f4f4f2",
            background: "#f4f4f2",
            color: "#0b0b0c",
            cursor: "pointer",
          }}
        >
          Tell me
        </button>
        <button
          type="button"
          onClick={onLater}
          style={{
            fontSize: 12,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(244,244,242,0.2)",
            background: "transparent",
            color: "#cfcfcb",
            cursor: "pointer",
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/** A top-bar action: a word, and on a wide screen a few words on what it's for. */
function TopAction({
  label,
  sub,
  wide,
  primary = false,
  pressed,
  round = false,
  title,
  onClick,
}: {
  label: string;
  sub?: string;
  wide: boolean;
  primary?: boolean;
  pressed?: boolean;
  round?: boolean;
  title?: string;
  onClick: () => void;
}) {
  const on = primary || pressed;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? sub}
      aria-pressed={pressed}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        minWidth: round ? 30 : undefined,
        padding: wide && sub ? "7px 14px 6px" : round ? "6px 0" : "6px 11px",
        borderRadius: 999,
        background: on ? "#f4f4f2" : "rgba(16,16,17,0.5)",
        border: `1px solid ${on ? "#f4f4f2" : "rgba(244,244,242,0.22)"}`,
        color: on ? "#0b0b0c" : "#f4f4f2",
        cursor: "pointer",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span className="uppercase tracking-[0.16em]" style={{ fontSize: wide ? 11 : 10, lineHeight: 1.1 }}>
        {label}
      </span>
      {wide && sub && <span style={{ fontSize: 9.5, opacity: 0.6, lineHeight: 1.1 }}>{sub}</span>}
    </button>
  );
}
