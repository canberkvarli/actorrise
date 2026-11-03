import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { evolvePath } from "@remotion/paths";
import { loadFont } from "@remotion/fonts";

export const FPS = 30;
const T = 22; // frames per camera move
// The first scene starts this many frames in, so frame 0 (the feed thumbnail and the
// first thing a scroller sees) already shows drawing instead of empty paper.
const PREROLL = 62;

// Anthropic-style warm paper + ink, Ghost Light orange as the only accent.
const C_PAPER = {
  paper: "#f2ece0",
  ink: "#211a15",
  inkSoft: "rgba(33,26,21,0.55)",
  orange: "#e8792b",
  stage: "#120b07",
  stageInk: "#efe6d8",
};
// The palette is mutable so a spec's look can restyle the whole sheet (set in StoryVideo).
const C = { ...C_PAPER };
/** Drawn looks. paper: warm paper, serif, orange italic key word. marker: off white, black sans,
 * a yellow highlighter swipe behind the key word (same idea as the reel's marker look). */
export type StoryLook = "paper" | "marker";
const HL = "#ffe15a";
let LOOK: StoryLook = "paper";
const F_PAPER = { serif: "Playfair", serifI: "PlayfairItalic", type: "CourierPrime", sans: "Montserrat" };
const F = { ...F_PAPER };
const applyLook = (look: StoryLook) => {
  LOOK = look;
  Object.assign(C, C_PAPER, look === "marker" ? { paper: "#f7f5f0", ink: "#141414", inkSoft: "rgba(20,20,20,0.55)" } : {});
  Object.assign(F, F_PAPER, look === "marker" ? { serif: "Montserrat", serifI: "Montserrat" } : {});
};
loadFont({ family: F.serif, url: staticFile("fonts/playfair.woff2"), weight: "600" });
loadFont({ family: F.serifI, url: staticFile("fonts/playfair-italic.woff2"), weight: "400", style: "italic" });
// House font everywhere (Canberk, 2026-11-04): the typewriter and sans families both load Playfair now.
loadFont({ family: F.type, url: staticFile("fonts/playfair-italic.woff2"), weight: "400", style: "italic" });
loadFont({ family: F.sans, url: staticFile("fonts/playfair.woff2"), weight: "600" });

// ---------- spec ----------
type Night = { type: "night"; seconds: number; time: string; cue: string };
type Books = { type: "books"; seconds: number; line1: string; line2: string; accent: string };
type Phone = {
  type: "phone";
  seconds: number;
  mode?: "search" | "read";
  line: string;
  accent: string;
  cue?: string;
  query?: string;
  chips?: string[];
  resultsCue?: string;
  results?: { character: string; source: string; meta: string; quote: string }[];
  read?: { tag: string; title: string; titleItalic: string; meta: string; text: string; mark?: number; note?: string };
  /** optional tap: local frame and screen point in video pixels */
  tap?: { at: number; x: number; y: number };
};
type Stage = { type: "stage"; seconds: number; time: string; cue: string; quote: string; accent: string };
type End = { type: "end"; seconds: number; brand: string; tagline: string; action: string; kicker?: string };
/** An email lands: card draws on, header rows appear, the body types in, one phrase gets underlined. */
type Email = {
  type: "email";
  seconds: number;
  line: string;
  accent: string;
  from: string;
  subject: string;
  body: string; // lines split by \n
  mark?: string; // phrase in the body to underline in orange
  cue?: string;
};
/** A waiting room full of identical Juliets, all holding the same page, all mouthing the same line. */
type Lobby = { type: "lobby"; seconds: number; line: string; accent: string; cue?: string; page: string; bubble: string; sign?: string; count?: number };
/** The panel from the actor's side: three tired faces, then one line lands and they wake up. */
type Panel = { type: "panel"; seconds: number; line: string; accent: string; cue?: string; quote: string; wakeAt?: number };
export type StoryScene = Night | Books | Thinking | Email | Phone | Notify | Stage | Lobby | Panel | End;
/** Music bed made by scripts/make_music.py into public/music/<id>.wav (render.sh runs it). */
export type StoryMusic = { style: "sunny" | "pizzicato" | "build" | "festive"; drop?: string | number; volume?: number; seed?: string };
/** Narration (scripts/voice.py fills audio + words); `at` is seconds from the start of the video. */
export type StoryVoice = { lines: { text: string; at: number; audio?: string; dur?: number }[]; volume?: number };
export type StorySpec = { id: string; scenes: StoryScene[]; music?: StoryMusic; look?: StoryLook; voice?: StoryVoice };
export const storyFrames = (s: StorySpec) =>
  s.scenes.reduce((n, sc) => n + Math.round(sc.seconds * FPS), 0);

// ---------- primitives ----------
const ease = Easing.bezier(0.33, 0, 0.2, 1);
const prog = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

const SilentCtx = React.createContext(false);
/** A sound cue at a local frame. Skipped inside frozen pre-roll copies. */
const Sfx: React.FC<{ name: string; at: number; vol?: number; frames?: number }> = ({ name, at, vol = 1, frames }) => {
  const silent = React.useContext(SilentCtx);
  if (silent) return null;
  return (
    <Sequence from={at} durationInFrames={frames} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol} />
    </Sequence>
  );
};
const typeFrames = (text: string) => Math.ceil(text.length * 1.3) + 2;

/** An ink line that draws itself on. */
const Ink: React.FC<{
  d: string;
  start: number;
  dur?: number;
  color?: string;
  w?: number;
  fill?: string;
}> = ({ d, start, dur = 18, color = C.ink, w = 6, fill }) => {
  const f = useCurrentFrame();
  const p = prog(f, start, start + dur);
  if (p <= 0) return null;
  const { strokeDasharray, strokeDashoffset } = evolvePath(p, d);
  return (
    <>
      {fill && <path d={d} fill={fill} opacity={prog(f, start + dur * 0.6, start + dur + 6)} />}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
      />
    </>
  );
};

const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  at,
  children,
  style,
}) => {
  const f = useCurrentFrame();
  const p = prog(f, at, at + 16);
  return (
    <div style={{ position: "relative", opacity: p, transform: `translateY(${(1 - p) * 24}px)`, ...style }}>
      {children}
    </div>
  );
};

/** Headline where one word is orange italic, like the app's own type. */
const Headline: React.FC<{ text: string; accent: string; color: string; size?: number }> = ({
  text,
  accent,
  color,
  size = 112,
}) => {
  const i = text.indexOf(accent);
  const before = i >= 0 ? text.slice(0, i) : text;
  const after = i >= 0 ? text.slice(i + accent.length) : "";
  return (
    <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: size, lineHeight: 1.06, color, textAlign: "center" }}>
      {before}
      {i >= 0 && LOOK === "marker" && (
        <span style={{ position: "relative", display: "inline-block", color: C.ink, padding: "0 0.08em" }}>
          <span style={{ position: "absolute", left: "-0.04em", right: "-0.04em", top: "0.22em", bottom: "0.06em", background: HL, transform: "rotate(-1.6deg) skewX(-8deg)", borderRadius: 6, zIndex: 0 }} />
          <span style={{ position: "relative" }}>{accent}</span>
        </span>
      )}
      {i >= 0 && LOOK !== "marker" && (
        <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>{accent}</span>
      )}
      {after}
    </div>
  );
};

const Cue: React.FC<{ text: string; color: string; at?: number }> = ({ text, color, at = 0 }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor((f - at) / 1.3));
  return (
    <div style={{ position: "relative", fontFamily: F.type, fontStyle: "italic", fontSize: 46, color, minHeight: 60, textAlign: "center" }}>
      {text.slice(0, n)}
    </div>
  );
};

const Paper: React.FC = () => (
  <AbsoluteFill
    style={{
      background: LOOK === "marker"
        ? `radial-gradient(ellipse 90% 70% at 50% 40%, #fbfaf6 0%, ${C.paper} 65%, #ecebe6 100%)`
        : `radial-gradient(ellipse 90% 70% at 50% 40%, #f7f2e8 0%, ${C.paper} 60%, #e9e1d2 100%)`,
    }}
  />
);

const Glow: React.FC<{ glow?: number; y?: string }> = ({ glow = 1, y = "55%" }) => {
  const f = useCurrentFrame();
  const b = 0.85 + 0.15 * Math.sin(f / 20);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 38% at 50% ${y}, rgba(232,121,43,${0.22 * glow * b}) 0%, rgba(232,121,43,0) 70%)`,
      }}
    />
  );
};

// ---------- scenes ----------
const PAPER_FILL = "#f8f4ec";

const NightScene: React.FC<{ s: Night }> = ({ s }) => {
  const f = useCurrentFrame();
  const minute = interpolate(f, [10, 140], [200, 560], { extrapolateRight: "clamp" });
  const hour = minute / 12 + 330;
  return (
    <AbsoluteFill>
      <Sfx name="boop_lo" at={50} vol={0.7} />
      <Sfx name="typing" at={66} frames={typeFrames(s.cue)} vol={0.6} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d="M250 300 C 248 420, 252 640, 250 760 L 830 762 C 832 640, 828 420, 830 300 Z" start={0} dur={26} />
        <Ink d="M540 302 C 541 450, 539 610, 540 760" start={14} dur={14} w={5} />
        <Ink d="M252 530 C 400 528, 680 532, 828 530" start={20} dur={14} w={5} />
        <Ink
          d="M700 360 C 650 360, 615 400, 615 445 C 615 490, 650 525, 700 525 C 672 505, 655 478, 655 445 C 655 410, 672 382, 700 360 Z"
          start={28}
          dur={18}
          fill={C.orange}
          color={C.orange}
          w={4}
        />
        <Ink d="M340 380 l 0 30 M325 395 l 30 0" start={36} dur={8} w={4} />
        <Ink d="M420 620 l 0 22 M409 631 l 22 0" start={40} dur={8} w={4} />
        <Ink d="M540 980 m -130 0 a 130 130 0 1 0 260 0 a 130 130 0 1 0 -260 0" start={30} dur={22} />
        <g opacity={prog(f, 44, 52)}>
          <line x1={540} y1={980} x2={540 + 70 * Math.sin((hour * Math.PI) / 180)} y2={980 - 70 * Math.cos((hour * Math.PI) / 180)} stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
          <line x1={540} y1={980} x2={540 + 105 * Math.sin((minute * Math.PI) / 180)} y2={980 - 105 * Math.cos((minute * Math.PI) / 180)} stroke={C.orange} strokeWidth={6} strokeLinecap="round" />
          <circle cx={540} cy={980} r={9} fill={C.ink} />
        </g>
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: 560 }}>
        <Rise at={50}>
          <Headline text={s.time} accent="" color={C.ink} size={150} />
        </Rise>
        <div style={{ height: 20 }} />
        <Cue text={s.cue} color={C.orange} at={66} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const BooksScene: React.FC<{ s: Books }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: f - 46, fps, config: { damping: 14, mass: 0.8 } });
  const bx = interpolate(t, [0, 1], [300, 810]);
  const by = 1000 - Math.sin(t * Math.PI) * 260 + t * 120;
  const books = [
    { y: 1080, x: 330, w: 420, r: -2 },
    { y: 1000, x: 360, w: 380, r: 3 },
    { y: 920, x: 320, w: 400, r: -4 },
    { y: 840, x: 370, w: 350, r: 2 },
    { y: 760, x: 345, w: 370, r: -1 },
  ];
  return (
    <AbsoluteFill>
      <Sfx name="boop_lo" at={18} vol={0.7} />
      <Sfx name="boop_hi" at={36} vol={0.7} />
      <Sfx name="toss" at={44} vol={0.8} />
      <Sfx name="thud" at={62} vol={0.6} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {books.map((b, i) => {
          const d = `M${b.x} ${b.y} C ${b.x + b.w * 0.3} ${b.y - 2}, ${b.x + b.w * 0.7} ${b.y + 2}, ${b.x + b.w} ${b.y} L ${b.x + b.w + 2} ${b.y + 70} C ${b.x + b.w * 0.6} ${b.y + 72}, ${b.x + b.w * 0.3} ${b.y + 68}, ${b.x - 2} ${b.y + 70} Z`;
          const spine = `M${b.x + 40} ${b.y + 8} C ${b.x + 41} ${b.y + 30}, ${b.x + 39} ${b.y + 45}, ${b.x + 40} ${b.y + 62}`;
          return (
            <g key={i} transform={`rotate(${b.r} ${b.x + b.w / 2} ${b.y + 35})`}>
              <Ink d={d} start={i * 6} dur={16} fill={i === 2 ? "rgba(232,121,43,0.25)" : "rgba(33,26,21,0.04)"} />
              <Ink d={spine} start={i * 6 + 10} dur={8} w={4} />
            </g>
          );
        })}
        <Ink d="M140 1158 C 400 1150, 700 1164, 940 1156" start={4} dur={20} w={4} color={C.inkSoft} />
        <g opacity={f > 46 ? 1 : 0} transform={`translate(${bx} ${by}) rotate(${t * 380})`}>
          <path d="M-34 -10 L -20 -34 L 8 -30 L 30 -18 L 36 8 L 18 32 L -10 34 L -32 18 Z M -20 -34 L 0 -4 L 30 -18 M 0 -4 L -10 34 M 0 -4 L -32 18" fill="#fbf8f1" stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
        </g>
      </svg>
      <AbsoluteFill style={{ paddingTop: 300, alignItems: "center" }}>
        <Rise at={18}>
          <Headline text={s.line1} accent="" color={C.ink} size={120} />
        </Rise>
        <Rise at={36}>
          <Headline text={s.line2} accent={s.accent} color={C.ink} size={120} />
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * A left hand holding the phone from below. Slim thumb crossing the lower
 * left edge, palm out of frame, four small fingertips curling over the right edge.
 * Phone spans x 220..860 with its top at y 755.
 */
const HoldingHand: React.FC<{ start: number }> = ({ start }) => {
  const hand =
    "M60 1920 C 90 1820, 150 1730, 215 1660 C 250 1610, 268 1540, 290 1470 C 306 1420, 322 1376, 344 1352 C 362 1332, 392 1336, 398 1362 C 404 1388, 388 1420, 376 1450 C 360 1492, 350 1540, 352 1590 C 354 1640, 372 1690, 400 1740 C 430 1800, 470 1860, 500 1920 Z";
  const nail = "M352 1372 C 362 1356, 384 1356, 388 1376 C 390 1392, 380 1404, 368 1408";
  const joint = "M300 1600 C 318 1610, 336 1626, 346 1644";
  const palm = "M200 1830 C 250 1800, 300 1790, 350 1795";
  const tips = [1180, 1275, 1370, 1462];
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, transform: "translateY(270px)" }}>
      {tips.map((y, i) => {
        const x = 858;
        const w = i === 3 ? 40 : 48;
        const h = i === 3 ? 62 : 72;
        const d = `M${x} ${y} C ${x + w * 0.7} ${y - 2}, ${x + w} ${y + h * 0.22}, ${x + w} ${y + h * 0.5} C ${x + w} ${y + h * 0.8}, ${x + w * 0.7} ${y + h}, ${x} ${y + h} Z`;
        return <Ink key={i} d={d} start={start + 8 + i * 3} dur={10} fill={PAPER_FILL} w={5} />;
      })}
      <Ink d={hand} start={start} dur={22} fill={PAPER_FILL} w={6} />
      <Ink d={nail} start={start + 16} dur={8} w={4} color={C.inkSoft} />
      <Ink d={joint} start={start + 18} dur={6} w={4} color={C.inkSoft} />
      <Ink d={palm} start={start + 20} dur={8} w={4} color={C.inkSoft} />
    </svg>
  );
};

/** A right index finger that reaches in from the lower right and taps. */
const TapFinger: React.FC<{ at: number; x: number; y: number }> = ({ at, x, y }) => {
  const f = useCurrentFrame();
  if (f < at) return null;
  const inP = prog(f, at, at + 12);
  const press = interpolate(f, [at + 12, at + 16, at + 22], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outP = prog(f, at + 30, at + 44);
  const away = (1 - inP) + outP;
  // finger direction (toward the wrist) and its normal
  const dx = 0.387, dy = 0.922, nx = 0.922, ny = -0.387;
  const P = (cx: number, cy: number, along: number, side: number) =>
    `${(cx + dx * along + nx * side).toFixed(1)} ${(cy + dy * along + ny * side).toFixed(1)}`;
  const tx = x, ty = y + 8;
  const d = [
    `M${P(tx, ty, 0, -34)}`,
    `C ${P(tx, ty, -46, -34)}, ${P(tx, ty, -46, 34)}, ${P(tx, ty, 0, 34)}`,
    `L ${P(tx, ty, 380, 38)}`,
    `C ${P(tx, ty, 400, 110)}, ${P(tx, ty, 470, 170)}, ${P(tx, ty, 540, 160)}`,
    `L ${P(tx, ty, 900, 260)}`,
    `L ${P(tx, ty, 900, -60)}`,
    `L ${P(tx, ty, 420, -40)}`,
    "Z",
  ].join(" ");
  const nail = `M${P(tx, ty, 10, -20)} C ${P(tx, ty, -18, -18)}, ${P(tx, ty, -18, 18)}, ${P(tx, ty, 10, 20)}`;
  const crease1 = `M${P(tx, ty, 150, -30)} C ${P(tx, ty, 156, -10)}, ${P(tx, ty, 156, 10)}, ${P(tx, ty, 150, 30)}`;
  const crease2 = `M${P(tx, ty, 300, -32)} C ${P(tx, ty, 306, -10)}, ${P(tx, ty, 306, 12)}, ${P(tx, ty, 300, 34)}`;
  const curled = `M${P(tx, ty, 400, 60)} C ${P(tx, ty, 420, 120)}, ${P(tx, ty, 470, 150)}, ${P(tx, ty, 520, 150)}`;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 70,
          top: y - 70,
          width: 140,
          height: 140,
          borderRadius: "50%",
          border: `4px solid ${C.orange}`,
          opacity: press > 0 || f > at + 16 ? 1 - prog(f, at + 14, at + 30) : 0,
          transform: `scale(${0.4 + prog(f, at + 14, at + 30)})`,
        }}
      />
      <svg
        viewBox="0 0 1080 1920"
        style={{ position: "absolute", inset: 0, transform: `translate(${away * 380}px, ${away * 700 - press * 10}px)` }}
      >
        <path d={d} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        <path d={nail} fill="none" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
        <path d={crease1} fill="none" stroke={C.inkSoft} strokeWidth={3} strokeLinecap="round" />
        <path d={crease2} fill="none" stroke={C.inkSoft} strokeWidth={3} strokeLinecap="round" />
        <path d={curled} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      </svg>
    </>
  );
};

// ---------- the thinking actor at the pin board (original character) ----------
const SKIN = "#a8704c";
const CORK = "#ecd9b8";

const Headshot: React.FC<{ x: number; y: number; at: number; tilt: number; hair?: boolean }> = ({ x, y, at, tilt, hair }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 12, mass: 0.6 } });
  if (f < at) return null;
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${0.6 + 0.4 * s})`} opacity={Math.min(1, s * 1.4)}>
      <rect x={-75} y={-95} width={150} height={190} fill="#fbf8f1" stroke={C.ink} strokeWidth={5} />
      <circle cx={0} cy={-25} r={32} fill={hair ? "#d8a27a" : "#c08a64"} stroke={C.ink} strokeWidth={4} />
      {hair && <path d="M-32 -30 C -34 -66, 34 -66, 32 -30 C 20 -46, -20 -46, -32 -30 Z" fill={C.ink} />}
      <path d="M-55 85 C -50 35, 50 35, 55 85" fill="rgba(33,26,21,0.12)" stroke={C.ink} strokeWidth={4} />
      <circle cx={0} cy={-95} r={10} fill={C.orange} stroke={C.ink} strokeWidth={3} />
    </g>
  );
};

const Sticky: React.FC<{ x: number; y: number; at: number; tilt: number; text: string; strike?: number }> = ({ x, y, at, tilt, text, strike }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 13, mass: 0.5 } });
  if (f < at) return null;
  const st = strike != null ? prog(f, strike, strike + 8) : 0;
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${0.6 + 0.4 * s})`} opacity={Math.min(1, s * 1.4)}>
      <rect x={-75} y={-70} width={150} height={140} fill="#f2cf3a" stroke={C.ink} strokeWidth={4} />
      <text x={0} y={10} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={34} fill={C.ink}>
        {text}
      </text>
      {st > 0 && (
        <path d={`M-58 8 L ${-58 + 116 * st} ${8 - 6 * st}`} stroke={C.orange} strokeWidth={7} strokeLinecap="round" />
      )}
      <circle cx={0} cy={-70} r={10} fill={C.orange} stroke={C.ink} strokeWidth={3} />
    </g>
  );
};

const ScriptPage: React.FC<{ x: number; y: number; at: number; tilt: number }> = ({ x, y, at, tilt }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 12, mass: 0.6 } });
  if (f < at) return null;
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${0.6 + 0.4 * s})`} opacity={Math.min(1, s * 1.4)}>
      <rect x={-95} y={-125} width={190} height={250} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} x1={-70} x2={i % 3 === 2 ? 20 : 70} y1={-80 + i * 28} y2={-80 + i * 28} stroke="rgba(33,26,21,0.45)" strokeWidth={4} strokeLinecap="round" />
      ))}
      <circle cx={0} cy={-125} r={10} fill={C.orange} stroke={C.ink} strokeWidth={3} />
    </g>
  );
};

/** A seated actor behind a desk, pencil at the chin, looking up at the board. */
const ThinkingActor: React.FC<{ start: number }> = ({ start }) => {
  const f = useCurrentFrame();
  // the pencil taps the chin: small, regular, human
  const tap = Math.max(0, Math.sin((f - start) / 4)) * (f > start + 30 ? 1 : 0);
  const blink = (f % 70) > 66;
  const face = "M540 965 C 585 965 612 1000 612 1045 C 612 1095 582 1127 540 1127 C 498 1127 468 1095 468 1045 C 468 1000 495 965 540 965 Z";
  const hair = "M466 1040 C 452 1004 466 968 494 958 C 500 934 530 924 552 934 C 574 920 606 930 614 956 C 640 966 642 1004 618 1030 C 606 1012 590 1000 566 996 C 540 1006 504 1004 486 992 C 478 1008 470 1022 466 1040 Z";
  const torso = "M392 1402 C 400 1262 444 1192 516 1162 L 564 1162 C 636 1192 680 1262 688 1402 Z";
  const collar = "M516 1162 L 540 1196 L 564 1162";
  const restArm = "M430 1262 C 404 1322 412 1378 466 1394 L 612 1394";
  const raisedArm = "M646 1218 C 688 1282 706 1342 700 1394 C 690 1300 654 1196 616 1132";
  const hand = "M600 1100 C 622 1092 640 1108 636 1130 C 632 1150 610 1156 594 1146 C 580 1136 582 1108 600 1100 Z";
  const desk = "M100 1402 C 400 1398 700 1406 980 1400";
  const papers = "M210 1384 L 330 1370 L 338 1396 L 214 1404 Z M236 1370 L 346 1352 L 350 1376";
  const cup = "M808 1330 L 812 1396 L 862 1396 L 866 1330 Z M866 1344 C 890 1344 890 1376 864 1378";
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
      <Ink d={torso} start={start} dur={18} w={6} fill="rgba(232,121,43,0.42)" />
      <Ink d={collar} start={start + 10} dur={6} w={5} />
      <Ink d="M520 1124 L 518 1164 M560 1124 L 562 1164" start={start + 6} dur={6} w={6} />
      <Ink d={face} start={start + 4} dur={14} w={6} fill={SKIN} />
      <Ink d={hair} start={start + 12} dur={12} w={4} fill={C.ink} />
      <Ink d="M612 1036 C 626 1034 630 1058 612 1064" start={start + 14} dur={6} w={5} fill={SKIN} />
      {/* eyes look up and to the left, at the board */}
      {f > start + 16 && (
        <g>
          {blink ? (
            <path d="M500 1036 L 520 1036 M550 1036 L 570 1036" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          ) : (
            <>
              <circle cx={507} cy={1032} r={6} fill={C.ink} />
              <circle cx={557} cy={1032} r={6} fill={C.ink} />
            </>
          )}
          <path d="M494 1012 C 504 1004 518 1004 526 1010 M548 1008 C 558 1000 574 1002 582 1010" stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M536 1046 C 528 1066 528 1078 542 1080" stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M520 1100 C 532 1104 546 1102 556 1096" stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
        </g>
      )}
      <Ink d={restArm} start={start + 16} dur={12} w={44} />
      <Ink d={restArm} start={start + 16} dur={12} w={32} color="#f0c6a0" />
      <Ink d={desk} start={start} dur={20} w={6} />
      <Ink d={papers} start={start + 20} dur={10} w={4} fill="#ffffff" />
      <Ink d={cup} start={start + 22} dur={10} w={5} fill="rgba(232,121,43,0.4)" />
      <Ink d="M822 1310 C 816 1294 828 1286 822 1270 M842 1310 C 836 1294 848 1286 842 1270" start={start + 30} dur={12} w={3} color={C.inkSoft} />
      <Ink d={raisedArm} start={start + 18} dur={14} w={44} />
      <Ink d={raisedArm} start={start + 18} dur={14} w={32} color="#f0c6a0" />
      {/* pencil in the hand, tapping the chin */}
      <g transform={`rotate(${-tap * 6} 600 1120)`} opacity={prog(f, start + 26, start + 32)}>
        <line x1={604} y1={1120} x2={662} y2={1012} stroke={C.ink} strokeWidth={22} strokeLinecap="round" />
        <line x1={604} y1={1120} x2={662} y2={1012} stroke="#f2cf3a" strokeWidth={14} strokeLinecap="round" />
        <path d="M662 1012 L 676 986 L 652 1004 Z" fill={C.ink} />
        <line x1={606} y1={1116} x2={614} y2={1102} stroke={C.orange} strokeWidth={14} strokeLinecap="round" />
      </g>
      <Ink d={hand} start={start + 24} dur={8} w={5} fill={SKIN} />
      {/* little thinking marks */}
      <Ink d="M432 950 l -26 -18 M446 916 l -14 -30 M474 896 l -2 -32" start={start + 40} dur={10} w={5} color={C.orange} />
    </svg>
  );
};

type Thinking = { type: "thinking"; seconds: number; line1: string; line2: string; accent: string; notes: string[]; strike?: number };

const ThinkingScene: React.FC<{ s: Thinking }> = ({ s }) => {
  const notes = s.notes.slice(0, 3);
  const strikeIdx = s.strike ?? 1;
  const strikeAt = 64;
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={16} vol={0.5} />
      <Sfx name="pop" at={24} vol={0.5} />
      <Sfx name="pop" at={32} vol={0.5} />
      <Sfx name="boop_lo" at={18} vol={0.6} />
      <Sfx name="boop_hi" at={36} vol={0.6} />
      <Sfx name="pencil_short" at={strikeAt} vol={0.4} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d="M150 330 L 930 330 L 930 900 L 150 900 Z" start={0} dur={22} w={7} fill={CORK} />
        <Ink d="M178 356 L 902 356 L 902 874 L 178 874 Z" start={8} dur={18} w={3} color={C.inkSoft} />
        <Ink d="M285 412 C 360 380, 420 380, 475 392 C 560 410, 640 390, 720 400 C 760 520, 740 600, 720 690" start={44} dur={18} w={4} color={C.orange} />
      </svg>
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Headshot x={285} y={505} at={14} tilt={-4} />
        <Headshot x={475} y={485} at={20} tilt={3} hair />
        <ScriptPage x={720} y={525} at={26} tilt={2} />
        {notes.map((t, i) => (
          <Sticky key={i} x={300 + i * 210} y={770 - (i % 2) * 18} at={30 + i * 6} tilt={i % 2 ? 4 : -5} text={t} strike={i === strikeIdx ? strikeAt : undefined} />
        ))}
      </svg>
      <ThinkingActor start={8} />
      <AbsoluteFill style={{ paddingTop: 70, alignItems: "center" }}>
        <Rise at={18}>
          <Headline text={s.line1} accent="" color={C.ink} size={92} />
        </Rise>
        <Rise at={36}>
          <Headline text={s.line2} accent={s.accent} color={C.ink} size={92} />
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the email that changes the week ----------
const EmailScene: React.FC<{ s: Email }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = 130, R = 950, Tt = 560, B = 1250;
  const card = `M${L + 30} ${Tt} C ${L + 300} ${Tt - 4}, ${R - 300} ${Tt + 4}, ${R - 30} ${Tt} C ${R - 8} ${Tt}, ${R} ${Tt + 10}, ${R} ${Tt + 30} L ${R + 2} ${B - 30} C ${R} ${B - 8}, ${R - 10} ${B}, ${R - 30} ${B} L ${L + 30} ${B + 2} C ${L + 8} ${B}, ${L} ${B - 10}, ${L} ${B - 30} L ${L - 2} ${Tt + 30} C ${L} ${Tt + 8}, ${L + 10} ${Tt}, ${L + 30} ${Tt} Z`;
  const env = `M${L + 60} ${Tt + 60} L ${L + 160} ${Tt + 60} L ${L + 160} ${Tt + 130} L ${L + 60} ${Tt + 130} Z M${L + 60} ${Tt + 62} L ${L + 110} ${Tt + 102} L ${L + 160} ${Tt + 62}`;
  const ping = spring({ frame: f - 16, fps, config: { damping: 9, mass: 0.5 } });
  const bodyAt = 34;
  const lines = s.body.split("\n");
  // characters revealed so far across all body lines
  const shown = Math.max(0, Math.floor((f - bodyAt) / 0.6));
  const bodyLen = s.body.replace(/\n/g, "").length;
  const markAt = bodyAt + bodyLen * 0.6 + 4;
  const under = prog(f, markAt, markAt + 10);
  let used = 0;
  return (
    <AbsoluteFill>
      <Sfx name="chime" at={16} vol={0.8} />
      <Sfx name="pop" at={18} vol={0.5} />
      <Sfx name="typing" at={bodyAt} frames={Math.ceil(bodyLen * 0.6)} vol={0.45} />
      <Sfx name="pencil_short" at={Math.round(markAt)} vol={0.4} />
      {s.cue && <Sfx name="boop_hi" at={Math.round(markAt) + 12} vol={0.6} />}
      <Glow glow={0.4} y="48%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={card} start={0} dur={24} w={6} fill="#fbf7ef" />
        <Ink d={env} start={10} dur={14} w={5} fill="rgba(232,121,43,0.3)" />
        <Ink d={`M${L + 50} ${Tt + 260} C ${L + 300} ${Tt + 256}, ${R - 300} ${Tt + 264}, ${R - 50} ${Tt + 260}`} start={22} dur={12} w={3} color={C.inkSoft} />
        {/* the little red dot of a new message */}
        <circle cx={L + 160} cy={Tt + 60} r={20 * ping} fill={C.orange} stroke={C.ink} strokeWidth={ping > 0.05 ? 4 : 0} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={8}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={112} />
        </Rise>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: L + 200, top: Tt + 52, width: R - L - 250 }}>
        <Rise at={18}>
          <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 24, letterSpacing: 3, color: C.inkSoft }}>FROM</div>
          <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 44, color: C.ink, lineHeight: 1.1 }}>{s.from}</div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: L + 60, top: Tt + 170, width: R - L - 120 }}>
        <Rise at={24}>
          <div style={{ fontFamily: F.serifI, fontStyle: "italic", fontSize: 46, color: C.ink, lineHeight: 1.1 }}>{s.subject}</div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: L + 60, top: Tt + 300, width: R - L - 120 }}>
        {lines.map((l, i) => {
          const from = used;
          used += l.length;
          const vis = l.slice(0, Math.max(0, Math.min(l.length, shown - from)));
          const k = s.mark ? l.indexOf(s.mark) : -1;
          const content =
            k < 0 || vis.length < k + (s.mark?.length ?? 0) ? (
              vis
            ) : (
              <>
                {vis.slice(0, k)}
                <span
                  style={{
                    color: under > 0 ? C.orange : C.ink,
                    backgroundImage: `linear-gradient(${C.orange}, ${C.orange})`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "0 92%",
                    backgroundSize: `${under * 100}% 7px`,
                  }}
                >
                  {s.mark}
                </span>
                {vis.slice(k + (s.mark?.length ?? 0))}
              </>
            );
          return (
            <div key={i} style={{ fontFamily: F.type, fontStyle: "italic", fontSize: 44, color: C.ink, lineHeight: "70px", minHeight: 70 }}>
              {content}
            </div>
          );
        })}
      </div>
      {s.cue && (
        <div style={{ position: "absolute", left: 0, right: 0, top: B + 50 }}>
          <Cue text={s.cue} color={C.orange} at={Math.round(markAt) + 12} />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ---------- the drawn app (no screenshots) ----------
// Phone body spans x 220..860, top y 755. Screen inset 22.
const APP = {
  bg: "#17100b",
  cream: "#f4ead9",
  dim: "rgba(244,234,217,0.55)",
  yellow: "#f2cf3a",
  line: "rgba(244,234,217,0.22)",
};
const PX = 220, PY = 755, PW = 640, PH = 1500, PI = 22;
const SX = PX + PI, SY = PY + PI, SW = PW - PI * 2;

const DrawnPhone: React.FC<{ start: number; children?: React.ReactNode }> = ({ start, children }) => {
  const f = useCurrentFrame();
  const body = `M${PX + 96} ${PY} L ${PX + PW - 96} ${PY} C ${PX + PW - 30} ${PY}, ${PX + PW} ${PY + 30}, ${PX + PW} ${PY + 96} L ${PX + PW} ${PY + PH} L ${PX} ${PY + PH} L ${PX} ${PY + 96} C ${PX} ${PY + 30}, ${PX + 30} ${PY}, ${PX + 96} ${PY} Z`;
  const screenOn = prog(f, start + 10, start + 22);
  return (
    <>
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={body} start={start} dur={18} w={7} fill={PAPER_FILL} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: SX,
          top: SY,
          width: SW,
          height: PH,
          borderRadius: 78,
          background: APP.bg,
          opacity: screenOn,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: SW / 2 - 70, top: 20, width: 140, height: 40, borderRadius: 20, background: "#000" }} />
        {children}
      </div>
    </>
  );
};

/** Live search: headline, the query typing in, chips lighting, results sliding up. */
const SearchUI: React.FC<{ s: Phone }> = ({ s }) => {
  const f = useCurrentFrame();
  const q = s.query ?? "";
  const typeAt = 24;
  const typed = q.slice(0, Math.max(0, Math.floor((f - typeAt) / 1.15)));
  const doneAt = typeAt + q.length * 1.15;
  const caret = f < doneAt + 6 && Math.floor(f / 8) % 2 === 0;
  const results = s.results ?? [];
  const resAt = (s.tap?.at ?? doneAt + 10) + 16;
  const slideUp = prog(f, resAt, resAt + 18);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* header + search lift away when results arrive */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, transform: `translateY(${-slideUp * 190}px)` }}>
        <div style={{ position: "absolute", top: 120, width: SW, textAlign: "center", opacity: prog(f, 14, 26) * (1 - slideUp) }}>
          <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 58, color: APP.cream, lineHeight: 1.05 }}>
            What do you
            <br />
            <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>need</span> tonight?
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 34,
            top: 290,
            width: SW - 68,
            height: 92,
            borderRadius: 46,
            background: APP.cream,
            boxShadow: `6px 6px 0 ${APP.yellow}`,
            display: "flex",
            alignItems: "center",
            padding: "0 26px",
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 25,
            color: "#2a1f17",
            opacity: prog(f, 18, 28),
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <span style={{ marginRight: 14, fontSize: 32 }}>⌕</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
            {typed}
            <span style={{ opacity: caret ? 1 : 0, color: C.orange }}>|</span>
          </span>
          <span
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              background: "#1b140f",
              color: APP.cream,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
            }}
          >
            →
          </span>
        </div>
        <div style={{ position: "absolute", left: 34, top: 410, width: SW - 68, display: "flex", flexWrap: "wrap", gap: 14 }}>
          {(s.chips ?? []).map((c, i) => {
            const lit = f > doneAt + 2 + i * 4;
            return (
              <div
                key={i}
                style={{
                  fontFamily: F.type,
                  fontStyle: "italic",
                  fontSize: 26,
                  padding: "8px 22px",
                  borderRadius: 30,
                  background: lit ? APP.yellow : "transparent",
                  color: lit ? "#1b140f" : APP.dim,
                  border: `2px solid ${lit ? APP.yellow : APP.line}`,
                  opacity: prog(f, 22 + i * 2, 32 + i * 2),
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
      </div>
      {/* results */}
      <div style={{ position: "absolute", left: 30, top: 330, width: SW - 60, opacity: slideUp, transform: `translateY(${(1 - slideUp) * 120}px)` }}>
        <div style={{ fontFamily: F.type, fontStyle: "italic", fontSize: 24, color: APP.dim, marginBottom: 6 }}>{s.resultsCue}</div>
        <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 46, color: APP.cream, marginBottom: 22 }}>
          {results.length}{" "}
          <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>monologues.</span>
        </div>
        {results.map((r, i) => {
          const p = prog(f, resAt + 6 + i * 6, resAt + 22 + i * 6);
          return (
            <div
              key={i}
              style={{
                background: "#f7f0e2",
                borderRadius: 14,
                padding: "20px 24px",
                marginBottom: 18,
                boxShadow: i === 0 ? `6px 6px 0 ${APP.yellow}` : "none",
                opacity: p,
                transform: `translateY(${(1 - p) * 40}px)`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 36, color: "#1b140f" }}>{r.character}</div>
                <div style={{ fontFamily: F.type, fontSize: 20, color: "#6b5d50" }}>{r.meta}</div>
              </div>
              <div style={{ fontFamily: F.type, fontSize: 20, color: "#6b5d50", marginTop: 2 }}>{r.source}</div>
              <div style={{ fontFamily: F.type, fontSize: 22, color: "#2a1f17", marginTop: 10, lineHeight: 1.4 }}>{r.quote}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** The chosen piece opens as a paper page inside the phone, lines appearing. */
const ReadUI: React.FC<{ s: Phone }> = ({ s }) => {
  const f = useCurrentFrame();
  const r = s.read!;
  const open = prog(f, 0, 16);
  const lines = r.text.split("\n");
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 26 + (1 - open) * 10,
          top: 90 + (1 - open) * 300,
          width: SW - 52,
          height: 1300,
          background: "#f7f0e2",
          borderRadius: 16,
          boxShadow: `8px 8px 0 ${APP.yellow}`,
          padding: "40px 38px",
          transform: `scale(${0.92 + 0.08 * open})`,
          transformOrigin: "50% 0%",
        }}
      >
        <div style={{ display: "inline-block", fontFamily: F.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: C.orange, border: `2px solid ${C.orange}`, padding: "4px 10px" }}>
          {r.tag}
        </div>
        <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 66, color: "#1b140f", marginTop: 16, lineHeight: 1 }}>
          {r.title} <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400 }}>{r.titleItalic}</span>
        </div>
        <div style={{ fontFamily: F.type, fontSize: 22, color: "#6b5d50", marginTop: 12 }}>{r.meta}</div>
        <div style={{ height: 2, background: "#ddd2c0", margin: "26px 0" }} />
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: F.type,
              fontSize: 28,
              color: "#1b140f",
              lineHeight: 1.5,
              opacity: prog(f, 18 + i * 9, 26 + i * 9),
              minHeight: l ? undefined : 24,
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

/** The chosen page leaves the phone and becomes a marked-up script on the desk. */
const LiftedSheet: React.FC<{ s: Phone; at: number }> = ({ s, at }) => {
  const f = useCurrentFrame();
  const r = s.read!;
  const p = prog(f, at, at + 22);
  const lines = r.text.split("\n");
  const markLine = r.mark ?? 1;
  const underAt = at + 26;
  const noteAt = at + 38;
  const L = 100, Tp = 520, W = 880, LH = 64;
  const textTop = 300;
  const uy = Tp + textTop + markLine * LH + 72;
  const hy = uy - 2;
  const hl = `M${L + 58} ${hy + 2} C ${L + 250} ${hy - 2}, ${L + 480} ${hy + 3}, ${L + 700} ${hy - 1}`;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: L,
          top: Tp,
          width: W,
          height: 1180,
          background: "#fbf7ef",
          borderRadius: 10,
          border: `5px solid ${C.ink}`,
          boxShadow: `${14 * p}px ${22 * p}px 0 rgba(33,26,21,0.12)`,
          transform: `translateY(${(1 - p) * 220}px) rotate(${-2.5 * p}deg) scale(${0.94 + 0.06 * p})`,
          opacity: prog(f, at, at + 6),
          padding: "56px 64px",
        }}
      >
        <div style={{ display: "inline-block", fontFamily: F.sans, fontWeight: 600, fontSize: 24, letterSpacing: 4, color: C.orange, border: `3px solid ${C.orange}`, padding: "6px 14px" }}>
          {r.tag}
        </div>
        <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 92, color: C.ink, marginTop: 20, lineHeight: 1 }}>
          {r.title} <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400 }}>{r.titleItalic}</span>
        </div>
        <div style={{ fontFamily: F.type, fontSize: 30, color: "#6b5d50", marginTop: 16 }}>{r.meta}</div>
        <div style={{ height: 3, background: "#ddd2c0", margin: "34px 0 30px" }} />
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: F.type, fontSize: 42, color: C.ink, lineHeight: `${LH}px` }}>
            {l}
          </div>
        ))}
      </div>
      {/* pencil marks live in scene space so they sit on the sheet */}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", transform: `rotate(${-2.5 * p}deg)`, transformOrigin: `${L + W / 2}px ${Tp + 590}px` }}>
        <g style={{ mixBlendMode: "multiply" }}>
          <Ink d={hl} start={underAt} dur={12} w={50} color="rgba(242,207,58,0.75)" />
        </g>
        <Ink d={`M${L + 712} ${uy - 6} C ${L + 740} ${uy - 20}, ${L + 760} ${uy - 40}, ${L + 770} ${uy - 66}`} start={noteAt - 4} dur={8} w={5} color={C.orange} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: L + 730,
          top: uy - 190,
          width: 150,
          lineHeight: 1,
          transform: `rotate(${-8}deg)`,
          fontFamily: F.serifI,
          fontStyle: "italic",
          fontSize: 40,
          color: C.orange,
          opacity: prog(f, noteAt, noteAt + 8),
        }}
      >
        {(r.note ?? "").slice(0, Math.max(0, Math.floor((f - noteAt) / 1.2)))}
      </div>
    </>
  );
};

const ZOOM = 1.38;
const PhoneScene: React.FC<{ s: Phone; first: boolean }> = ({ s, first }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const up = first ? spring({ frame: f - 2, fps, config: { damping: 18 } }) : 1;
  const lift = (1 - up) * 800;
  const mode = s.mode ?? "search";
  // camera pushes into the phone once it has landed
  const zoom = first ? 1 + (ZOOM - 1) * spring({ frame: f - 14, fps, config: { damping: 22 } }) : ZOOM;
  const sheetAt = 8;
  const putAway = mode === "read" ? prog(f, sheetAt, sheetAt + 22) : 0;
  return (
    <AbsoluteFill>
      {first && <Sfx name="pop" at={6} vol={0.8} />}
      <Sfx name="boop_hi" at={8} vol={0.6} />
      {s.cue && <Sfx name="typing" at={20} frames={typeFrames(s.cue)} vol={0.45} />}
      {mode === "search" && s.query && <Sfx name="typing" at={26} frames={Math.ceil(s.query.length * 1.15)} vol={0.45} />}
      {s.tap && <Sfx name="boop_lo" at={s.tap.at + 14} vol={0.7} />}
      {mode === "read" && <Sfx name="pencil_short" at={sheetAt + 26} vol={0.4} />}
      <Glow glow={0.6} y="72%" />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <Rise at={6}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={100} />
        </Rise>
        {s.cue && (
          <div style={{ position: "relative", marginTop: 14 }}>
            <Cue text={s.cue} color={C.inkSoft} at={20} />
          </div>
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `translateY(${lift + putAway * 1600}px) scale(${zoom})`,
          transformOrigin: "540px 980px",
        }}
      >
        <DrawnPhone start={first ? 0 : -100}>{mode === "search" ? <SearchUI s={s} /> : <ReadUI s={s} />}</DrawnPhone>
        <HoldingHand start={first ? 8 : -100} />
        {s.tap && <TapFinger at={s.tap.at} x={s.tap.x} y={s.tap.y} />}
      </AbsoluteFill>
      {mode === "read" && <LiftedSheet s={s} at={sheetAt} />}
    </AbsoluteFill>
  );
};

// ---------- the seven o'clock knock (Ghost Light's tonight push) ----------
/**
 * Lock screen on the drawn phone. The clock ticks from `from` to `to`, then the
 * notification drops in with a chime and a finger taps it. Text matches
 * backend/app/services/push.py: title "Tonight's speech", body "<Character>, from <Play>."
 */
type Notify = {
  type: "notify";
  seconds: number;
  line: string;
  accent: string;
  cue?: string;
  from: string; // clock before, e.g. "6:59"
  to: string; // clock after, e.g. "7:00"
  day: string; // e.g. "Tuesday, November 3"
  app: string; // e.g. "GHOST LIGHT"
  title: string;
  body: string;
};

const NotifyScene: React.FC<{ s: Notify }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const up = spring({ frame: f - 2, fps, config: { damping: 18 } });
  const zoom = 1 + 0.16 * spring({ frame: f - 14, fps, config: { damping: 22 } });
  const tickAt = 40;
  const dropAt = tickAt + 6;
  const drop = spring({ frame: f - dropAt, fps, config: { damping: 13, mass: 0.6 } });
  const tapAt = dropAt + 26;
  const pressed = prog(f, tapAt + 14, tapAt + 20);
  const shownTime = f < tickAt ? s.from : s.to;
  const flip = interpolate(f, [tickAt - 3, tickAt, tickAt + 4], [1, 0.6, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={6} vol={0.8} />
      <Sfx name="boop_lo" at={tickAt} vol={0.55} />
      <Sfx name="chime" at={dropAt} vol={0.85} />
      <Sfx name="boop_hi" at={tapAt + 14} vol={0.7} />
      {s.cue && <Sfx name="typing" at={tapAt + 20} frames={typeFrames(s.cue)} vol={0.45} />}
      <Glow glow={0.5} y="62%" />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <Rise at={6}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
        {s.cue && (
          <div style={{ position: "relative", marginTop: 14 }}>
            <Cue text={s.cue} color={C.inkSoft} at={tapAt + 20} />
          </div>
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateY(${(1 - up) * 800}px) scale(${zoom})`, transformOrigin: "540px 980px" }}>
        <DrawnPhone start={0}>
          {/* lock screen */}
          <div style={{ position: "absolute", top: 96, width: SW, textAlign: "center", opacity: prog(f, 14, 26) }}>
            <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 26, letterSpacing: 2, color: APP.dim }}>{s.day}</div>
            <div
              style={{
                fontFamily: F.serif,
                fontWeight: 600,
                fontSize: 150,
                lineHeight: 1.05,
                color: f < tickAt ? APP.cream : C.orange,
                transform: `scaleY(${flip})`,
              }}
            >
              {shownTime}
            </div>
          </div>
          {/* the notification */}
          <div
            style={{
              position: "absolute",
              left: 26,
              top: 360,
              width: SW - 52,
              borderRadius: 28,
              background: "#f7f0e2",
              boxShadow: `6px 6px 0 ${APP.yellow}`,
              padding: "22px 24px",
              opacity: prog(f, dropAt, dropAt + 6),
              transform: `translateY(${(1 - drop) * -260}px) scale(${1 - pressed * 0.04})`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: C.orange, border: `3px solid ${C.ink}` }} />
              <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 20, letterSpacing: 3, color: "#6b5d50", flex: 1 }}>{s.app}</div>
              <div style={{ fontFamily: F.type, fontSize: 20, color: "#6b5d50" }}>now</div>
            </div>
            <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 38, color: "#1b140f", marginTop: 14 }}>{s.title}</div>
            <div style={{ fontFamily: F.type, fontSize: 24, color: "#2a1f17", marginTop: 6, lineHeight: 1.35, whiteSpace: "nowrap" }}>{s.body}</div>
          </div>
        </DrawnPhone>
        <HoldingHand start={8} />
        <TapFinger at={tapAt} x={560} y={1250} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the audition room ----------
/** Simple line figure of an actor mid speech, one hand reaching out. */
const Actor: React.FC<{ start: number }> = ({ start }) => {
  const f = useCurrentFrame();
  const sway = Math.sin(f / 14) * 3;
  const head = "M540 650 C 568 650, 586 672, 586 700 C 586 730, 566 752, 540 752 C 514 752, 494 730, 494 700 C 494 672, 512 650, 540 650 Z";
  const hair = "M498 690 C 500 660, 520 646, 544 646 C 570 646, 588 664, 586 694 C 572 676, 552 668, 530 672 C 516 674, 506 682, 498 690 Z";
  const body = "M540 752 L 540 770 C 506 776, 486 800, 482 840 L 470 1000 L 610 1000 L 598 840 C 594 800, 574 776, 540 770";
  const armOut = "M590 800 C 640 820, 690 800, 730 760 M730 760 C 738 752, 746 748, 752 744";
  const armIn = "M490 800 C 470 860, 480 910, 530 900";
  const legs = "M500 1000 L 492 1150 L 470 1162 M580 1000 L 590 1150 L 614 1162";
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, transform: `rotate(${sway * 0.2}deg)`, transformOrigin: "540px 1160px" }}>
      <Ink d={head} start={start} dur={12} w={6} fill={PAPER_FILL} />
      <Ink d={hair} start={start + 8} dur={10} w={4} fill={C.ink} />
      <Ink d={body} start={start + 10} dur={16} w={6} fill="rgba(232,121,43,0.35)" />
      <Ink d={armOut} start={start + 20} dur={12} w={6} />
      <Ink d={armIn} start={start + 22} dur={10} w={6} />
      <Ink d={legs} start={start + 24} dur={12} w={6} />
    </svg>
  );
};

/** Two casting people seen from behind at a table, papers and a cup. */
const CastingTable: React.FC<{ start: number }> = ({ start }) => {
  const p1 = "M300 1500 C 300 1420, 330 1380, 380 1370 C 350 1350, 340 1320, 344 1290 C 350 1250, 380 1230, 410 1232 C 446 1234, 470 1262, 468 1298 C 466 1330, 454 1350, 436 1368 C 490 1378, 520 1420, 522 1500 Z";
  const hair1 = "M346 1296 C 344 1252, 376 1228, 410 1230 C 448 1232, 472 1262, 466 1300 C 450 1280, 420 1272, 392 1278 C 372 1282, 356 1290, 346 1296 Z";
  const p2 = "M600 1500 C 600 1430, 628 1392, 676 1380 C 652 1360, 642 1330, 646 1300 C 652 1262, 682 1244, 712 1246 C 748 1248, 770 1276, 768 1310 C 766 1340, 754 1360, 736 1378 C 786 1390, 812 1430, 814 1500 Z";
  const bun = "M712 1238 C 726 1238, 736 1226, 734 1212 C 732 1198, 718 1192, 706 1196 C 692 1200, 688 1216, 694 1228 C 698 1234, 704 1238, 712 1238 Z";
  const table = "M90 1500 C 400 1494, 700 1506, 990 1498 M90 1500 L 90 1530 L 990 1528 L 990 1498 M160 1530 L 160 1640 M920 1528 L 920 1640";
  const papers = "M190 1478 L 290 1470 L 296 1496 L 194 1502 Z M840 1480 L 900 1476 L 902 1498 L 842 1500 Z";
  const cup = "M520 1440 L 524 1496 L 566 1496 L 570 1440 Z M570 1452 C 590 1452, 590 1478, 568 1480";
  const steam = "M534 1420 C 528 1404, 540 1396, 534 1380 M552 1420 C 546 1404, 558 1396, 552 1380";
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
      <Ink d={p1} start={start} dur={18} w={6} fill={PAPER_FILL} />
      <Ink d={hair1} start={start + 10} dur={10} w={4} fill={C.ink} />
      <Ink d={p2} start={start + 6} dur={18} w={6} fill={PAPER_FILL} />
      <Ink d={bun} start={start + 16} dur={8} w={4} fill={C.ink} />
      <Ink d={table} start={start + 4} dur={22} w={6} />
      <Ink d={papers} start={start + 16} dur={10} w={4} fill="#ffffff" />
      <Ink d={cup} start={start + 18} dur={10} w={5} fill="rgba(232,121,43,0.4)" />
      <Ink d={steam} start={start + 26} dur={12} w={3} color={C.inkSoft} />
    </svg>
  );
};

const StageScene: React.FC<{ s: Stage }> = ({ s }) => {
  const f = useCurrentFrame();
  const lights = prog(f, 34, 50);
  const bubbleAt = 58;
  const bubble = prog(f, bubbleAt, bubbleAt + 12);
  return (
    <AbsoluteFill>
      <Sfx name="chime" at={34} vol={0.7} />
      <Sfx name="typing" at={40} frames={typeFrames(s.cue)} vol={0.45} />
      <Sfx name="pop" at={bubbleAt} vol={0.6} />
      <Sfx name="boop_hi" at={bubbleAt + 14} vol={0.55} />
      {/* lights up: a warm cone onto the actor */}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <path d="M470 300 L 610 300 L 820 1180 L 260 1180 Z" fill={`rgba(232,121,43,${0.16 * lights})`} />
        <ellipse cx={540} cy={1170} rx={260} ry={34} fill={`rgba(232,121,43,${0.22 * lights})`} />
        {/* stage: floor and wings */}
        <Ink d="M60 1170 C 400 1162, 700 1176, 1020 1166" start={0} dur={20} w={5} />
        <Ink d="M60 300 C 140 360, 200 360, 260 300 C 330 360, 400 360, 470 300 M610 300 C 680 360, 750 360, 820 300 C 880 360, 950 360, 1020 300" start={4} dur={22} w={5} />
        <Ink d="M80 306 C 110 600, 70 900, 110 1166 M150 320 C 170 600, 140 900, 170 1166 M1000 306 C 970 600, 1010 900, 970 1166 M930 320 C 910 600, 940 900, 910 1166" start={10} dur={22} w={4} color={C.inkSoft} />
      </svg>
      <Actor start={14} />
      <CastingTable start={22} />
      <AbsoluteFill style={{ paddingTop: 60, paddingLeft: 90 }}>
        <Rise at={30}>
          <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 92, color: C.ink, lineHeight: 1.1 }}>{s.time}</div>
        </Rise>
        <div style={{ position: "relative", marginTop: 4, textAlign: "left" }}>
          <div style={{ fontFamily: F.type, fontStyle: "italic", fontSize: 44, color: C.orange }}>
            {s.cue.slice(0, Math.max(0, Math.floor((f - 40) / 1.3)))}
          </div>
        </div>
      </AbsoluteFill>
      {/* speech bubble from the casting table */}
      <div
        style={{
          position: "absolute",
          left: 520,
          top: 1550,
          width: 500,
          transform: `scale(${0.6 + 0.4 * bubble})`,
          transformOrigin: "30% 0%",
          opacity: bubble,
        }}
      >
        <svg viewBox="0 0 440 260" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: 500, height: 300, overflow: "visible" }}>
          <path
            d="M40 40 C 120 26, 320 26, 404 42 C 432 48, 440 70, 438 120 C 436 170, 428 196, 400 202 C 320 216, 200 216, 120 206 L 80 240 L 90 202 C 50 196, 22 186, 18 130 C 14 80, 18 46, 40 40 Z"
            fill="#fffdf8"
            stroke={C.ink}
            strokeWidth={5}
            strokeLinejoin="round"
            transform="scale(1,-1) translate(0,-250)"
          />
        </svg>
        <div style={{ position: "relative", padding: "72px 44px 0 50px", fontFamily: F.serif, fontWeight: 600, fontSize: 40, lineHeight: 1.15, color: C.ink }}>
          {(() => {
            const i = s.quote.indexOf(s.accent);
            return i < 0 ? (
              s.quote
            ) : (
              <>
                {s.quote.slice(0, i)}
                <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>{s.accent}</span>
                {s.quote.slice(i + s.accent.length)}
              </>
            );
          })()}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- the ticket ----------
const EndScene: React.FC<{ s: End }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const iconPop = spring({ frame: f - 14, fps, config: { damping: 14 } });
  const stampAt = 40;
  const stamp = spring({ frame: f - stampAt, fps, config: { damping: 11, mass: 0.6 } });
  const L = 110, R = 970, Tt = 640, B = 1180, notch = 40, perfX = 770;
  const ticket = `M${L} ${Tt} L ${R} ${Tt} L ${R} ${(Tt + B) / 2 - notch} C ${R - notch * 1.2} ${(Tt + B) / 2 - notch}, ${R - notch * 1.2} ${(Tt + B) / 2 + notch}, ${R} ${(Tt + B) / 2 + notch} L ${R} ${B} L ${L} ${B} L ${L} ${(Tt + B) / 2 + notch} C ${L + notch * 1.2} ${(Tt + B) / 2 + notch}, ${L + notch * 1.2} ${(Tt + B) / 2 - notch}, ${L} ${(Tt + B) / 2 - notch} Z`;
  const perf = Array.from({ length: 13 }, (_, i) => `M${perfX} ${Tt + 20 + i * 40} L ${perfX} ${Tt + 40 + i * 40}`).join(" ");
  const inner = `M${L + 26} ${Tt + 26} L ${perfX - 26} ${Tt + 26} L ${perfX - 26} ${B - 26} L ${L + 26} ${B - 26} Z`;
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={14} vol={0.8} />
      <Sfx name="thud" at={stampAt + 2} vol={0.9} />
      <Sfx name="boop_lo" at={stampAt + 4} vol={0.5} />
      <Sfx name="boop_hi" at={58} vol={0.6} />
      <Glow glow={0.45} y="48%" />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 440 }}>
        <Cue text={s.kicker ?? "(now playing.)"} color={C.orange} at={4} />
      </AbsoluteFill>
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={ticket} start={0} dur={22} w={6} fill="#fbf7ef" />
        <Ink d={inner} start={10} dur={18} w={3} color={C.inkSoft} />
        <Ink d={perf} start={14} dur={14} w={4} color={C.inkSoft} />
      </svg>
      {/* left side: icon + name */}
      <div style={{ position: "absolute", left: L + 60, top: Tt + 78, display: "flex", alignItems: "center", gap: 36 }}>
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 46,
            overflow: "hidden",
            transform: `scale(${iconPop}) rotate(${(1 - iconPop) * -8}deg)`,
            boxShadow: "0 18px 40px rgba(33,26,21,0.3)",
          }}
        >
          <Img src={staticFile("icon.png")} style={{ width: 200, height: 200 }} />
        </div>
        <div style={{ position: "relative" }}>
          <Rise at={18}>
            <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 64, color: C.ink, lineHeight: 1 }}>Ghost</div>
            <div style={{ fontFamily: F.serifI, fontStyle: "italic", fontSize: 64, color: C.orange, lineHeight: 1.05 }}>Light</div>
          </Rise>
        </div>
      </div>
      <div style={{ position: "absolute", left: L + 60, top: Tt + 330, width: perfX - L - 110 }}>
        <Rise at={26}>
          <div style={{ fontFamily: F.type, fontStyle: "italic", fontSize: 34, color: C.inkSoft }}>{s.tagline}</div>
          <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 26, letterSpacing: 4, color: C.ink, marginTop: 30 }}>
            ADMIT ONE ACTOR
          </div>
        </Rise>
      </div>
      {/* stub: the FREE stamp */}
      <div
        style={{
          position: "absolute",
          left: perfX + 18,
          top: (Tt + B) / 2 - 90,
          width: R - perfX - 40,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `rotate(-14deg) scale(${f < stampAt ? 0 : 2.2 - 1.2 * stamp})`,
          opacity: f < stampAt ? 0 : Math.min(1, stamp * 1.5),
        }}
      >
        <div
          style={{
            border: `6px solid ${C.orange}`,
            borderRadius: 14,
            padding: "10px 18px",
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 52,
            letterSpacing: 4,
            color: C.orange,
          }}
        >
          FREE
        </div>
      </div>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: B + 70 }}>
        <Rise at={58}>
          <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: 56, color: C.ink }}>
            {s.action.split(" on ")[0]} <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>on the App Store.</span>
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- lobby: a row of identical Juliets ----------
const Juliet: React.FC<{ x: number; start: number; page: string; bubble: string; k: number }> = ({ x, start, page, bubble, k }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - start, fps, config: { damping: 11, mass: 0.6 } });
  if (f < start) return null;
  // every Juliet mouths the same line at the same time
  const talk = Math.sin((f - 30) / 3.2) > 0.1 && f > 36;
  const bob = Math.sin((f + k * 7) / 9) * 3;
  const y0 = 690;
  const bubbleP = prog(f, 40 + k * 3, 52 + k * 3);
  return (
    <g transform={`translate(${x} ${y0 + bob}) scale(${pop}) translate(${-x} ${-y0})`}>
      {/* hair: a bun and two curls, the same on every one */}
      <circle cx={x + 26} cy={y0 - 52} r={22} fill={C.ink} />
      <path d={`M${x - 44} ${y0 + 6} C ${x - 58} ${y0 - 60}, ${x + 58} ${y0 - 60}, ${x + 44} ${y0 + 6} C ${x + 30} ${y0 - 30}, ${x - 30} ${y0 - 30}, ${x - 44} ${y0 + 6} Z`} fill={C.ink} />
      <circle cx={x} cy={y0} r={42} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} />
      <circle cx={x - 14} cy={y0 - 2} r={4.5} fill={C.ink} />
      <circle cx={x + 14} cy={y0 - 2} r={4.5} fill={C.ink} />
      {talk ? <ellipse cx={x} cy={y0 + 20} rx={8} ry={9} fill={C.ink} /> : <path d={`M${x - 8} ${y0 + 20} L ${x + 8} ${y0 + 20}`} stroke={C.ink} strokeWidth={4} strokeLinecap="round" />}
      {/* the same dress */}
      <path d={`M${x - 26} ${y0 + 44} L ${x + 26} ${y0 + 44} L ${x + 58} ${y0 + 250} L ${x - 58} ${y0 + 250} Z`} fill="rgba(20,20,20,0.06)" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      {/* the same page */}
      <g transform={`rotate(${k % 2 ? 4 : -4} ${x} ${y0 + 150})`}>
        <rect x={x - 46} y={y0 + 100} width={92} height={112} rx={4} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
        <text x={x} y={y0 + 140} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={17} letterSpacing={1.5} fill={C.ink}>{page}</text>
        <path d={`M${x - 30} ${y0 + 160} L ${x + 30} ${y0 + 160} M${x - 30} ${y0 + 176} L ${x + 22} ${y0 + 176} M${x - 30} ${y0 + 192} L ${x + 28} ${y0 + 192}`} stroke={C.inkSoft} strokeWidth={3} strokeLinecap="round" />
      </g>
      {/* the same line, in a little bubble */}
      <g opacity={bubbleP} transform={`translate(0 ${(1 - bubbleP) * 14})`}>
        <path d={`M${x - 80} ${y0 - 160} C ${x - 82} ${y0 - 198}, ${x + 82} ${y0 - 198}, ${x + 80} ${y0 - 160} C ${x + 80} ${y0 - 128}, ${x + 20} ${y0 - 124}, ${x + 6} ${y0 - 124} L ${x - 6} ${y0 - 100} L ${x - 14} ${y0 - 124} C ${x - 40} ${y0 - 124}, ${x - 80} ${y0 - 132}, ${x - 80} ${y0 - 160} Z`} fill="#ffffff" stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
        <text x={x} y={y0 - 152} textAnchor="middle" fontFamily={F.type} fontStyle="italic" fontSize={21} fill={C.ink}>{bubble}</text>
      </g>
    </g>
  );
};

const LobbyScene: React.FC<{ s: Lobby }> = ({ s }) => {
  const f = useCurrentFrame();
  const n = s.count ?? 5;
  const xs = Array.from({ length: n }, (_, k) => 150 + (k * 710) / (n - 1)); // keep clear of the right 140px (platform UI)
  return (
    <AbsoluteFill>
      {xs.map((_, k) => (
        <Sfx key={k} name={k % 2 ? "boop_hi" : "pop"} at={8 + k * 5} vol={0.55} />
      ))}
      <Sfx name="cine/plink" at={42} vol={0.45} />
      <Sfx name="cine/plink" at={48} vol={0.4} />
      <Sfx name="cine/pong" at={58} vol={0.45} />
      {s.cue && <Sfx name="typing" at={70} frames={typeFrames(s.cue)} vol={0.45} />}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the wall, the sign, the bench */}
        <Ink d="M40 470 C 300 466, 780 474, 1040 468" start={0} dur={16} w={4} color={C.inkSoft} />
        <Ink d="M380 330 L 700 330 L 700 410 L 380 410 Z" start={2} dur={16} w={5} fill="#ffffff" />
        <Ink d="M60 952 C 380 946, 700 956, 1020 950 M90 952 L 90 1040 M990 950 L 990 1040" start={4} dur={20} w={6} />
        {xs.map((x, k) => (
          <Juliet key={k} x={x} start={8 + k * 5} page={s.page} bubble={s.bubble} k={k} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: 380, top: 330, width: 320, height: 80, display: "flex", alignItems: "center", justifyContent: "center", opacity: prog(f, 10, 18), fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 30, letterSpacing: 6, color: C.ink }}>
        {s.sign ?? "AUDITIONS"}
      </div>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1110 }}>
        <Rise at={58}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={70} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- panel: three tired faces wake up ----------
const PanelHead: React.FC<{ x: number; start: number; awake: number; k: number }> = ({ x, start, awake, k }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - start, fps, config: { damping: 14 } });
  if (f < start) return null;
  const y = 860 - awake * 18; // they sit up
  const tilt = (1 - awake) * (k === 1 ? -12 : k === 0 ? 8 : 5);
  const brow = awake * 16;
  return (
    <g transform={`translate(0 ${(1 - pop) * 80}) rotate(${tilt} ${x} ${y + 60})`} opacity={pop}>
      <path d={`M${x - 80} ${y + 210} C ${x - 84} ${y + 40}, ${x + 84} ${y + 40}, ${x + 80} ${y + 210}`} fill="rgba(20,20,20,0.06)" stroke={C.ink} strokeWidth={5} />
      <circle cx={x} cy={y} r={60} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} />
      {k === 0 && <path d={`M${x - 58} ${y - 18} C ${x - 40} ${y - 74}, ${x + 40} ${y - 74}, ${x + 58} ${y - 18} C ${x + 30} ${y - 44}, ${x - 30} ${y - 44}, ${x - 58} ${y - 18} Z`} fill={C.ink} />}
      {k === 1 && <path d={`M${x - 44} ${y - 40} l 0 -10 M${x - 22} ${y - 52} l 0 -12 M${x} ${y - 58} l 0 -12 M${x + 22} ${y - 52} l 0 -12 M${x + 44} ${y - 40} l 0 -10`} stroke={C.ink} strokeWidth={5} strokeLinecap="round" />}
      {k === 2 && <g><circle cx={x - 22} cy={y - 2} r={20} fill="none" stroke={C.ink} strokeWidth={4} /><circle cx={x + 22} cy={y - 2} r={20} fill="none" stroke={C.ink} strokeWidth={4} /><path d={`M${x - 2} ${y - 2} L ${x + 2} ${y - 2}`} stroke={C.ink} strokeWidth={4} /></g>}
      {/* brows lift */}
      <path d={`M${x - 34} ${y - 26 - brow} L ${x - 12} ${y - 30 - brow} M${x + 12} ${y - 30 - brow} L ${x + 34} ${y - 26 - brow}`} stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      {/* eyes: tired lines, then wide open */}
      {awake < 0.5 ? (
        <path d={`M${x - 30} ${y} L ${x - 14} ${y} M${x + 14} ${y} L ${x + 30} ${y}`} stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      ) : (
        <g><circle cx={x - 22} cy={y - 2} r={7 + awake * 3} fill={C.ink} /><circle cx={x + 22} cy={y - 2} r={7 + awake * 3} fill={C.ink} /></g>
      )}
      {awake < 0.5 ? (
        <path d={`M${x - 14} ${y + 30} C ${x - 4} ${y + 24}, ${x + 4} ${y + 24}, ${x + 14} ${y + 30}`} fill="none" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
      ) : (
        <path d={`M${x - 20} ${y + 24} C ${x - 8} ${y + 44}, ${x + 8} ${y + 44}, ${x + 20} ${y + 24}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      )}
    </g>
  );
};

const PanelScene: React.FC<{ s: Panel }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wakeAt = s.wakeAt ?? 46;
  const bubble = prog(f, wakeAt - 14, wakeAt - 2);
  const awake = spring({ frame: f - wakeAt, fps, config: { damping: 9, mass: 0.6 } });
  const zz = f < wakeAt ? 1 : 1 - prog(f, wakeAt, wakeAt + 6);
  // a pen springs out of a hand when they wake
  const pen = spring({ frame: f - wakeAt - 2, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={wakeAt - 14} vol={0.6} />
      <Sfx name="cine/ping" at={wakeAt} vol={0.5} />
      <Sfx name="cine/toing" at={wakeAt + 4} vol={0.45} />
      <Sfx name="cine/tap" at={wakeAt + 18} vol={0.4} />
      {s.cue && <Sfx name="typing" at={wakeAt + 24} frames={typeFrames(s.cue)} vol={0.45} />}
      {/* the quote, from the actor (off frame, in front of the table) */}
      <div style={{ position: "absolute", left: 110, top: 250, width: 860, opacity: bubble, transform: `scale(${0.7 + 0.3 * bubble})`, transformOrigin: "50% 100%" }}>
        <svg viewBox="0 0 860 250" style={{ position: "absolute", inset: 0, width: 860, height: 250, overflow: "visible" }}>
          <path d="M40 30 C 200 14, 660 14, 820 30 C 852 34, 860 60, 858 120 C 856 180, 848 200, 820 206 C 660 220, 520 220, 470 214 L 430 262 L 420 214 C 300 216, 120 214, 40 206 C 12 200, 4 180, 2 120 C 0 60, 8 34, 40 30 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
        </svg>
        <div style={{ position: "relative", height: 220, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.type, fontStyle: "italic", fontSize: 54, color: C.ink, textAlign: "center", padding: "0 40px" }}>
          {s.quote}
        </div>
      </div>
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {[260, 540, 820].map((x, k) => (
          <PanelHead key={k} x={x} start={2 + k * 4} awake={awake} k={k} />
        ))}
        {/* zzz over the middle one */}
        <g opacity={zz * prog(f, 12, 20)}>
          <text x={600} y={700 - (f % 40) * 0.6} fontFamily={F_PAPER.sans} fontWeight={600} fontSize={40} fill={C.inkSoft}>z</text>
          <text x={636} y={660 - (f % 40) * 0.6} fontFamily={F_PAPER.sans} fontWeight={600} fontSize={30} fill={C.inkSoft}>z</text>
        </g>
        {/* the pen flies up */}
        {f > wakeAt && (
          <g transform={`translate(${880 + pen * 40} ${1010 - Math.sin(pen * Math.PI) * 220}) rotate(${pen * 300})`}>
            <path d="M-40 0 L 40 0" stroke={C.ink} strokeWidth={9} strokeLinecap="round" />
            <path d="M40 0 L 52 0" stroke={C.orange} strokeWidth={9} strokeLinecap="round" />
          </g>
        )}
        {/* the table, seen from the actor's side */}
        <Ink d="M70 1050 C 380 1044, 700 1054, 1010 1046 L 1000 1086 C 700 1092, 380 1088, 80 1090 Z" start={0} dur={18} w={6} fill={PAPER_FILL} />
        <Ink d="M130 1090 L 130 1180 M950 1088 L 950 1180" start={10} dur={10} w={6} />
        {/* coffee cups and paper on the table */}
        <Ink d="M330 1048 L 334 1006 L 376 1006 L 380 1048" start={14} dur={10} w={4} />
        <Ink d="M600 1046 L 700 1040 L 704 1048" start={16} dur={8} w={4} />
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1210 }}>
        <Rise at={wakeAt + 10}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={wakeAt + 24} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Pencil speed streaks that sweep across while the camera moves. */
const Streaks: React.FC<{ seed: number }> = ({ seed }) => {
  const f = useCurrentFrame();
  const rows = [0, 1, 2, 3, 4, 5, 6].map((k) => {
    const r = Math.sin((seed + 1) * 97.3 + k * 13.7) * 0.5 + 0.5;
    const y = 260 + k * 220 + r * 90;
    const w = 3 + Math.round(r * 5);
    const len = 0.45 + r * 0.4;
    const delay = Math.round(r * 5);
    const d = `M1180 ${y} C 900 ${y - 8 + r * 16}, 500 ${y + 10 - r * 20}, -100 ${y + 4}`;
    return { d, w, len, delay, orange: k === 2 + (seed % 3) };
  });
  return (
    <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
      {rows.map((r, i) => {
        const p = interpolate(f - r.delay, [0, T + 2], [0, 1 + r.len], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const head = Math.min(1, p);
        const tail = Math.max(0, p - r.len);
        if (head <= tail) return null;
        const total = 1400;
        return (
          <path
            key={i}
            d={r.d}
            fill="none"
            stroke={r.orange ? C.orange : C.ink}
            strokeOpacity={r.orange ? 0.7 : 0.4}
            strokeWidth={r.w}
            strokeLinecap="round"
            pathLength={total}
            strokeDasharray={`${(head - tail) * total} ${total * 2}`}
            strokeDashoffset={-tail * total}
          />
        );
      })}
    </svg>
  );
};

// ---------- one continuous sheet: the camera slides from scene to scene ----------

/** One ink thread along the bottom of the whole sheet, drawing ahead of the camera,
 * with a little loop at every scene boundary. It ties the scenes into one take. */
const Thread: React.FC<{ slots: number; cam: number }> = ({ slots, cam }) => {
  const y = 1810;
  let d = `M-60 ${y}`;
  for (let k = 0; k < slots; k++) {
    const x0 = k * 1080;
    // a soft wave through the scene
    d += ` C ${x0 + 200} ${y - 22}, ${x0 + 420} ${y + 22}, ${x0 + 620} ${y}`;
    d += ` C ${x0 + 760} ${y - 16}, ${x0 + 900} ${y + 14}, ${x0 + 1010} ${y}`;
    if (k < slots - 1) {
      const bx = x0 + 1080;
      // the loop at the boundary
      d += ` C ${bx + 40} ${y - 6}, ${bx + 70} ${y - 70}, ${bx + 30} ${y - 90}`;
      d += ` C ${bx - 10} ${y - 108}, ${bx - 50} ${y - 60}, ${bx - 10} ${y - 30}`;
      d += ` C ${bx + 20} ${y - 6}, ${bx + 50} ${y + 2}, ${bx + 70} ${y}`;
    }
  }
  d += ` L ${slots * 1080 + 80} ${y}`;
  const totalW = slots * 1080 + 140;
  const head = Math.min(1, Math.max(0, (cam + 860 + 60) / totalW));
  const L = 10000;
  return (
    <svg
      viewBox={`0 0 ${totalW} 1920`}
      style={{ position: "absolute", left: 0, top: 0, width: totalW, height: 1920, transform: `translateX(${-cam}px)` }}
    >
      <path
        d={d}
        fill="none"
        stroke={C.ink}
        strokeOpacity={0.55}
        strokeWidth={5}
        strokeLinecap="round"
        pathLength={L}
        strokeDasharray={`${head * L} ${L}`}
      />
    </svg>
  );
};

export const StoryVideo: React.FC<{ spec: StorySpec }> = ({ spec }) => {
  applyLook(spec.look ?? "paper");
  const frame = useCurrentFrame();
  const starts: number[] = [];
  let acc = 0;
  for (const sc of spec.scenes) {
    starts.push(acc);
    acc += Math.round(sc.seconds * FPS);
  }
  // Phone shots that follow another phone shot stay in place (screen swap), no camera move.
  const moves = spec.scenes.map((sc, i) => i > 0 && !(sc.type === "phone" && spec.scenes[i - 1].type === "phone"));
  const slot: number[] = [];
  spec.scenes.forEach((_, i) => slot.push(i === 0 ? 0 : slot[i - 1] + (moves[i] ? 1 : 0)));
  let cam = 0;
  spec.scenes.forEach((_, i) => {
    if (i > 0 && moves[i]) cam += prog(frame, starts[i] - T, starts[i]);
  });
  // gentle sway so the camera is never fully parked
  const sway = 26 * Math.sin(frame / 38);
  const camEase = cam * 1080 + sway;
  const slots = slot[slot.length - 1] + 1;

  const renderScene = (sc: StoryScene, i: number) => {
    const firstPhone = sc.type === "phone" && !(i > 0 && spec.scenes[i - 1].type === "phone");
    return sc.type === "night" ? <NightScene s={sc} /> :
      sc.type === "books" ? <BooksScene s={sc} /> :
      sc.type === "thinking" ? <ThinkingScene s={sc} /> :
      sc.type === "email" ? <EmailScene s={sc} /> :
      sc.type === "phone" ? <PhoneScene s={sc} first={firstPhone} /> :
      sc.type === "notify" ? <NotifyScene s={sc} /> :
      sc.type === "stage" ? <StageScene s={sc} /> :
      sc.type === "lobby" ? <LobbyScene s={sc} /> :
      sc.type === "panel" ? <PanelScene s={sc} /> :
      <EndScene s={sc} />;
  };

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <Paper />
      {spec.music && <Audio src={staticFile(`music/${spec.id}.wav`)} volume={spec.music.volume ?? 0.42} />}
      {(spec.voice?.lines ?? []).filter((l) => l.audio).map((l, i) => (
        <Sequence key={`vo${i}`} from={Math.round(l.at * FPS)} layout="none">
          <Audio src={staticFile(l.audio!)} volume={spec.voice?.volume ?? 1} />
        </Sequence>
      ))}
      <Thread slots={slots} cam={camEase} />
      {spec.scenes.map((sc, i) => {
        const frames = Math.round(sc.seconds * FPS);
        const x = slot[i] * 1080 - camEase;
        return (
          <React.Fragment key={i}>
            {moves[i] && <Sfx name="slide" at={starts[i] - T} vol={0.28} />}
            {moves[i] && (
              <Sequence from={starts[i] - T - 2} durationInFrames={T + 14}>
                <Streaks seed={i} />
              </Sequence>
            )}
            <Sequence
              from={i === 0 ? -PREROLL : moves[i] ? starts[i] - T : starts[i]}
              durationInFrames={frames + (moves[i] ? T : 0) + (i === 0 ? PREROLL : 0)}
            >
              <AbsoluteFill style={{ transform: `translateX(${x}px)` }}>{renderScene(sc, i)}</AbsoluteFill>
            </Sequence>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
