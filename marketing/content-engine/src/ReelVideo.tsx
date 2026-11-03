import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { loadFont } from "@remotion/fonts";

// A reel is a list of beats. Mix them freely: that is what keeps the feed from looking
// like one template. Every path is relative to public/ (the daily run copies recordings
// and stock clips into public/reel/<id>/).
//
//   title   big type on a plain field, Apple keynote style
//   broll   real stock footage (Pexels) with type over it
//   screen  a real recording of the app in a phone, zooming in on each tap
//   end     the brand card
export const RFPS = 30;

type Bg = "paper" | "ink" | "orange";
type Title = { kind: "title"; seconds: number; text: string; accent?: string; sub?: string; bg?: Bg; size?: number };
type Broll = {
  kind: "broll";
  seconds: number;
  src: string;
  start?: number; // seconds into the clip
  text?: string;
  accent?: string;
  sub?: string;
  at?: "top" | "center" | "lower"; // where the type sits
  dim?: number; // 0..1 darkening for legibility
  credit?: string; // Pexels author, kept in the spec for attribution
  sound?: number; // keep the footage's own audio at this volume (real room sound), default muted
  /** Several lines over ONE unbroken shot (no cuts): each fades in at `at` and out at `until` (seconds into the beat). */
  lines?: { text: string; accent?: string; at: number; until?: number; size?: number }[];
  push?: number; // how much the camera creeps in over the shot, default 0.06 (0 = locked off)
};
type TapEv = { t: number; tap?: { x: number; y: number }; typing?: string; mark?: string };
type Screen = {
  kind: "screen";
  seconds: number;
  src: string;
  start?: number; // seconds into the recording
  events?: TapEv[]; // copied from <flow>.events.json
  caption?: string;
  accent?: string;
  bg?: Bg;
  zoom?: number; // how far to push in on a tap, default 1.55
  audio?: { src: string; at: number; volume?: number }[]; // the scene partner reading, timed in recording seconds
};
/** The close. Fades in slowly over the last shot (no slide), the icon settles, the words arrive one
 * after another, then the App Store line. `bg` ink (default for cinematic films) is a dark stage with
 * the warm glow of a ghost light; paper is the light house style. `store` shows the App Store badge
 * style button (use it for Ghost Light), otherwise `action` is plain text like actorrise.com. */
type End = { kind: "end"; seconds: number; brand: string; line: string; action: string; icon?: string; bg?: "ink" | "paper"; store?: boolean };
/** Sound effects on a beat, from public/sfx/cine: impact, reveal, note, switch, tick, heartbeat, room, riser.
 * `at` is seconds into the beat (negative starts before the cut, e.g. a riser at -1.5). Few and heavy. */
export type Cue = { name: string; at?: number; vol?: number };
export type ReelBeat = (Title | Broll | Screen | End) & { sfx?: Cue[] };
export type ReelSpec = {
  id: string;
  beats: ReelBeat[];
  music?: { style: string; volume?: number };
  cut?: "hard" | "flash" | "push"; // how beats change, default push (a fast slide, no fades)
};
export const reelFrames = (s: ReelSpec) => s.beats.reduce((n, b) => n + Math.round(b.seconds * RFPS), 0);

const C = { paper: "#f2ece0", ink: "#15110e", orange: "#e8792b", cream: "#fbf7f0" };
const F = { serif: "Playfair", serifI: "PlayfairItalic", sans: "Montserrat" };
loadFont({ family: F.serif, url: staticFile("fonts/playfair.woff2"), weight: "600" });
loadFont({ family: F.serifI, url: staticFile("fonts/playfair-italic.woff2"), weight: "400", style: "italic" });
loadFont({ family: F.sans, url: staticFile("fonts/montserrat.woff2"), weight: "600" });

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const prog = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
const bgColor = (b?: Bg) => (b === "ink" ? C.ink : b === "orange" ? C.orange : C.paper);
const fgColor = (b?: Bg) => (b === "ink" || b === "orange" ? C.cream : C.ink);
const accentColor = (b?: Bg) => (b === "orange" ? C.ink : C.orange);

/** Words rise in one by one; the accent word is orange italic. */
const Words: React.FC<{ text: string; accent?: string; color: string; accentC: string; size: number; at?: number; align?: "center" | "left" }> = ({
  text, accent, color, accentC, size, at = 0, align = "center",
}) => {
  const f = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: size, lineHeight: 1.05, color, textAlign: align, letterSpacing: -1 }}>
      {words.map((w, i) => {
        const p = prog(f, at + i * 3, at + i * 3 + 12);
        const isAccent = accent && w.replace(/[.,!?]/g, "") === accent.replace(/[.,!?]/g, "");
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 40}px)`, marginRight: size * 0.22 }}>
            {isAccent ? <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: accentC }}>{w}</span> : w}
          </span>
        );
      })}
    </div>
  );
};

const Sub: React.FC<{ text: string; color: string; at: number }> = ({ text, color, at }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, at + 14);
  return (
    <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 38, letterSpacing: 1, color, opacity: 0.75 * p, marginTop: 34, textAlign: "center" }}>
      {text}
    </div>
  );
};

const TitleBeat: React.FC<{ b: Title }> = ({ b }) => (
  <AbsoluteFill style={{ background: bgColor(b.bg), justifyContent: "center", alignItems: "center", padding: "0 90px 380px" }}>
    <Words text={b.text} accent={b.accent} color={fgColor(b.bg)} accentC={accentColor(b.bg)} size={b.size ?? 120} />
    {b.sub && <Sub text={b.sub} color={fgColor(b.bg)} at={10 + b.text.split(" ").length * 3} />}
  </AbsoluteFill>
);

const BrollBeat: React.FC<{ b: Broll }> = ({ b }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(f, [0, durationInFrames], [1.02, 1.02 + (b.push ?? 0.06)]); // a slow creep, like a camera on a dolly
  const pos = b.at ?? "center";
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo src={staticFile(b.src)} startFrom={Math.round((b.start ?? 0) * RFPS)} muted={!b.sound}
          volume={b.sound ?? 0} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,${(b.dim ?? 0.35) * 0.6}) 0%, rgba(0,0,0,${b.dim ?? 0.35}) 55%, rgba(0,0,0,${(b.dim ?? 0.35) * 1.3}) 100%)` }} />
      {(b.lines ?? []).map((l, i) => {
        const a0 = Math.round(l.at * RFPS);
        const a1 = l.until !== undefined ? Math.round(l.until * RFPS) : durationInFrames + 30;
        if (f < a0 - 1 || f > a1 + 12) return null;
        const out = interpolate(f, [a1, a1 + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <AbsoluteFill key={i} style={{
            opacity: out, justifyContent: pos === "top" ? "flex-start" : pos === "lower" ? "flex-end" : "center",
            alignItems: "center", padding: pos === "top" ? "260px 80px 0" : pos === "lower" ? "0 80px 560px" : "0 80px 300px",
          }}>
            <Words text={l.text} accent={l.accent} color={C.cream} accentC={C.orange} size={l.size ?? 96} at={a0} />
          </AbsoluteFill>
        );
      })}
      {b.text && (
        <AbsoluteFill style={{
          justifyContent: pos === "top" ? "flex-start" : pos === "lower" ? "flex-end" : "center",
          alignItems: "center", padding: pos === "top" ? "260px 80px 0" : pos === "lower" ? "0 80px 560px" : "0 80px 300px",
        }}>
          <Words text={b.text} accent={b.accent} color={C.cream} accentC={C.orange} size={104} at={6} />
          {b.sub && <Sub text={b.sub} color={C.cream} at={14 + b.text.split(" ").length * 3} />}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const PHONE_W = 760;
const PHONE_H = Math.round((PHONE_W * 2338) / 1080);

const ScreenBeat: React.FC<{ b: Screen }> = ({ b }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = b.start ?? 0;
  const t = start + f / fps; // recording time
  const taps = (b.events ?? []).filter((e) => e.tap && e.t >= start - 0.2 && e.t <= start + b.seconds);
  // Zoom toward the latest tap, ease back out 1.4s later.
  let z = 1, cx = 0.5, cy = 0.5;
  for (const e of taps) {
    const local = (e.t - start) * fps;
    const inP = spring({ frame: f - (local - 8), fps, config: { damping: 200 }, durationInFrames: 16 });
    const outP = spring({ frame: f - (local + 42), fps, config: { damping: 200 }, durationInFrames: 18 });
    const k = Math.max(0, inP - outP);
    if (k > 0.001) { z = 1 + ((b.zoom ?? 1.55) - 1) * k; cx = e.tap!.x; cy = e.tap!.y; }
  }
  const intro = spring({ frame: f, fps, config: { damping: 18, mass: 0.7 } });
  const tx = (0.5 - cx) * PHONE_W * (z - 1);
  const ty = (0.5 - cy) * PHONE_H * (z - 1);
  return (
    <AbsoluteFill style={{ background: bgColor(b.bg ?? "paper") }}>
      {b.caption && (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", padding: "150px 90px 0" }}>
          <Words text={b.caption} accent={b.accent} color={fgColor(b.bg ?? "paper")} accentC={accentColor(b.bg ?? "paper")} size={78} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingTop: b.caption ? 300 : 0 }}>
        <div style={{
          transform: `translate(${tx}px, ${ty + (1 - intro) * 260}px) scale(${z * (b.caption ? 0.86 : 0.98)})`,
          width: PHONE_W, height: PHONE_H, borderRadius: 96, padding: 18, background: "#0d0b0a",
          boxShadow: "0 50px 120px rgba(20,12,6,0.35), 0 0 0 3px #2a2522",
        }}>
          <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 80, overflow: "hidden", background: "#fff" }}>
            <OffthreadVideo src={staticFile(b.src)} startFrom={Math.round(start * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {taps.map((e, i) => {
              const local = (e.t - start) * fps;
              const p = interpolate(f, [local, local + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              if (f < local || p >= 1) return null;
              return (
                <div key={i} style={{
                  position: "absolute", left: `${e.tap!.x * 100}%`, top: `${e.tap!.y * 100}%`, width: 120, height: 120,
                  marginLeft: -60, marginTop: -60, borderRadius: 60, border: `8px solid ${C.orange}`,
                  transform: `scale(${0.3 + p})`, opacity: 1 - p,
                }} />
              );
            })}
            <div style={{ position: "absolute", top: 18, left: "50%", marginLeft: -70, width: 140, height: 40, borderRadius: 20, background: "#0d0b0a" }} />
          </div>
        </div>
      </AbsoluteFill>
      {(b.audio ?? []).map((a, i) => {
        const at = Math.round((a.at - start) * fps);
        if (at < 0 || a.at > start + b.seconds) return null;
        return <Sequence key={i} from={at} layout="none"><Audio src={staticFile(a.src)} volume={a.volume ?? 1} /></Sequence>;
      })}
    </AbsoluteFill>
  );
};

const EndBeat: React.FC<{ b: End }> = ({ b }) => {
  const f = useCurrentFrame();
  const dark = (b.bg ?? "ink") === "ink";
  const fg = dark ? C.cream : C.ink;
  const slow = (a: number, d: number) => interpolate(f, [a, a + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  const icon = slow(6, 26);
  const glow = slow(0, 40) * (0.9 + 0.1 * Math.sin(f / 14));
  const fade = (a: number, d = 22): React.CSSProperties => ({ opacity: slow(a, d), transform: `translateY(${(1 - slow(a, d)) * 18}px)`, filter: `blur(${(1 - slow(a, d)) * 6}px)` });
  return (
    <AbsoluteFill style={{ background: dark ? C.ink : C.paper, justifyContent: "center", alignItems: "center", paddingBottom: 300 }}>
      {dark && <AbsoluteFill style={{ background: `radial-gradient(ellipse 55% 34% at 50% 36%, rgba(232,121,43,${0.28 * glow}) 0%, rgba(232,121,43,0) 72%)` }} />}
      <Img src={staticFile(b.icon ?? "icon.png")} style={{
        width: 220, height: 220, borderRadius: 50, opacity: icon, transform: `scale(${0.94 + 0.06 * icon})`,
        boxShadow: dark ? `0 0 ${90 * icon}px rgba(232,121,43,${0.35 * icon})` : "0 30px 70px rgba(30,15,5,0.22)",
      }} />
      <div style={{ marginTop: 54, fontFamily: F.serif, fontWeight: 600, fontSize: 108, color: fg, letterSpacing: -1, ...fade(24) }}>{b.brand}</div>
      <div style={{ marginTop: 12, fontFamily: F.serifI, fontStyle: "italic", fontSize: 50, color: dark ? "rgba(251,247,240,0.72)" : "rgba(21,17,14,0.7)", ...fade(38) }}>{b.line}</div>
      <div style={{ marginTop: 58, ...fade(54, 20) }}>
        {b.store ? (
          <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 46px", borderRadius: 22, background: dark ? C.cream : C.ink, color: dark ? C.ink : C.cream }}>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
              <span style={{ fontFamily: F.sans, fontSize: 22, letterSpacing: 1, opacity: 0.75 }}>FREE ON THE</span>
              <span style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 44 }}>App Store</span>
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 42, letterSpacing: 1, color: fg }}>{b.action}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const ReelVideo: React.FC<{ spec: ReelSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const starts: number[] = [];
  let acc = 0;
  for (const b of spec.beats) { starts.push(acc); acc += Math.round(b.seconds * RFPS); }
  const cut = spec.cut ?? "push";
  const P = 7; // frames for a push
  return (
    <AbsoluteFill style={{ background: C.ink, overflow: "hidden" }}>
      {spec.music && <Audio src={staticFile(`music/${spec.id}.wav`)} volume={spec.music.volume ?? 0.5} />}
      {spec.beats.flatMap((b, i) => {
        // The end card always lands with the reveal hit unless the beat sets its own sounds.
        const cues = b.sfx ?? (b.kind === "end" ? [{ name: "reveal", at: 0, vol: 0.9 }] : []);
        return cues.map((c, k) => {
          const at = starts[i] + Math.round((c.at ?? 0) * RFPS);
          return (
            <Sequence key={`sfx${i}-${k}`} from={Math.max(0, at)} layout="none">
              <Audio src={staticFile(`sfx/cine/${c.name}.wav`)} volume={c.vol ?? 0.9} startFrom={at < 0 ? -at : 0} />
            </Sequence>
          );
        });
      })}
      {spec.beats.map((b, i) => {
        const len = Math.round(b.seconds * RFPS);
        const from = starts[i];
        // Push: the next beat slides up over the last one; the outgoing beat stays rendered under it.
        const isEnd = b.kind === "end";
        const inP = i === 0 || cut !== "push" || isEnd ? 1 : prog(frame, from, from + P);
        const y = (1 - inP) * 1920;
        const D = 24; // the end card dissolves over the last shot, slowly
        const op = isEnd && i > 0 ? interpolate(frame, [from, from + D], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
        return (
          <Sequence key={i} from={from} durationInFrames={len + (i < spec.beats.length - 1 ? (spec.beats[i + 1].kind === "end" ? 24 : cut === "push" ? P : 0) : 0)}>
            <AbsoluteFill style={{ transform: `translateY(${y}px)`, opacity: op }}>
              {b.kind === "title" ? <TitleBeat b={b} /> : b.kind === "broll" ? <BrollBeat b={b} /> : b.kind === "screen" ? <ScreenBeat b={b} /> : <EndBeat b={b} />}
            </AbsoluteFill>
            {cut === "flash" && i > 0 && (
              <AbsoluteFill style={{ background: "#fff", opacity: interpolate(frame - from, [0, 4], [0.9, 0], { extrapolateRight: "clamp" }) }} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
