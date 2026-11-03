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
type End = { kind: "end"; seconds: number; brand: string; line: string; action: string; icon?: string };
export type ReelBeat = Title | Broll | Screen | End;
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
  const scale = interpolate(f, [0, durationInFrames], [1.04, 1.12]); // slow push, never static
  const pos = b.at ?? "center";
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo src={staticFile(b.src)} startFrom={Math.round((b.start ?? 0) * RFPS)} muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,${(b.dim ?? 0.35) * 0.6}) 0%, rgba(0,0,0,${b.dim ?? 0.35}) 55%, rgba(0,0,0,${(b.dim ?? 0.35) * 1.3}) 100%)` }} />
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
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 2, fps, config: { damping: 12, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ background: C.paper, justifyContent: "center", alignItems: "center", paddingBottom: 340 }}>
      <Img src={staticFile(b.icon ?? "icon.png")} style={{ width: 230, height: 230, borderRadius: 52, transform: `scale(${pop})`, boxShadow: "0 30px 70px rgba(30,15,5,0.25)" }} />
      <div style={{ marginTop: 56 }}><Words text={b.brand} color={C.ink} accentC={C.orange} size={112} at={8} /></div>
      <div style={{ marginTop: 18 }}><Words text={b.line} color={C.ink} accentC={C.orange} size={52} at={16} /></div>
      <div style={{
        marginTop: 60, padding: "26px 54px", borderRadius: 60, background: C.ink, color: C.cream, fontFamily: F.sans, fontWeight: 600,
        fontSize: 40, opacity: prog(f, 24, 36), transform: `translateY(${(1 - prog(f, 24, 36)) * 30}px)`,
      }}>{b.action}</div>
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
      {spec.beats.map((b, i) => {
        const len = Math.round(b.seconds * RFPS);
        const from = starts[i];
        // Push: the next beat slides up over the last one; the outgoing beat stays rendered under it.
        const inP = i === 0 || cut !== "push" ? 1 : prog(frame, from, from + P);
        const y = (1 - inP) * 1920;
        return (
          <Sequence key={i} from={from} durationInFrames={len + (i < spec.beats.length - 1 && cut === "push" ? P : 0)}>
            <AbsoluteFill style={{ transform: `translateY(${y}px)` }}>
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
