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
  Object.assign(F, F_PAPER, {});
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
/** Real Ghost Light screenshots inside the drawn phone (Canberk, 2026-11-10: the how-to half should be
 *  animated, with better transitions): each shot slides in, the camera pushes toward what matters, a
 *  drawn finger taps with a ripple. Screens are real captures from the app, never mocked. */
type Screens = {
  type: "screens";
  seconds: number;
  line: string;
  accent: string;
  shots: { src: string; at: number; tap?: { x: number; y: number; at: number }; push?: { x: number; y: number; scale?: number; from?: number };
    /** move the shot up inside the phone by this share of its height, [from, to], so a low part (the tab bar) reaches the safe area */
    pan?: [number, number] }[];
};
export type StoryScene = Screens | Night | Books | Thinking | Email | Phone | Notify | Stage | Lobby | Panel | Inbox | Bring | Runs | Kitchen | BookMode | Ten | Callback | Folder | Floor | Ready | Spiral | Rewind | Cafe | Train | Chair | End;
/** Music bed made by scripts/make_music.py into public/music/<id>.wav (render.sh runs it). */
export type StoryMusic = { style: "sunny" | "pizzicato" | "build" | "festive" | "bed" | "wood" | "beat" | "pulse"; drop?: string | number; volume?: number; seed?: string };
/** Narration (scripts/voice.py fills audio + words); `at` is seconds from the start of the video. */
export type StoryVoice = { lines: { text: string; at: number; sub?: boolean; audio?: string; dur?: number; words?: { w: string; s: number; e: number }[] }[]; volume?: number; subtitles?: boolean; take?: string; take_at?: number; takes?: { audio: string; at: number; voice?: string }[] };
export type StorySpec = { id: string; scenes: StoryScene[]; music?: StoryMusic; look?: StoryLook; voice?: StoryVoice };
export const storyFrames = (s: StorySpec) =>
  s.scenes.reduce((n, sc) => n + Math.round(sc.seconds * FPS), 0);

// ---------- primitives ----------
const ease = Easing.bezier(0.33, 0, 0.2, 1);
const prog = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

const SilentCtx = React.createContext(false);
/** A sound cue at a local frame. Skipped inside frozen pre-roll copies. */
/** Mix (Canberk, 2026-11-09: music and effects sat on top of the voice). Effects play at SFX_GAIN, and at
 *  half that while the narrator speaks; the music bed ducks to DUCK of its level under the voice. */
const SceneStartCtx = React.createContext(0);
const SFX_GAIN = 0.6;
const DUCK = 0.35;
const SpeechCtx = React.createContext<[number, number][]>([]);
const speaking = (spans: [number, number][], f: number, pad = 6) => spans.some(([a, b]) => f >= a - pad && f <= b + pad);
const Sfx: React.FC<{ name: string; at: number; vol?: number; frames?: number }> = ({ name, at, vol = 1, frames }) => {
  const silent = React.useContext(SilentCtx);
  const spans = React.useContext(SpeechCtx);
  const abs = React.useContext(SceneStartCtx) + at;
  if (silent) return null;
  const g = SFX_GAIN * (speaking(spans, abs, 2) ? 0.5 : 1);
  return (
    <Sequence from={at} durationInFrames={frames} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={vol * g} />
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
      <AbsoluteFill style={{ paddingTop: 270, alignItems: "center" }}>
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
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 270 }}>
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


const SHOT_H = Math.round(SW * 2.165); // iPhone screen proportions inside the drawn phone
const ScreensScene: React.FC<{ s: Screens; first: boolean }> = ({ s, first }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const up = first ? spring({ frame: f - 2, fps, config: { damping: 18 } }) : 1;
  const zoom = first ? 1 + (ZOOM - 1) * spring({ frame: f - 14, fps, config: { damping: 22 } }) : ZOOM;
  const shots = s.shots;
  // The push zoom of shot i at frame g, and a tap point mapped through it (so finger and ripple land on
  // the thing the push is moving toward, not where it sat before the zoom).
  const pzAt = (i: number, g: number) => {
    const sh = shots[i];
    if (!sh.push) return 1;
    const end = Math.max(sh.at + 9, shots[i + 1] ? shots[i + 1].at : sh.at + 120); // a held shot under a quick slide still needs a range
    return interpolate(g, [sh.at + 8, end], [sh.push.from ?? 1, sh.push.scale ?? 1.18], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  };
  const panAt = (i: number, g: number) => {
    const sh = shots[i];
    if (!sh.pan) return 0;
    const end = shots[i + 1] ? shots[i + 1].at : sh.at + 120;
    return interpolate(g, [sh.at + 4, Math.max(sh.at + 5, Math.min(end, sh.at + 26))], sh.pan, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  };
  const mapTap = (i: number) => {
    const sh = shots[i], t = sh.tap!, k = pzAt(i, t.at + 12);
    const ox = sh.push ? sh.push.x : 0.5, oy = sh.push ? sh.push.y : 0.5;
    return { x: ox + (t.x - ox) * k, y: oy + (t.y - oy) * k - panAt(i, t.at + 12) };
  };
  return (
    <AbsoluteFill>
      {first && <Sfx name="pop" at={6} vol={0.7} />}
      {shots.map((sh, i) => (i > 0 ? <Sfx key={`sl${i}`} name="slide" at={sh.at} vol={0.35} /> : null))}
      {shots.map((sh, i) => (sh.tap ? <Sfx key={`tp${i}`} name="boop_lo" at={sh.tap.at + 14} vol={0.55} /> : null))}
      <Glow glow={0.6} y="72%" />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 270 }}>
        <Rise at={4}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateY(${(1 - up) * 800}px) scale(${zoom})`, transformOrigin: "540px 980px" }}>
        <DrawnPhone start={first ? 0 : -100}>
          {shots.map((sh, i) => {
            const next = shots[i + 1];
            if (f < sh.at - 1 || (next && f > next.at + 12)) return null;
            const inP = i === 0 ? 1 : Easing.out(Easing.cubic)(prog(f, sh.at, sh.at + 12));
            const outP = next ? Easing.in(Easing.cubic)(prog(f, next.at, next.at + 12)) : 0;
            const end = next ? next.at : sh.at + 120;
            const pz = pzAt(i, f); void end;
            return (
              <div key={i} style={{ position: "absolute", left: 0, top: 0, width: SW, height: SHOT_H,
                transform: `translateX(${(1 - inP) * SW - outP * SW * 0.35}px)`, opacity: 1 - outP * 0.6,
                boxShadow: i > 0 && inP < 1 ? "-20px 0 40px rgba(0,0,0,0.35)" : undefined }}>
                <Img src={staticFile(sh.src)} style={{ width: SW, height: SHOT_H, objectFit: "cover",
                  transform: `translateY(${-panAt(i, f) * SHOT_H}px) scale(${pz})`, transformOrigin: sh.push ? `${sh.push.x * 100}% ${sh.push.y * 100}%` : "50% 50%" }} />
                {sh.tap && f >= sh.tap.at + 12 && f <= sh.tap.at + 40 && (() => {
                  const r = prog(f, sh.tap!.at + 12, sh.tap!.at + 34);
                  const m = mapTap(i);
                  return <div style={{ position: "absolute", left: m.x * SW - 60 * r, top: m.y * SHOT_H - 60 * r, width: 120 * r, height: 120 * r,
                    borderRadius: "50%", border: `5px solid ${C.orange}`, opacity: 1 - r }} />;
                })()}
              </div>
            );
          })}
        </DrawnPhone>
        {shots.map((sh, i) => (sh.tap ? <TapFinger key={`f${i}`} at={sh.tap.at} x={SX + mapTap(i).x * SW} y={SY + mapTap(i).y * SHOT_H} /> : null))}
      </AbsoluteFill>
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
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 270 }}>
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
      <AbsoluteFill style={{ paddingTop: 270, paddingLeft: 90 }}>
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
        {s.brand === "Ghost Light" && <div
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
        </div>}
        <div style={{ position: "relative" }}>
          <Rise at={18}>
            {/* Ghost Light, or a web brand ("ActorRise" splits into Actor / Rise), no app icon for the web */}
            {(() => {
              const b = s.brand === "Ghost Light" ? ["Ghost", "Light"] : s.brand.match(/^([A-Z][a-z]+)(.*)$/)?.slice(1, 3) ?? [s.brand, ""];
              const sz = s.brand === "Ghost Light" ? 64 : 96;
              return (<>
                <div style={{ fontFamily: F.serif, fontWeight: 600, fontSize: sz, color: C.ink, lineHeight: 1 }}>{b[0]}</div>
                <div style={{ fontFamily: F.serifI, fontStyle: "italic", fontSize: sz, color: C.orange, lineHeight: 1.05 }}>{b[1]}</div>
              </>);
            })()}
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
            {s.action.includes(" on ") ? (<>{s.action.split(" on ")[0]} <span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>on the App Store.</span></>)
              : (<span style={{ fontFamily: F.serifI, fontStyle: "italic", fontWeight: 400, color: C.orange }}>{s.action}</span>)}
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

// ---------- sides at noon: an envelope opens and the pages fly out (2026-11-10) ----------
/** A drawn envelope with a 12:00 postmark; the flap lifts and the sides fly out to the right. */
type Inbox = { type: "inbox"; seconds: number; line: string; accent: string; cue?: string; time?: string; pages?: number };
const FlyingPage: React.FC<{ at: number; k: number; x0: number; y0: number; x1: number; y1: number; label: string }> = ({ at, k, x0, y0, x1, y1, label }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, at + 26);
  if (f < at) return null;
  // a soft arc: up first, then away
  const x = x0 + (x1 - x0) * p;
  const y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * (260 + k * 60);
  const rot = (k % 2 ? 1 : -1) * (8 + 30 * p) + p * 20;
  const s = 0.6 + 0.4 * Math.min(1, p * 3);
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <rect x={-80} y={-104} width={160} height={208} rx={6} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
      <text x={0} y={-62} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={22} letterSpacing={3} fill={C.ink}>{label}</text>
      <path d="M-52 -30 L 52 -30 M-52 -4 L 40 -4 M-52 22 L 50 22 M-52 48 L 30 48" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />
      <path d="M-52 74 L 20 74" stroke={C.orange} strokeWidth={6} strokeLinecap="round" />
    </g>
  );
};
const InboxScene: React.FC<{ s: Inbox }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = s.pages ?? 3;
  const L = 200, R = 880, Tt = 720, B = 1120;
  const flapOpen = prog(f, 24, 36);
  const stamp = spring({ frame: f - 12, fps, config: { damping: 10, mass: 0.6 } });
  const flyAt = (k: number) => 36 + k * 9;
  // the envelope gives a little hop each time a page leaves
  const hop = Array.from({ length: n }, (_, k) => Math.max(0, 1 - Math.abs(f - flyAt(k)) / 4)).reduce((a, b) => Math.max(a, b), 0);
  const flapTip = Tt + (1 - flapOpen) * 210 - flapOpen * 150;
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={4} vol={0.5} />
      <Sfx name="thud" at={13} vol={0.55} />
      <Sfx name="cine/click" at={26} vol={0.5} />
      {Array.from({ length: n }, (_, k) => (
        <Sfx key={k} name={k === n - 1 ? "cine/toing" : "cine/plink"} at={flyAt(k)} vol={0.45} />
      ))}
      {s.cue && <Sfx name="typing" at={74} frames={typeFrames(s.cue)} vol={0.4} />}
      <Glow glow={0.35} y="48%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(0 ${-hop * 14})`}>
          {/* back of the envelope */}
          <Ink d={`M${L} ${Tt} L ${R} ${Tt} L ${R} ${B} L ${L} ${B} Z`} start={0} dur={20} w={6} fill="#fbf7ef" />
          {Array.from({ length: n }, (_, k) => (
            <FlyingPage key={k} at={flyAt(k)} k={k} x0={540 - 40 + k * 40} y0={Tt + 60} x1={1260 + k * 80} y1={420 + k * 160} label={k === 0 ? "SIDES" : `P. ${k + 1}`} />
          ))}
          {/* the front pocket over the pages */}
          <Ink d={`M${L} ${B} L 540 ${Tt + 210} L ${R} ${B}`} start={8} dur={14} w={5} />
          <path d={`M${L + 3} ${B - 2} L 540 ${Tt + 214} L ${R - 3} ${B - 2} Z`} fill="#fbf7ef" opacity={prog(f, 14, 22)} />
          <path d={`M${L} ${B} L 540 ${Tt + 210} L ${R} ${B}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" opacity={prog(f, 20, 22)} />
          {/* the flap lifts */}
          <path d={`M${L} ${Tt} L 540 ${flapTip} L ${R} ${Tt} Z`} fill={flapOpen > 0.5 ? "#f3ecdf" : "#fbf7ef"} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" opacity={prog(f, 16, 22)} />
        </g>
        {/* the postmark: a clock at twelve */}
        <g transform={`translate(${R - 110} ${Tt - 150}) rotate(-12) scale(${stamp})`} opacity={Math.min(1, stamp * 1.4)}>
          <circle r={86} fill="none" stroke={C.orange} strokeWidth={6} />
          <circle r={70} fill="none" stroke={C.orange} strokeWidth={3} strokeDasharray="6 8" />
          <path d="M0 0 L 0 -48 M0 0 L 0 -34" stroke={C.orange} strokeWidth={8} strokeLinecap="round" />
          <circle r={7} fill={C.orange} />
          <text y={44} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={26} letterSpacing={2} fill={C.orange}>{s.time ?? "12:00"}</text>
        </g>
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1220 }}>
        <Rise at={50}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={112} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={74} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- bring them in: the pages land in the phone, the reader's line lights ----------
type Bring = { type: "bring"; seconds: number; line: string; accent: string; cue?: string; label?: string; title?: string; partner?: string; you?: string; pages?: number };
const BringScene: React.FC<{ s: Bring }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = s.pages ?? 3;
  const X = 330, Y = 330, W = 420, H = 820;
  const body = `M${X + 60} ${Y} L ${X + W - 60} ${Y} C ${X + W - 20} ${Y}, ${X + W} ${Y + 20}, ${X + W} ${Y + 60} L ${X + W} ${Y + H - 60} C ${X + W} ${Y + H - 20}, ${X + W - 20} ${Y + H}, ${X + W - 60} ${Y + H} L ${X + 60} ${Y + H} C ${X + 20} ${Y + H}, ${X} ${Y + H - 20}, ${X} ${Y + H - 60} L ${X} ${Y + 60} C ${X} ${Y + 20}, ${X + 20} ${Y}, ${X + 60} ${Y} Z`;
  const landAt = (k: number) => 8 + k * 8 + 20;
  const lastLand = landAt(n - 1);
  const screen = prog(f, 4, 14);
  const flash = Array.from({ length: n }, (_, k) => Math.max(0, 1 - Math.abs(f - landAt(k)) / 5)).reduce((a, b) => Math.max(a, b), 0);
  const rows = prog(f, lastLand + 2, lastLand + 14);
  const lit = prog(f, lastLand + 18, lastLand + 26);
  const under = prog(f, lastLand + 34, lastLand + 46);
  // the reader's little sound wave while its line is lit
  const wave = (k: number) => 10 + Math.abs(Math.sin((f + k * 5) / 3)) * 22 * lit * (1 - under * 0.7);
  const sx = X + 18, sw = W - 36;
  return (
    <AbsoluteFill>
      {Array.from({ length: n }, (_, k) => (
        <Sfx key={k} name={k % 2 ? "boop_hi" : "pop"} at={landAt(k)} vol={0.55} />
      ))}
      <Sfx name="cine/ping" at={lastLand + 18} vol={0.5} />
      <Sfx name="pencil_short" at={lastLand + 34} vol={0.4} />
      <Sfx name="cine/tap" at={lastLand + 46} vol={0.4} />
      {s.cue && <Sfx name="typing" at={lastLand + 50} frames={typeFrames(s.cue)} vol={0.4} />}
      <Glow glow={0.5} y="38%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={body} start={0} dur={16} w={7} fill={PAPER_FILL} />
      </svg>
      <div style={{ position: "absolute", left: sx, top: Y + 18, width: sw, height: H - 36, borderRadius: 46, background: APP.bg, opacity: screen, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: sw / 2 - 50, top: 14, width: 100, height: 28, borderRadius: 14, background: "#000" }} />
        <div style={{ position: "absolute", inset: 0, background: `rgba(242,207,58,${flash * 0.1})` }} />
        <div style={{ position: "absolute", left: 34, right: 34, top: 80, opacity: rows }}>
          <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: APP.dim }}>{s.label ?? "YOUR SIDES"}</div>
          <div style={{ fontFamily: F_PAPER.serifI, fontStyle: "italic", fontSize: 34, color: APP.cream, marginTop: 6, whiteSpace: "nowrap" }}>{s.title ?? "Callback, six o'clock"}</div>
          <div style={{ height: 1, background: APP.line, margin: "22px 0 28px" }} />
          {/* the reader's line, lit */}
          <div style={{ position: "relative", borderRadius: 14, padding: "16px 16px", background: `rgba(242,207,58,${0.16 * lit})`, border: `2px solid rgba(242,207,58,${0.7 * lit})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: lit > 0.5 ? APP.yellow : APP.dim }}>{s.partner ?? "READER"}</div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", height: 34 }}>
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={k} style={{ width: 5, height: wave(k), borderRadius: 3, background: APP.yellow, opacity: lit }} />
                ))}
              </div>
            </div>
            {[0.92, 0.78, 0.6].map((w, k) => (
              <div key={k} style={{ height: 10, width: `${w * 100}%`, borderRadius: 5, background: lit > 0.5 ? "rgba(244,234,217,0.85)" : APP.line, marginTop: 14 }} />
            ))}
          </div>
          {/* your line, the cue, underlined */}
          <div style={{ padding: "26px 16px 0" }}>
            <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: APP.cream }}>{s.you ?? "YOU"}</div>
            {[0.86, 0.52].map((w, k) => (
              <div key={k} style={{ position: "relative", height: 10, width: `${w * 100}%`, borderRadius: 5, background: APP.line, marginTop: 14 }}>
                {k === 0 && <div style={{ position: "absolute", left: 0, top: 18, height: 5, width: `${under * 100}%`, borderRadius: 3, background: C.orange }} />}
              </div>
            ))}
          </div>
          <div style={{ padding: "30px 16px 0", opacity: 0.6 }}>
            <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: APP.dim }}>{s.partner ?? "READER"}</div>
            {[0.7, 0.9].map((w, k) => (
              <div key={k} style={{ height: 10, width: `${w * 100}%`, borderRadius: 5, background: APP.line, marginTop: 14 }} />
            ))}
          </div>
        </div>
      </div>
      {/* the pages arrive from the left and slip into the screen */}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: n }, (_, k) => {
          const at = 8 + k * 8;
          const p = prog(f, at, landAt(k));
          if (f < at || p >= 1) return null;
          const x = -200 + (540 + 200) * p;
          const y = 560 + k * 120 - Math.sin(p * Math.PI) * 220;
          const sc = 1 - 0.75 * p;
          return (
            <g key={k} transform={`translate(${x} ${y}) rotate(${(1 - p) * (k % 2 ? 40 : -30)}) scale(${sc})`} opacity={1 - prog(f, landAt(k) - 4, landAt(k))}>
              <rect x={-80} y={-104} width={160} height={208} rx={6} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
              <path d="M-52 -30 L 52 -30 M-52 -4 L 40 -4 M-52 22 L 50 22 M-52 48 L 30 48" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1230 }}>
        <Rise at={lastLand + 20}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={lastLand + 50} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the afternoon: a clock spins noon to six, a run ticks off each time round ----------
type Runs = { type: "runs"; seconds: number; line: string; accent: string; cue?: string; runs?: number; from?: number; to?: number };
const RunsScene: React.FC<{ s: Runs }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const runs = s.runs ?? 4;
  const from = s.from ?? 12, to = s.to ?? 18; // hours, 24h
  const cx = 540, cy = 720, r = 290;
  const spinA = 16, spinB = 16 + 92;
  const t = prog(f, spinA, spinB);
  const hours = from + (to - from) * t;
  const hourDeg = (hours % 12) * 30;
  const minDeg = (hours - from) * 360;
  const runAt = (k: number) => Math.round(spinA + ((k + 1) / runs) * (spinB - spinA));
  const settle = spring({ frame: f - spinB, fps, config: { damping: 8, mass: 0.5 } });
  const wob = f > spinB ? (1 - settle) * 6 : 0;
  const ticks = Array.from({ length: 12 }, (_, k) => {
    const a = (k * 30 * Math.PI) / 180;
    const r0 = k % 3 === 0 ? r - 46 : r - 30;
    return `M${cx + Math.sin(a) * r0} ${cy - Math.cos(a) * r0} L ${cx + Math.sin(a) * (r - 12)} ${cy - Math.cos(a) * (r - 12)}`;
  }).join(" ");
  const face = `M${cx} ${cy - r} C ${cx + r * 0.56} ${cy - r - 2}, ${cx + r + 2} ${cy - r * 0.56}, ${cx + r} ${cy} C ${cx + r - 2} ${cy + r * 0.56}, ${cx + r * 0.56} ${cy + r + 2}, ${cx} ${cy + r} C ${cx - r * 0.56} ${cy + r - 2}, ${cx - r - 2} ${cy + r * 0.56}, ${cx - r} ${cy} C ${cx - r + 2} ${cy - r * 0.56}, ${cx - r * 0.56} ${cy - r - 2}, ${cx} ${cy - r} Z`;
  const tallyX = (k: number) => 540 - ((runs - 1) * 92) / 2 + k * 92;
  const hand = (deg: number, len: number, w: number, col: string) => (
    <path d={`M${cx} ${cy + 24} L ${cx} ${cy - len}`} stroke={col} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg + wob} ${cx} ${cy})`} />
  );
  return (
    <AbsoluteFill>
      <Sfx name="cine/tick" at={spinA} vol={0.35} frames={spinB - spinA} />
      {Array.from({ length: runs }, (_, k) => (
        <Sfx key={k} name={k === runs - 1 ? "cine/toing" : "cine/ping"} at={runAt(k)} vol={0.45} />
      ))}
      {s.cue && <Sfx name="typing" at={spinB + 22} frames={typeFrames(s.cue)} vol={0.4} />}
      <Glow glow={0.4} y="38%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the clock on the wall: a nail, a face, the hands */}
        <Ink d={`M${cx} ${cy - r - 70} L ${cx - 60} ${cy - r + 6} M${cx} ${cy - r - 70} L ${cx + 60} ${cy - r + 6}`} start={0} dur={10} w={4} color={C.inkSoft} />
        <circle cx={cx} cy={cy - r - 70} r={9} fill={C.ink} opacity={prog(f, 2, 6)} />
        <Ink d={face} start={2} dur={20} w={7} fill="#fbf7ef" />
        <Ink d={ticks} start={10} dur={12} w={6} />
        {/* the afternoon sweeps round in orange behind the hands */}
        {t > 0 && (() => {
          const a0 = ((from % 12) * 30 * Math.PI) / 180, a1 = (hourDeg * Math.PI) / 180 + (hours >= 18 ? 0 : 0);
          const rr = r - 70;
          const large = hourDeg - (from % 12) * 30 > 180 ? 1 : 0;
          const x0 = cx + Math.sin(a0) * rr, y0 = cy - Math.cos(a0) * rr;
          const x1 = cx + Math.sin(a1) * rr, y1 = cy - Math.cos(a1) * rr;
          return <path d={`M${cx} ${cy} L ${x0} ${y0} A ${rr} ${rr} 0 ${large} 1 ${x1} ${y1} Z`} fill="rgba(232,121,43,0.16)" />;
        })()}
        <g opacity={prog(f, 14, 20)}>
          {hand(minDeg, r - 64, 8, C.ink)}
          {hand(hourDeg, r - 130, 13, C.orange)}
          <circle cx={cx} cy={cy} r={16} fill={C.ink} />
        </g>
        {/* one tally mark per run with the reader */}
        {Array.from({ length: runs }, (_, k) => (
          <Ink key={k} d={`M${tallyX(k) - 6} 1110 C ${tallyX(k) - 2} 1150, ${tallyX(k) + 4} 1190, ${tallyX(k) + 6} 1230`} start={runAt(k) - 4} dur={6} w={12} color={k === runs - 1 ? C.orange : C.ink} />
        ))}
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1290 }}>
        <Rise at={spinB + 6}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={spinB + 22} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};


// ---------- 2026-11-12: the kitchen table, the cancelled partner, Script · Cues · Off book, ten o'clock ----------
/** A mug in ink: body, handle, optional steam. (x, y) is the bottom centre. */
const Mug: React.FC<{ x: number; y: number; start: number; steam?: number; flip?: boolean }> = ({ x, y, start, steam = 1, flip }) => {
  const f = useCurrentFrame();
  const s = flip ? -1 : 1;
  const body = `M${x - 62} ${y - 150} L ${x + 62} ${y - 150} L ${x + 54} ${y - 10} C ${x + 52} ${y + 2}, ${x + 44} ${y + 6}, ${x + 34} ${y + 6} L ${x - 34} ${y + 6} C ${x - 44} ${y + 6}, ${x - 52} ${y + 2}, ${x - 54} ${y - 10} Z`;
  const handle = `M${x + s * 60} ${y - 120} C ${x + s * 120} ${y - 124}, ${x + s * 118} ${y - 40}, ${x + s * 56} ${y - 44}`;
  return (
    <>
      <Ink d={body} start={start} dur={14} w={6} fill="#fbf7ef" />
      <Ink d={handle} start={start + 8} dur={8} w={6} />
      {[0, 1].map((k) => {
        const sx = x - 20 + k * 40;
        const wob = Math.sin((f + k * 20) / 8) * 10;
        const d = `M${sx} ${y - 172} C ${sx + 20 + wob} ${y - 200}, ${sx - 20 - wob} ${y - 230}, ${sx + wob * 0.5} ${y - 262}`;
        return <path key={k} d={d} fill="none" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" opacity={steam * prog(f, start + 16, start + 26) * (0.6 + 0.4 * Math.sin((f + k * 13) / 10))} />;
      })}
    </>
  );
};

/** The script on the table: a few pages, slightly fanned. */
const Pages: React.FC<{ x: number; y: number; start: number; label?: string }> = ({ x, y, start, label = "SCENE" }) => {
  const f = useCurrentFrame();
  const o = prog(f, start, start + 10);
  return (
    <g opacity={o} transform={`translate(0 ${(1 - o) * 20})`}>
      {[-6, 3].map((r, k) => (
        <g key={k} transform={`rotate(${r} ${x} ${y - 30})`}>
          <path d={`M${x - 120} ${y - 26} L ${x + 120} ${y - 26} L ${x + 132} ${y + 2} L ${x - 132} ${y + 2} Z`} fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
        </g>
      ))}
      <path d={`M${x - 110} ${y - 30} L ${x + 110} ${y - 30} L ${x + 124} ${y} L ${x - 124} ${y} Z`} fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <text x={x} y={y - 8} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={20} letterSpacing={4} fill={C.ink}>{label}</text>
    </g>
  );
};

type Kitchen = { type: "kitchen"; seconds: number; line: string; accent: string; cue?: string; text: string; buzzAt?: number; slideAt?: number };
const KitchenScene: React.FC<{ s: Kitchen }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const buzzAt = s.buzzAt ?? 66, slideAt = s.slideAt ?? 112;
  const TY = 1010; // table top
  const buzz = f >= buzzAt && f < buzzAt + 26 ? Math.sin(f * 2.6) * 7 * (f < buzzAt + 10 || f > buzzAt + 14 ? 1 : 0) : 0;
  const bub = spring({ frame: f - (buzzAt + 6), fps, config: { damping: 11, mass: 0.6 } });
  const slide = prog(f, slideAt, slideAt + 18);
  const bx = 780 + slide * 520;
  return (
    <AbsoluteFill>
      <Sfx name="cine/tap" at={18} vol={0.35} />
      <Sfx name="boop_lo" at={buzzAt} vol={0.55} />
      <Sfx name="boop_lo" at={buzzAt + 14} vol={0.55} />
      <Sfx name="pop" at={buzzAt + 6} vol={0.55} />
      <Sfx name="slide" at={slideAt} vol={0.5} />
      {s.cue && <Sfx name="typing" at={slideAt + 22} frames={typeFrames(s.cue)} vol={0.4} />}
      <Glow glow={0.35} y="44%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the pendant lamp over the table */}
        <Ink d="M540 0 L 540 300" start={0} dur={8} w={4} color={C.inkSoft} />
        <Ink d="M470 360 C 470 300, 610 300, 610 360 Z" start={4} dur={10} w={6} fill="#fbf7ef" />
        <circle cx={540} cy={372} r={14} fill={C.orange} opacity={prog(f, 12, 18)} />
        {/* the table */}
        <Ink d={`M60 ${TY} L 1020 ${TY}`} start={2} dur={14} w={7} />
        <Ink d={`M60 ${TY + 30} L 1020 ${TY + 30}`} start={8} dur={14} w={4} color={C.inkSoft} />
        <Ink d={`M140 ${TY + 30} L 150 ${TY + 200} M940 ${TY + 30} L 930 ${TY + 200}`} start={12} dur={10} w={6} />
        <Pages x={520} y={TY} start={22} label="SCENE 4" />
        <Mug x={260} y={TY} start={14} />
        <g transform={`translate(${bx - 780} 0) rotate(${slide * 6} 780 ${TY})`}>
          <Mug x={780} y={TY} start={18} steam={1 - prog(f, slideAt - 10, slideAt)} flip />
        </g>
        {/* the phone face up on the table, buzzing */}
        <g transform={`translate(${buzz} 0)`}>
          <path d={`M600 ${TY - 4} L 720 ${TY - 4} L 734 ${TY - 26} L 586 ${TY - 26} Z`} fill={APP.bg} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" opacity={prog(f, 26, 32)} />
          {f >= buzzAt && f < buzzAt + 26 && (
            <path d={`M570 ${TY - 50} L 556 ${TY - 66} M750 ${TY - 50} L 764 ${TY - 66} M660 ${TY - 46} L 660 ${TY - 70}`} stroke={C.orange} strokeWidth={5} strokeLinecap="round" />
          )}
        </g>
        {/* the text, in a bubble */}
        <g transform={`translate(660 ${TY - 120}) scale(${Math.max(0, bub)}) translate(-660 ${-(TY - 120)})`} opacity={Math.min(1, Math.max(0, bub) * 1.4)}>
          <path d={`M330 ${TY - 330} L 990 ${TY - 330} C 1012 ${TY - 330}, 1020 ${TY - 320}, 1020 ${TY - 300} L 1020 ${TY - 190} C 1020 ${TY - 170}, 1012 ${TY - 160}, 990 ${TY - 160} L 700 ${TY - 160} L 668 ${TY - 112} L 652 ${TY - 160} L 330 ${TY - 160} C 308 ${TY - 160}, 300 ${TY - 170}, 300 ${TY - 190} L 300 ${TY - 300} C 300 ${TY - 320}, 308 ${TY - 330}, 330 ${TY - 330} Z`} fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <text x={660} y={TY - 228} textAnchor="middle" fontFamily={F.type} fontStyle="italic" fontSize={46} fill={C.ink}>{s.text}</text>
        </g>
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1240 }}>
        <Rise at={buzzAt + 20}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={112} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={slideAt + 22} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The phone: the partner's line always shown, yours fades from Script to Cues to Off book; "line?" gives the next words. */
type BookMode = { type: "book"; seconds: number; line: string; accent: string; cue?: string; cuesAt?: number; offAt?: number; askAt?: number; ask?: string; partner?: string; you?: string };
const BookScene: React.FC<{ s: BookMode }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cuesAt = s.cuesAt ?? 70, offAt = s.offAt ?? 110, askAt = s.askAt ?? 150;
  const X = 300, Y = 250, W = 480, H = 900;
  const body = `M${X + 64} ${Y} L ${X + W - 64} ${Y} C ${X + W - 20} ${Y}, ${X + W} ${Y + 20}, ${X + W} ${Y + 64} L ${X + W} ${Y + H - 64} C ${X + W} ${Y + H - 20}, ${X + W - 20} ${Y + H}, ${X + W - 64} ${Y + H} L ${X + 64} ${Y + H} C ${X + 20} ${Y + H}, ${X} ${Y + H - 20}, ${X} ${Y + H - 64} L ${X} ${Y + 64} C ${X} ${Y + 20}, ${X + 20} ${Y}, ${X + 64} ${Y} Z`;
  const screen = prog(f, 4, 14);
  const mode = f < cuesAt ? 0 : f < offAt ? 1 : 2;
  // the pill under the active tab slides
  const tabX = interpolate(prog(f, cuesAt, cuesAt + 8) + prog(f, offAt, offAt + 8), [0, 1, 2], [0, 1, 2]);
  const lit = prog(f, 16, 24) * (1 - prog(f, cuesAt - 6, cuesAt));
  const wave = (k: number) => 8 + Math.abs(Math.sin((f + k * 5) / 3)) * 20 * lit;
  // your words: three rows of word widths (px). Cues keeps the first two words of the first row.
  const rows = [[70, 46, 92, 58], [84, 40, 66, 96], [56, 88, 50]];
  const flat = rows.flatMap((r, ri) => r.map((w, wi) => ({ w, ri, wi })));
  const giveFrom = 0, giveN = 3; // "line?" gives the first three words
  const giveAt = (k: number) => askAt + 12 + k * 5;
  const sayAt = (k: number) => askAt + 36 + (k - giveN) * 4;
  const ask = spring({ frame: f - askAt, fps, config: { damping: 11, mass: 0.6 } });
  const sx = X + 20, sw = W - 40;
  const TABS = ["Script", "Cues", "Off book"];
  return (
    <AbsoluteFill>
      <Sfx name="cine/ping" at={16} vol={0.4} />
      <Sfx name="cine/switch" at={cuesAt} vol={0.55} />
      <Sfx name="cine/switch" at={offAt} vol={0.55} />
      <Sfx name="pop" at={askAt} vol={0.45} />
      {Array.from({ length: giveN }, (_, k) => <Sfx key={k} name="cine/plink" at={giveAt(k)} vol={0.4} />)}
      <Sfx name="cine/toing" at={sayAt(flat.length - 1) + 4} vol={0.45} />
      {s.cue && <Sfx name="typing" at={offAt + 10} frames={typeFrames(s.cue)} vol={0.4} />}
      <Glow glow={0.5} y="36%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={body} start={0} dur={16} w={7} fill={PAPER_FILL} />
      </svg>
      <div style={{ position: "absolute", left: sx, top: Y + 20, width: sw, height: H - 40, borderRadius: 48, background: APP.bg, opacity: screen, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: sw / 2 - 52, top: 14, width: 104, height: 28, borderRadius: 14, background: "#000" }} />
        {/* Script · Cues · Off book */}
        <div style={{ position: "absolute", left: 26, right: 26, top: 72, height: 62, borderRadius: 31, border: `2px solid ${APP.line}` }}>
          <div style={{ position: "absolute", top: 4, bottom: 4, left: `calc(4px + ${tabX} * (100% - 8px) / 3)`, width: "calc((100% - 8px) / 3)", borderRadius: 27, background: C.orange }} />
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            {TABS.map((t, k) => (
              <div key={t} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 23, color: k === mode ? "#1b120c" : APP.dim, whiteSpace: "nowrap" }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, top: 178 }}>
          {/* the partner's line: always shown, read aloud */}
          <div style={{ borderRadius: 14, padding: "16px 16px", background: `rgba(242,207,58,${0.16 * lit})`, border: `2px solid rgba(242,207,58,${0.7 * lit})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: lit > 0.5 ? APP.yellow : APP.dim }}>{s.partner ?? "PARTNER"}</div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", height: 30 }}>
                {[0, 1, 2, 3, 4].map((k) => <div key={k} style={{ width: 5, height: wave(k), borderRadius: 3, background: APP.yellow, opacity: lit }} />)}
              </div>
            </div>
            {[0.94, 0.72].map((w, k) => <div key={k} style={{ height: 11, width: `${w * 100}%`, borderRadius: 5, background: "rgba(244,234,217,0.8)", marginTop: 14 }} />)}
          </div>
          {/* your line */}
          <div style={{ padding: "34px 16px 0" }}>
            <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: APP.cream }}>{s.you ?? "YOU"}</div>
            {rows.map((r, ri) => (
              <div key={ri} style={{ display: "flex", gap: 12, marginTop: 18 }}>
                {r.map((w, wi) => {
                  const k = flat.findIndex((q) => q.ri === ri && q.wi === wi);
                  const given = k >= giveFrom && k < giveFrom + giveN && f >= giveAt(k);
                  const said = k >= giveN && f >= sayAt(k);
                  const shown = mode === 0 || (mode === 1 && ri === 0 && wi < 2) || given || said;
                  const pop = given ? spring({ frame: f - giveAt(k), fps, config: { damping: 9, mass: 0.4 } }) : 1;
                  return (
                    <div key={wi} style={{ width: w * 1.15, height: 22, borderRadius: 6,
                      background: given ? C.orange : shown ? "rgba(244,234,217,0.85)" : "transparent",
                      border: shown || given ? "none" : `2px dashed ${APP.line}`,
                      transform: `scale(${given ? 0.6 + 0.4 * pop : 1})` }} />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ padding: "40px 16px 0", opacity: 0.55 }}>
            <div style={{ fontFamily: F_PAPER.sans, fontWeight: 600, fontSize: 18, letterSpacing: 3, color: APP.dim }}>{s.partner ?? "PARTNER"}</div>
            {[0.8, 0.6].map((w, k) => <div key={k} style={{ height: 11, width: `${w * 100}%`, borderRadius: 5, background: "rgba(244,234,217,0.55)", marginTop: 14 }} />)}
          </div>
        </div>
      </div>
      {/* the whisper, outside the phone */}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(190 690) scale(${Math.max(0, ask)}) translate(-190 -690)`} opacity={Math.min(1, Math.max(0, ask) * 1.4) * (1 - prog(f, askAt + 60, askAt + 72))}>
          <path d="M80 600 C 60 600, 52 610, 52 630 L 52 700 C 52 720, 60 730, 80 730 L 220 730 L 282 778 L 250 730 L 270 730 C 290 730, 298 720, 298 700 L 298 630 C 298 610, 290 600, 270 600 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <text x={175} y={682} textAnchor="middle" fontFamily={F.type} fontStyle="italic" fontSize={50} fill={C.ink}>{s.ask ?? "line?"}</text>
        </g>
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1230 }}>
        <Rise at={cuesAt - 10}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={92} />
        </Rise>
        <div style={{ height: 14 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={offAt + 10} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Back at the table at ten: one mug, the phone propped against it, the clock clicks over, a stamp on the script. */
type Ten = { type: "ten"; seconds: number; line: string; accent: string; cue?: string; stamp?: string; tickAt?: number };
const TenScene: React.FC<{ s: Ten }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tickAt = s.tickAt ?? 34;
  const TY = 1010, cx = 540, cy = 470, r = 190;
  // 9:58, 9:59, 10:00: the minute hand clicks twice
  const mins = 58 + (f >= tickAt - 16 ? 1 : 0) + (f >= tickAt ? 1 : 0);
  const kick = (at: number) => (f >= at ? (1 - spring({ frame: f - at, fps, config: { damping: 7, mass: 0.4 } })) * 5 : 0);
  const minDeg = mins * 6 + kick(tickAt - 16) + kick(tickAt);
  const hourDeg = (9 + mins / 60) * 30;
  const stamp = spring({ frame: f - (tickAt + 14), fps, config: { damping: 10, mass: 0.6 } });
  const face = `M${cx} ${cy - r} C ${cx + r * 0.56} ${cy - r - 2}, ${cx + r + 2} ${cy - r * 0.56}, ${cx + r} ${cy} C ${cx + r - 2} ${cy + r * 0.56}, ${cx + r * 0.56} ${cy + r + 2}, ${cx} ${cy + r} C ${cx - r * 0.56} ${cy + r - 2}, ${cx - r - 2} ${cy + r * 0.56}, ${cx - r} ${cy} C ${cx - r + 2} ${cy - r * 0.56}, ${cx - r * 0.56} ${cy - r - 2}, ${cx} ${cy - r} Z`;
  const ticks = Array.from({ length: 12 }, (_, k) => {
    const a = (k * 30 * Math.PI) / 180;
    const r0 = k % 3 === 0 ? r - 34 : r - 22;
    return `M${cx + Math.sin(a) * r0} ${cy - Math.cos(a) * r0} L ${cx + Math.sin(a) * (r - 10)} ${cy - Math.cos(a) * (r - 10)}`;
  }).join(" ");
  const hand = (deg: number, len: number, w: number, col: string) => (
    <path d={`M${cx} ${cy + 18} L ${cx} ${cy - len}`} stroke={col} strokeWidth={w} strokeLinecap="round" transform={`rotate(${deg} ${cx} ${cy})`} />
  );
  return (
    <AbsoluteFill>
      <Sfx name="cine/tick" at={tickAt - 16} vol={0.5} />
      <Sfx name="cine/tick" at={tickAt} vol={0.55} />
      <Sfx name="thud" at={tickAt + 15} vol={0.7} />
      <Sfx name="cine/toing" at={tickAt + 18} vol={0.4} />
      {s.cue && <Sfx name="typing" at={tickAt + 34} frames={typeFrames(s.cue)} vol={0.4} />}
      <Glow glow={0.5} y="58%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={face} start={0} dur={16} w={7} fill="#fbf7ef" />
        <Ink d={ticks} start={8} dur={10} w={5} />
        <g opacity={prog(f, 10, 16)}>
          {hand(hourDeg, r - 90, 12, C.orange)}
          {hand(minDeg, r - 44, 7, C.ink)}
          <circle cx={cx} cy={cy} r={13} fill={C.ink} />
        </g>
        <Ink d={`M60 ${TY} L 1020 ${TY}`} start={2} dur={12} w={7} />
        <Ink d={`M60 ${TY + 30} L 1020 ${TY + 30}`} start={6} dur={12} w={4} color={C.inkSoft} />
        <Mug x={300} y={TY} start={8} steam={0.5} />
        {/* the phone propped against the mug, screen glowing */}
        <g opacity={prog(f, 12, 20)} transform={`rotate(-10 430 ${TY})`}>
          <rect x={380} y={TY - 236} width={124} height={232} rx={18} fill={APP.bg} stroke={C.ink} strokeWidth={5} />
          <rect x={396} y={TY - 214} width={92} height={10} rx={5} fill={C.orange} />
          <rect x={396} y={TY - 190} width={70} height={8} rx={4} fill="rgba(244,234,217,0.7)" />
          <rect x={396} y={TY - 172} width={84} height={8} rx={4} fill="rgba(244,234,217,0.7)" />
        </g>
        <Pages x={720} y={TY} start={14} label="SCENE 4" />
        {/* the stamp lands on the script */}
        <g transform={`translate(720 ${TY - 110}) rotate(-10) scale(${f < tickAt + 14 ? 0 : 2 - stamp})`} opacity={f < tickAt + 14 ? 0 : Math.min(1, stamp * 1.5)}>
          <rect x={-150} y={-46} width={300} height={92} rx={12} fill="rgba(251,247,239,0.9)" stroke={C.orange} strokeWidth={7} />
          <text x={0} y={18} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={50} letterSpacing={5} fill={C.orange}>{s.stamp ?? "OFF BOOK"}</text>
        </g>
      </svg>
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 1240 }}>
        <Rise at={tickAt + 6}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={112} />
        </Rise>
        <div style={{ height: 18 }} />
        {s.cue && <Cue text={s.cue} color={C.orange} at={tickAt + 34} />}
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


// ---------- the funny callback: a laptop email, a folder of tragedies, the floor (2026-11-14) ----------
/** A drawn face that gets more desperate: panic 0..1 adds sweat drops, wide eyes and a wobbly mouth;
 *  hope 0..1 turns it into a grin (lit by a phone). */
const Face: React.FC<{ x: number; y: number; r?: number; panic?: number; hope?: number; tilt?: number; start?: number }> = ({ x, y, r = 78, panic = 0, hope = 0, tilt = 0, start = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - start, fps, config: { damping: 12, mass: 0.6 } });
  if (f < start) return null;
  const k = r / 78;
  const eye = 6 + panic * 6 - hope * 1;
  const drops = Math.round(panic * 3);
  const shake = panic > 0.6 ? Math.sin(f * 1.9) * 3 * panic : 0;
  return (
    <g transform={`translate(${x + shake} ${y}) rotate(${tilt}) scale(${k * pop})`}>
      <circle cx={0} cy={0} r={78} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
      {/* hair */}
      <path d="M-74 -18 C -70 -80, 60 -96, 76 -24 C 50 -52, -20 -60, -74 -18 Z" fill={C.ink} />
      {/* brows: up in panic, relaxed in hope */}
      <path d={`M-40 ${-26 - panic * 12} L -14 ${-30 - panic * 4 + hope * 4} M14 ${-30 - panic * 4 + hope * 4} L 40 ${-26 - panic * 12}`} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
      <circle cx={-26} cy={-4} r={eye} fill={C.ink} />
      <circle cx={26} cy={-4} r={eye} fill={C.ink} />
      {hope > 0.5 ? (
        <path d="M-30 26 C -14 52, 14 52, 30 26 Z" fill={C.ink} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      ) : panic > 0.3 ? (
        <path d={`M-28 38 C -18 ${28 + Math.sin(f / 2) * 4}, -8 ${46 - Math.sin(f / 2) * 4}, 0 36 C 8 ${28 + Math.sin(f / 2) * 4}, 18 ${46 - Math.sin(f / 2) * 4}, 28 36`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      ) : (
        <path d="M-22 30 C -8 40, 8 40, 22 30" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      )}
      {Array.from({ length: drops }, (_, i) => {
        const dy = ((f * 1.4 + i * 17) % 40);
        return <path key={i} d={`M${86 + i * 16} ${-40 + i * 26 + dy} c -8 12, -8 22, 0 22 c 8 0, 8 -10, 0 -22 Z`} fill="#bfe3f2" stroke={C.ink} strokeWidth={3} />;
      })}
    </g>
  );
};

/** The callback email arrives on a drawn laptop; the key word gets circled; you peek over the lid. */
type Callback = { type: "callback"; seconds: number; line: string; accent: string; cue?: string; from: string; subject: string; body: string; mark?: string };
const CallbackScene: React.FC<{ s: Callback }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = 190, R = 890, Tt = 600, B = 1040;
  const ping = spring({ frame: f - 14, fps, config: { damping: 9, mass: 0.5 } });
  const bodyAt = 30;
  const lines = s.body.split("\n");
  const shown = Math.max(0, Math.floor((f - bodyAt) / 0.7));
  const bodyLen = s.body.replace(/\n/g, "").length;
  const markAt = Math.round(bodyAt + bodyLen * 0.7 + 4);
  let used = 0;
  return (
    <AbsoluteFill>
      <Sfx name="chime" at={14} vol={0.7} />
      <Sfx name="typing" at={bodyAt} frames={Math.ceil(bodyLen * 0.7)} vol={0.4} />
      <Sfx name="pencil_short" at={markAt} vol={0.5} />
      <Sfx name="cine/toing" at={markAt + 8} vol={0.45} />
      {s.cue && <Sfx name="boop_hi" at={markAt + 18} vol={0.5} />}
      <Glow glow={0.45} y="42%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the laptop: lid, screen, base on a desk */}
        <Ink d={`M${L} ${Tt + 20} C ${L} ${Tt}, ${L + 10} ${Tt - 4}, ${L + 30} ${Tt - 4} L ${R - 30} ${Tt - 2} C ${R - 10} ${Tt - 2}, ${R} ${Tt + 8}, ${R} ${Tt + 26} L ${R + 2} ${B} L ${L - 2} ${B + 2} Z`} start={0} dur={20} w={6} fill="#fbf7ef" />
        <Ink d={`M${L - 70} ${B + 2} L ${R + 70} ${B} L ${R + 30} ${B + 46} L ${L - 30} ${B + 48} Z`} start={10} dur={14} w={6} fill={PAPER_FILL} />
        <Ink d={`M60 ${B + 50} C 380 ${B + 46}, 700 ${B + 54}, 1020 ${B + 48}`} start={14} dur={14} w={4} color={C.inkSoft} />
        <Ink d={`M${L + 40} ${Tt + 150} C ${L + 260} ${Tt + 146}, ${R - 260} ${Tt + 154}, ${R - 40} ${Tt + 150}`} start={20} dur={10} w={3} color={C.inkSoft} />
        <circle cx={R - 50} cy={Tt + 46} r={18 * ping} fill={C.orange} stroke={C.ink} strokeWidth={ping > 0.05 ? 4 : 0} />
        {/* the circle around the key word */}
        {s.mark && <Ink d="M628 802 C 678 776, 808 778, 824 820 C 838 862, 738 892, 668 886 C 598 880, 578 850, 600 822 C 614 806, 638 798, 668 794" start={markAt} dur={12} w={6} color={C.orange} />}
        {/* you, peeking over the lid */}
        <Face x={150} y={1180} r={78} panic={prog(f, markAt + 6, markAt + 30) * 0.75} start={markAt - 6} tilt={-8} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 280 }}>
        <Rise at={8}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: L + 40, top: Tt + 30, width: R - L - 120 }}>
        <Rise at={16}>
          <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 24, letterSpacing: 3, color: C.inkSoft }}>{s.from}</div>
          <div style={{ fontFamily: F.serifI, fontStyle: "italic", fontSize: 44, color: C.ink, lineHeight: 1.15 }}>{s.subject}</div>
        </Rise>
      </div>
      <div style={{ position: "absolute", left: L + 70, top: Tt + 200, width: R - L - 120 }}>
        {lines.map((l, i) => {
          const from = used;
          used += l.length;
          const vis = l.slice(0, Math.max(0, Math.min(l.length, shown - from)));
          return (
            <div key={i} style={{ fontFamily: F.type, fontStyle: "italic", fontSize: 58, color: C.ink, lineHeight: "92px", minHeight: 92 }}>{vis}</div>
          );
        })}
      </div>
      {s.cue && (
        <div style={{ position: "absolute", left: 300, right: 60, top: 1210 }}>
          <Cue text={s.cue} color={C.orange} at={markAt + 18} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Your folder of speeches: the page flips, and flips, and every one gets a TRAGIC stamp. */
type FolderPage = { name: string; play: string; quote: string; icon: "blood" | "river" | "skull" | "dagger" };
type Folder = { type: "folder"; seconds: number; line: string; accent: string; cue?: string; pages: FolderPage[]; stamp?: string; every?: number; first?: number; flips?: number[] };
const PageIcon: React.FC<{ icon: FolderPage["icon"]; x: number; y: number }> = ({ icon, x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    {icon === "blood" && <g><path d="M0 -50 C -30 -6, -36 14, -36 26 C -36 48, -18 60, 0 60 C 18 60, 36 48, 36 26 C 36 14, 30 -6, 0 -50 Z" fill="#c8402a" stroke={C.ink} strokeWidth={5} /><path d="M54 30 c -8 12, -8 20, 0 20 c 8 0, 8 -8, 0 -20 Z" fill="#c8402a" stroke={C.ink} strokeWidth={4} /></g>}
    {icon === "river" && <g><path d="M-80 30 C -60 14, -40 46, -20 30 C 0 14, 20 46, 40 30 C 60 14, 80 46, 100 30 M-80 60 C -60 44, -40 76, -20 60 C 0 44, 20 76, 40 60 C 60 44, 80 76, 100 60" fill="none" stroke="#3d7fa6" strokeWidth={6} strokeLinecap="round" /><circle cx={0} cy={-20} r={14} fill={C.orange} stroke={C.ink} strokeWidth={4} /><path d="M0 -6 L 0 22 M-16 -30 l -14 -10 M16 -30 l 14 -10" stroke={C.ink} strokeWidth={4} strokeLinecap="round" /></g>}
    {icon === "skull" && <g><path d="M-42 10 C -50 -50, 50 -50, 42 10 C 40 26, 30 30, 26 36 L 26 52 L -26 52 L -26 36 C -30 30, -40 26, -42 10 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" /><circle cx={-16} cy={0} r={11} fill={C.ink} /><circle cx={16} cy={0} r={11} fill={C.ink} /><path d="M-10 52 L -10 40 M0 52 L 0 40 M10 52 L 10 40" stroke={C.ink} strokeWidth={4} /></g>}
    {icon === "dagger" && <g><path d="M0 -60 L 12 20 L -12 20 Z" fill="#e8e3da" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" /><path d="M-34 20 L 34 20 M0 20 L 0 56" stroke={C.ink} strokeWidth={9} strokeLinecap="round" /></g>}
  </g>
);
const FolderScene: React.FC<{ s: Folder }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const every = s.every ?? 44;
  const first = s.first ?? 20;
  const n = s.pages.length;
  // page k is on top from flip k (frame first + k*every, or flips[k] to land on the spoken names)
  const flipAt = (k: number) => s.flips?.[k] ?? first + k * every;
  let cur = 0;
  for (let k = 0; k < n; k++) if (f >= flipAt(k)) cur = k;
  const fp = prog(f, flipAt(cur), flipAt(cur) + 10); // the page turning onto the right side
  const X0 = 540, Y0 = 640, W = 360, H = 560; // spine at X0, right page X0..X0+W
  const stamp = (k: number) => spring({ frame: f - (flipAt(k) + 14), fps, config: { damping: 10, mass: 0.5 } });
  const pageBody = (p: FolderPage) => (
    <g>
      <rect x={0} y={0} width={W} height={H} rx={8} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
      <text x={W / 2} y={84} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={p.name.length > 10 ? 29 : 40} letterSpacing={2} fill={C.ink}>{p.name}</text>
      <text x={W / 2} y={128} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={30} fill={C.inkSoft}>{p.play}</text>
      <path d={`M40 156 L ${W - 40} 156`} stroke={C.inkSoft} strokeWidth={3} />
      <text x={W / 2} y={214} textAnchor="middle" fontFamily={F.type} fontStyle="italic" fontSize={32} fill={C.ink}>{p.quote}</text>
      <PageIcon icon={p.icon} x={W / 2} y={350} />
      <path d={`M50 460 L ${W - 60} 460 M50 496 L ${W - 110} 496`} stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
  const prev = cur > 0 ? s.pages[cur - 1] : null;
  const panic = Math.min(1, Math.max(0, (f - flipAt(0)) / Math.max(1, flipAt(n - 1) + 30 - flipAt(0))));
  return (
    <AbsoluteFill>
      {s.pages.map((_, k) => (
        <React.Fragment key={k}>
          <Sfx name="toss" at={flipAt(k)} vol={0.45} />
          <Sfx name="thud" at={flipAt(k) + 14} vol={0.55} />
          <Sfx name={k === n - 1 ? "cine/pong" : "cine/plink"} at={flipAt(k) + 18} vol={0.4} />
        </React.Fragment>
      ))}
      {s.cue && <Sfx name="typing" at={flipAt(n - 1) + 30} frames={typeFrames(s.cue)} vol={0.4} />}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the binder: covers, rings */}
        <Ink d={`M${X0 - W - 26} ${Y0 - 20} L ${X0 + W + 26} ${Y0 - 20} L ${X0 + W + 26} ${Y0 + H + 22} L ${X0 - W - 26} ${Y0 + H + 22} Z`} start={0} dur={18} w={6} fill="rgba(232,121,43,0.22)" />
        {/* left page: the back of the last one you turned */}
        <g opacity={prog(f, 8, 16)} transform={`translate(${X0 - W} ${Y0})`}>
          <rect x={0} y={0} width={W} height={H} rx={8} fill="#fbf7ef" stroke={C.ink} strokeWidth={5} />
          {prev && <g opacity={0.35}><text x={W / 2} y={84} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={34} letterSpacing={3} fill={C.ink}>{prev.name}</text></g>}
          {prev && (
            <g transform={`translate(${W / 2} ${H / 2}) rotate(-12) scale(0.8)`} opacity={0.5}>
              <rect x={-150} y={-44} width={300} height={88} rx={6} fill="none" stroke="#c8402a" strokeWidth={7} />
              <text x={0} y={18} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={52} letterSpacing={8} fill="#c8402a">{s.stamp ?? "TRAGIC"}</text>
            </g>
          )}
        </g>
        {/* the right page: the current speech, turning in from the left */}
        {f >= flipAt(0) && (
          <g transform={`translate(${X0} ${Y0}) scale(${cur === 0 ? fp : Math.abs(2 * fp - 1) * (fp < 0.5 ? -1 : 1)} 1)`}>
            {cur > 0 && fp < 0.5 ? <rect x={0} y={0} width={W} height={H} rx={8} fill="#fbf7ef" stroke={C.ink} strokeWidth={5} /> : pageBody(s.pages[cur])}
            {(cur === 0 || fp >= 0.5) && (
              <g transform={`translate(${W / 2} ${H - 150}) rotate(-12) scale(${1.8 - 0.8 * Math.min(1, stamp(cur))})`} opacity={Math.min(1, Math.max(0, stamp(cur)) * 1.6)}>
                <rect x={-150} y={-44} width={300} height={88} rx={6} fill="rgba(255,255,255,0.6)" stroke="#c8402a" strokeWidth={7} />
                <text x={0} y={18} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={52} letterSpacing={8} fill="#c8402a">{s.stamp ?? "TRAGIC"}</text>
              </g>
            )}
          </g>
        )}
        {/* the rings on the spine */}
        {[Y0 + 90, Y0 + H / 2, Y0 + H - 90].map((y, i) => (
          <Ink key={i} d={`M${X0 - 26} ${y} C ${X0 - 26} ${y - 30}, ${X0 + 26} ${y - 30}, ${X0 + 26} ${y}`} start={10 + i * 2} dur={8} w={7} />
        ))}
        {/* you, getting more desperate with every page */}
        <Face x={130} y={1160} r={78} panic={panic} start={6} tilt={6} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 280 }}>
        <Rise at={10}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
      </AbsoluteFill>
      {s.cue && (
        <div style={{ position: "absolute", left: 300, right: 60, top: 1250 }}>
          <Cue text={s.cue} color={C.orange} at={flipAt(n - 1) + 30} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/** On the floor among the tragedies; the phone comes up and lights your face. */
type Floor = { type: "floor"; seconds: number; line: string; accent: string; cue?: string; litAt?: number; stamp?: string };
const FloorScene: React.FC<{ s: Floor }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const litAt = s.litAt ?? 40;
  const lift = spring({ frame: f - (litAt - 16), fps, config: { damping: 14 } });
  const lit = prog(f, litAt, litAt + 10);
  const FY = 1160;
  const scattered = [
    { x: 170, y: FY - 30, r: -18 }, { x: 830, y: FY - 20, r: 14 }, { x: 640, y: FY + 40, r: -6 }, { x: 300, y: FY + 60, r: 9 }, { x: 900, y: FY + 70, r: -22 },
  ];
  const px = 520, py = 760 + (1 - lift) * 260;
  return (
    <AbsoluteFill>
      <Sfx name="thud" at={4} vol={0.5} />
      <Sfx name="toss" at={8} vol={0.4} />
      <Sfx name="boop_hi" at={litAt} vol={0.55} />
      <Sfx name="cine/ping" at={litAt + 4} vol={0.5} />
      {s.cue && <Sfx name="typing" at={litAt + 16} frames={typeFrames(s.cue)} vol={0.4} />}
      {/* the phone's warm light on the dim room */}
      <AbsoluteFill style={{ background: `rgba(33,26,21,${0.1 * (1 - lit)})` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle 360px at ${px}px ${py + 40}px, rgba(232,121,43,${0.42 * lit}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={`M40 ${FY} C 380 ${FY - 4}, 700 ${FY + 6}, 1040 ${FY}`} start={0} dur={14} w={5} color={C.inkSoft} />
        {scattered.map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r})`} opacity={prog(f, 4 + i * 3, 10 + i * 3)}>
            <rect x={-70} y={-46} width={140} height={92} rx={4} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
            <rect x={-54} y={-16} width={108} height={32} rx={3} fill="none" stroke="#c8402a" strokeWidth={4} />
            <text x={0} y={9} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={600} fontSize={20} letterSpacing={3} fill="#c8402a">{s.stamp ?? "TRAGIC"}</text>
          </g>
        ))}
        {/* you, flat on your back: body, legs, the arm holding the phone up */}
        <Ink d={`M400 ${FY - 70} C 520 ${FY - 80}, 640 ${FY - 70}, 740 ${FY - 64} L 900 ${FY - 110} M740 ${FY - 64} L 920 ${FY - 40}`} start={6} dur={18} w={8} />
        <path d={`M440 ${FY - 74} L ${px - 10} ${py + 120}`} stroke={C.ink} strokeWidth={8} strokeLinecap="round" opacity={prog(f, litAt - 18, litAt - 12)} />
        <g transform={`translate(${px} ${py})`} opacity={prog(f, litAt - 18, litAt - 12)}>
          <rect x={-46} y={-6} width={92} height={170} rx={16} fill={APP.bg} stroke={C.ink} strokeWidth={6} />
          <rect x={-36} y={6} width={72} height={146} rx={10} fill={lit > 0 ? `rgba(242,207,58,${0.25 + 0.6 * lit})` : APP.bg} />
          {lit > 0.5 && <path d="M-22 48 L 22 48 M-22 74 L 14 74 M-22 100 L 18 100" stroke={APP.bg} strokeWidth={6} strokeLinecap="round" opacity={lit} />}
          {lit > 0 && <path d="M-80 -30 L -100 -50 M80 -30 L 100 -50 M0 -40 L 0 -66" stroke={C.orange} strokeWidth={6} strokeLinecap="round" opacity={1 - prog(f, litAt + 10, litAt + 26)} />}
        </g>
        <Face x={330} y={FY - 96} r={82} panic={0.9 * (1 - lit)} hope={lit} tilt={-78 + lit * 18} start={2} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 280 }}>
        <Rise at={Math.min(litAt + 4, 26)}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={104} />
        </Rise>
      </AbsoluteFill>
      {s.cue && (
        <div style={{ position: "absolute", left: 60, right: 60, top: 1240 }}>
          <Cue text={s.cue} color={C.orange} at={litAt + 16} />
        </div>
      )}
    </AbsoluteFill>
  );
};


// ---------- my inner monologue at every audition (2026-11-15) ----------
/** A thought cloud that pops: a rounded bubble with one or two lines, little circles trailing to the head. */
const Cloud: React.FC<{ x: number; y: number; w: number; h?: number; at: number; text: string; size?: number; hot?: boolean; to?: [number, number] }> = ({ x, y, w, h = 150, at, text, size = 44, hot, to }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < at) return null;
  const pop = spring({ frame: f - at, fps, config: { damping: 9, mass: 0.5 } });
  const lines = text.split("\n");
  const wob = Math.sin((f + x) / 9) * 4;
  return (
    <g>
      {to && [0.5, 0.74].map((t, i) => {
        const bx = x + (to[0] - x) * t, by = y + (to[1] - y) * t;
        return <circle key={i} cx={bx} cy={by} r={(16 - i * 6) * Math.min(1, pop)} fill="#ffffff" stroke={C.ink} strokeWidth={4} />;
      })}
      <g transform={`translate(${x} ${y + wob}) scale(${pop})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill={hot ? HL : "#ffffff"} stroke={C.ink} strokeWidth={6} />
        {lines.map((l, i) => (
          <text key={i} x={0} y={(i - (lines.length - 1) / 2) * (size * 1.16) + size * 0.34} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={size} fill={C.ink}>{l}</text>
        ))}
      </g>
    </g>
  );
};

/** The audition room: one casting person behind a table says the line; you stand on your mark, smiling,
 *  and a thought leaks out. `calm` is the same room the next day: the thought is a good one. */
type Ready = { type: "ready"; seconds: number; line: string; accent: string; say: string; thought: string; calm?: boolean; sayAt?: number; thinkAt?: number };
const ReadyScene: React.FC<{ s: Ready }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sayAt = s.sayAt ?? 24, thinkAt = s.thinkAt ?? 80;
  const say = spring({ frame: f - sayAt, fps, config: { damping: 11, mass: 0.5 } });
  const panic = s.calm ? 0 : prog(f, thinkAt - 12, thinkAt + 24) * 0.85;
  const hope = s.calm ? prog(f, thinkAt - 8, thinkAt + 4) : 0;
  const talk = f > sayAt && f < sayAt + 40 ? Math.abs(Math.sin(f / 2.2)) : 0;
  const sayLines = s.say.split("\n");
  const AX = 770, AY = 830;
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={sayAt} vol={0.6} />
      <Sfx name={s.calm ? "cine/ping" : "cine/toing"} at={thinkAt} vol={0.5} />
      {!s.calm && <Sfx name="cine/heartbeat" at={thinkAt + 8} vol={0.5} />}
      <Glow glow={0.4} y="48%" />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the floor and your mark, a taped X */}
        <Ink d="M60 1290 C 380 1284, 700 1296, 1020 1288" start={0} dur={14} w={4} color={C.inkSoft} />
        <Ink d={`M${AX - 44} 1262 L ${AX + 44} 1310 M${AX + 44} 1262 L ${AX - 44} 1310`} start={8} dur={10} w={9} color={C.orange} />
        {/* the casting person: body, head, bun, glasses, a pen */}
        <Ink d="M150 1090 C 150 1010, 190 982, 256 978 C 322 982, 362 1010, 362 1090" start={2} dur={14} w={6} fill="rgba(20,20,20,0.07)" />
        <circle cx={256} cy={912} r={66} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} opacity={prog(f, 4, 10)} />
        <g opacity={prog(f, 8, 14)}>
          <path d="M194 900 C 196 846, 316 846, 320 900 C 290 868, 224 868, 194 900 Z" fill={C.ink} />
          <circle cx={256} cy={836} r={24} fill={C.ink} />
          <circle cx={234} cy={912} r={19} fill="none" stroke={C.ink} strokeWidth={5} />
          <circle cx={280} cy={912} r={19} fill="none" stroke={C.ink} strokeWidth={5} />
          <path d="M253 912 L 261 912" stroke={C.ink} strokeWidth={5} />
          <circle cx={234} cy={913} r={5} fill={C.ink} />
          <circle cx={280} cy={913} r={5} fill={C.ink} />
          <ellipse cx={257} cy={950} rx={12} ry={3 + talk * 9} fill={C.ink} />
        </g>
        {/* the table, a clipboard, a paper cup */}
        <Ink d="M60 1092 C 200 1086, 340 1096, 470 1090 L 464 1130 C 340 1136, 200 1132, 66 1134 Z" start={0} dur={16} w={6} fill={PAPER_FILL} />
        <Ink d="M100 1134 L 100 1286 M430 1132 L 430 1286" start={8} dur={10} w={6} />
        <Ink d="M300 1088 L 312 1030 L 392 1036 L 386 1090" start={12} dur={10} w={5} fill="#ffffff" />
        <Ink d="M324 1050 L 372 1054 M322 1068 L 366 1071" start={18} dur={8} w={3} color={C.inkSoft} />
        <Ink d="M120 1090 L 124 1044 L 164 1044 L 168 1090" start={14} dur={8} w={5} fill="rgba(232,121,43,0.4)" />
        {/* you: body, stiff arms, legs, on the mark */}
        <Ink d={`M${AX} ${AY + 92} L ${AX} ${AY + 112} C ${AX - 62} ${AY + 122}, ${AX - 84} ${AY + 160}, ${AX - 88} ${AY + 216} L ${AX - 92} ${AY + 330} L ${AX + 92} ${AY + 330} L ${AX + 88} ${AY + 216} C ${AX + 84} ${AY + 160}, ${AX + 62} ${AY + 122}, ${AX} ${AY + 112}`} start={10} dur={16} w={6} fill="rgba(232,121,43,0.35)" />
        <Ink d={`M${AX - 84} ${AY + 170} C ${AX - 122} ${AY + 230}, ${AX - 124} ${AY + 290}, ${AX - 112} ${AY + 340} M${AX + 84} ${AY + 170} C ${AX + 122} ${AY + 230}, ${AX + 124} ${AY + 290}, ${AX + 112} ${AY + 340}`} start={18} dur={10} w={6} />
        <Ink d={`M${AX - 44} ${AY + 330} L ${AX - 46} ${AY + 440} L ${AX - 70} ${AY + 450} M${AX + 44} ${AY + 330} L ${AX + 46} ${AY + 440} L ${AX + 70} ${AY + 450}`} start={22} dur={10} w={6} />
        <Face x={AX} y={AY} r={94} panic={panic} hope={hope} start={12} />
        {/* what the panel says */}
        <g transform={`translate(300 640) scale(${say})`} opacity={Math.min(1, say * 1.5)}>
          <path d="M-220 -84 C -120 -100, 120 -100, 220 -84 C 250 -78, 256 -50, 254 0 C 252 54, 246 78, 220 84 C 120 96, 20 96, -10 92 L -40 150 L -56 92 C -120 94, -180 92, -220 84 C -248 78, -254 54, -256 0 C -254 -50, -250 -78, -220 -84 Z" fill="#ffffff" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          {sayLines.map((l, i) => (
            <text key={i} x={0} y={(i - (sayLines.length - 1) / 2) * 60 + 16} textAnchor="middle" fontFamily={F.type} fontStyle="italic" fontSize={52} fill={C.ink}>{l}</text>
          ))}
        </g>
        {/* what you think */}
        <Cloud x={775} y={590} w={350} h={s.thought.includes("\n") ? 150 : 124} at={thinkAt} text={s.thought} size={46} hot={s.calm} to={[AX + 10, AY - 60]} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={92} />
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The spiral: your head in the middle, and one thought after another pops out around it. */
type Spiral = { type: "spiral"; seconds: number; line: string; accent: string; thoughts: string[]; at?: number[] };
const SPIRAL_D = (() => {
  let d = "";
  for (let i = 0; i <= 150; i++) {
    const th = i * 0.21, r = 150 + i * 1.9;
    d += `${i ? "L" : "M"}${(Math.cos(th) * r).toFixed(1)} ${(Math.sin(th) * r).toFixed(1)} `;
  }
  return d;
})();
const SpiralScene: React.FC<{ s: Spiral }> = ({ s }) => {
  const f = useCurrentFrame();
  const HX = 540, HY = 900;
  const at = (k: number) => s.at?.[k] ?? 30 + k * 38;
  const n = s.thoughts.length;
  const spots = [
    { x: 300, y: 610, w: 430 }, { x: 772, y: 700, w: 396 }, { x: 270, y: 1085, w: 420 }, { x: 650, y: 1228, w: 520 },
  ];
  const panic = Math.min(1, 0.35 + 0.65 * prog(f, at(0), at(n - 1) + 10));
  return (
    <AbsoluteFill>
      {s.thoughts.map((_, k) => (
        <React.Fragment key={k}>
          <Sfx name="pop" at={at(k)} vol={0.6} />
          <Sfx name={k === n - 1 ? "cine/pong" : k % 2 ? "boop_hi" : "boop_lo"} at={at(k) + 4} vol={0.45} />
        </React.Fragment>
      ))}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(${HX} ${HY}) rotate(${-f * 2.4})`} opacity={0.5 * prog(f, 6, 30)}>
          <path d={SPIRAL_D} fill="none" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" strokeDasharray="26 16" />
        </g>
        {s.thoughts.map((t, k) => {
          const p = spots[k % spots.length];
          return <Cloud key={k} x={p.x} y={p.y} w={p.w} at={at(k)} text={t} hot={k === n - 1} to={[HX + (p.x < HX ? -70 : 70), HY + (p.y < HY ? -90 : 90)]} />;
        })}
        <Face x={HX} y={HY} r={128} panic={panic} start={2} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={8}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={92} />
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Rewind: a cassette spins backwards, the day card flips to the night before, and you are calm. */
type Rewind = { type: "rewind"; seconds: number; line: string; accent: string; from: string; to: string; flipAt?: number };
const RewindScene: React.FC<{ s: Rewind }> = ({ s }) => {
  const f = useCurrentFrame();
  const flipAt = s.flipAt ?? 50;
  const fp = prog(f, flipAt, flipAt + 12);
  const after = fp >= 0.5;
  const spin = -f * (after ? 4 : 22);
  const lit = prog(f, flipAt + 16, flipAt + 26);
  const blink = 0.55 + 0.45 * Math.sin(f / 2.5);
  const Reel: React.FC<{ x: number }> = ({ x }) => (
    <g transform={`translate(${x} 720)`}>
      <circle r={58} fill="#ffffff" stroke={C.ink} strokeWidth={6} />
      <g transform={`rotate(${spin})`}>
        {[0, 120, 240].map((a) => <path key={a} d="M0 -18 L 0 -50" transform={`rotate(${a})`} stroke={C.ink} strokeWidth={8} strokeLinecap="round" />)}
        <circle r={16} fill={C.ink} />
      </g>
    </g>
  );
  return (
    <AbsoluteFill>
      <Sfx name="slide" at={6} vol={0.5} />
      <Sfx name="slide" at={22} vol={0.45} />
      <Sfx name="cine/switch" at={flipAt} vol={0.5} />
      <Sfx name="cine/ping" at={flipAt + 16} vol={0.5} />
      <AbsoluteFill style={{ background: `radial-gradient(circle 330px at 690px 1210px, rgba(232,121,43,${0.36 * lit}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the cassette */}
        <Ink d="M270 570 L 810 570 C 826 570, 836 580, 836 596 L 836 846 C 836 862, 826 872, 810 872 L 270 872 C 254 872, 244 862, 244 846 L 244 596 C 244 580, 254 570, 270 570 Z" start={0} dur={16} w={6} fill={PAPER_FILL} />
        <Ink d="M300 620 L 780 620 L 780 812 L 300 812 Z" start={6} dur={12} w={4} fill="rgba(232,121,43,0.2)" />
        <g opacity={prog(f, 10, 16)}>
          <Reel x={420} />
          <Reel x={660} />
          <rect x={488} y={690} width={104} height={60} rx={8} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
          {/* the rewind arrows */}
          <g transform="translate(540 938)" opacity={after ? 0.25 : blink}>
            <path d="M-6 -34 L -62 0 L -6 34 Z M62 -34 L 6 0 L 62 34 Z" fill={C.orange} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          </g>
          {!after && [0, 1, 2].map((i) => <path key={i} d={`M${880 + i * 34} ${650 + i * 50} l ${60 - ((f * 9 + i * 20) % 60)} 0`} stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />)}
        </g>
        {/* the day card flips */}
        <g transform={`translate(540 1050) scale(1 ${Math.abs(2 * fp - 1)})`} opacity={prog(f, 12, 18)}>
          <rect x={-250} y={-52} width={500} height={104} rx={8} fill={after ? HL : "#ffffff"} stroke={C.ink} strokeWidth={6} />
          <text x={0} y={16} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={44} letterSpacing={3} fill={C.ink}>{after ? s.to : s.from}</text>
        </g>
        {/* you, and the phone that lights up */}
        <Face x={470} y={1215} r={76} panic={after ? 0 : 0.8} hope={after ? prog(f, flipAt + 14, flipAt + 22) : 0} start={14} />
        <g transform={`translate(690 1210) rotate(8)`} opacity={prog(f, flipAt + 8, flipAt + 14)}>
          <rect x={-44} y={-78} width={88} height={160} rx={16} fill={APP.bg} stroke={C.ink} strokeWidth={6} />
          <rect x={-34} y={-66} width={68} height={136} rx={10} fill={lit > 0 ? `rgba(242,207,58,${0.25 + 0.6 * lit})` : APP.bg} />
          {lit > 0 && <path d="M-74 -100 L -92 -122 M74 -100 L 92 -122 M0 -108 L 0 -136" stroke={C.orange} strokeWidth={6} strokeLinecap="round" opacity={1 - prog(f, flipAt + 26, flipAt + 44)} />}
        </g>
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={8}>
          <Headline text={s.line} accent={s.accent} color={C.ink} size={92} />
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the reader is stuck on the train (2026-11-16) ----------
/** A café across the street from the audition: the wall clock at 2:40, the building with its sign in the
 *  window, your sides and a coffee on the table. */
type Cafe = { type: "cafe"; seconds: number; line: string; accent: string; sign?: string; at?: string; page?: string };
const CafeScene: React.FC<{ s: Cafe }> = ({ s }) => {
  const f = useCurrentFrame();
  const CX = 810, CY = 700, R = 104;
  const tick = Math.floor(f / 15);
  const minA = 240 + tick * 1.2, hourA = 80;
  const hand = (a: number, len: number) => `M${CX} ${CY} L ${CX + len * Math.sin((a * Math.PI) / 180)} ${CY - len * Math.cos((a * Math.PI) / 180)}`;
  const steam = (x: number, k: number) => `M${x} 1118 c ${-14 + Math.sin((f + k) / 7) * 8} -22, ${14 + Math.sin((f + k) / 9) * 8} -40, 0 -64`;
  return (
    <AbsoluteFill>
      <Sfx name="cine/tick" at={PREROLL + 6} vol={0.5} />
      <Sfx name="cine/tick" at={PREROLL + 36} vol={0.5} />
      <Sfx name="boop_lo" at={PREROLL + 20} vol={0.5} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the window, and the audition building across the street */}
        <Ink d="M120 560 L 660 560 L 660 990 L 120 990 Z" start={0} dur={18} w={7} fill="rgba(232,121,43,0.08)" />
        <Ink d="M390 562 L 390 988 M122 760 L 658 760" start={10} dur={12} w={4} color={C.inkSoft} />
        <g opacity={prog(f, 12, 22)}>
          <path d="M200 988 L 200 640 L 580 640 L 580 988" fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <path d="M180 640 L 390 590 L 600 640 Z" fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <rect x={240} y={676} width={300} height={62} fill={C.orange} stroke={C.ink} strokeWidth={5} />
          <text x={390} y={720} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={38} letterSpacing={4} fill="#fff">{s.sign ?? "AUDITIONS"}</text>
          <path d="M340 988 L 340 840 C 340 800, 440 800, 440 840 L 440 988" fill="rgba(33,26,21,0.12)" stroke={C.ink} strokeWidth={5} />
          <rect x={236} y={800} width={70} height={90} fill="none" stroke={C.ink} strokeWidth={4} />
          <rect x={474} y={800} width={70} height={90} fill="none" stroke={C.ink} strokeWidth={4} />
          <rect x={352} y={770} width={76} height={40} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
          <text x={390} y={800} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={28} fill={C.ink}>{s.at ?? "3:00"}</text>
        </g>
        {/* the wall clock: twenty to three */}
        <Ink d={`M${CX} ${CY} m -${R} 0 a ${R} ${R} 0 1 0 ${R * 2} 0 a ${R} ${R} 0 1 0 -${R * 2} 0`} start={6} dur={16} w={7} fill="#ffffff" />
        <g opacity={prog(f, 16, 22)}>
          {[0, 90, 180, 270].map((a) => <path key={a} d={`M${CX} ${CY - R + 12} L ${CX} ${CY - R + 30}`} transform={`rotate(${a} ${CX} ${CY})`} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />)}
          <path d={hand(hourA, 52)} stroke={C.ink} strokeWidth={10} strokeLinecap="round" />
          <path d={hand(minA, 80)} stroke={C.orange} strokeWidth={7} strokeLinecap="round" />
          <circle cx={CX} cy={CY} r={9} fill={C.ink} />
          <text x={CX} y={CY + R + 62} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={56} fill={C.ink}>2:40</text>
        </g>
        {/* you at the table, coffee, the sides */}
        <Ink d="M330 1236 C 330 1170, 420 1150, 500 1150 C 580 1150, 670 1170, 670 1236" start={14} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Face x={500} y={1078} r={78} panic={0.25 + 0.4 * prog(f, PREROLL + 30, PREROLL + 70)} start={12} />
        <Ink d="M90 1236 C 380 1228, 700 1242, 990 1234" start={2} dur={16} w={8} />
        <Ink d="M130 1238 L 150 1420 M950 1236 L 930 1420" start={12} dur={10} w={6} color={C.inkSoft} />
        <Ink d="M196 1150 L 204 1228 L 276 1228 L 284 1150 Z M284 1168 c 40 0, 40 44, -4 44" start={18} dur={10} w={5} fill="#ffffff" />
        <path d={steam(224, 0)} fill="none" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" opacity={prog(f, 26, 34)} />
        <path d={steam(256, 30)} fill="none" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" opacity={prog(f, 26, 34)} />
        <g transform="translate(790 1186) rotate(-7)" opacity={prog(f, 20, 28)}>
          <rect x={-104} y={-62} width={208} height={112} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
          <text x={0} y={-22} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={26} letterSpacing={2} fill={C.ink}>{s.page ?? "THE BEAR"}</text>
          <path d="M-80 0 L 80 0 M-80 20 L 60 20 M-80 38 L 72 38" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
        </g>
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The little train stops between stations; the reader's text floats up out of it. */
type Train = { type: "train"; seconds: number; line: string; accent: string; text: string; stopAt?: number; textAt?: number; flag?: string };
const TrainScene: React.FC<{ s: Train }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stopAt = s.stopAt ?? 30, textAt = s.textAt ?? 44;
  const TY = 1130;
  const roll = interpolate(f, [0, stopAt], [-520, 130], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const jolt = f >= stopAt && f < stopAt + 10 ? Math.sin((f - stopAt) * 1.6) * (10 - (f - stopAt)) * 0.8 : 0;
  const pop = spring({ frame: f - textAt, fps, config: { damping: 11, mass: 0.5 } });
  const lines = s.text.split("\n");
  const wheel = (x: number) => <circle cx={x} cy={TY - 22} r={22} fill="#ffffff" stroke={C.ink} strokeWidth={6} />;
  const blink = 0.5 + 0.5 * Math.sin(f / 3);
  return (
    <AbsoluteFill>
      <Sfx name="cine/tick" at={4} vol={0.4} />
      <Sfx name="cine/tick" at={14} vol={0.4} />
      <Sfx name="thud" at={stopAt} vol={0.6} />
      <Sfx name="cine/toing" at={stopAt + 4} vol={0.4} />
      <Sfx name="pop" at={textAt} vol={0.6} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the track, and the stop it never reaches */}
        <Ink d={`M40 ${TY} C 360 ${TY - 4}, 700 ${TY + 4}, 1040 ${TY}`} start={0} dur={14} w={7} />
        {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${70 + i * 78} ${TY + 4} l -10 26`} stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" opacity={prog(f, 4 + i, 8 + i)} />)}
        <g opacity={prog(f, 8, 16)}>
          <path d={`M880 ${TY} L 880 ${TY - 250}`} stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
          <path d={`M880 ${TY - 250} L 720 ${TY - 250} L 700 ${TY - 212} L 720 ${TY - 174} L 880 ${TY - 174} Z`} fill={C.orange} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <text x={796} y={TY - 198} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={30} letterSpacing={2} fill="#fff">{s.flag ?? "AUDITION"}</text>
        </g>
        {/* the train: an engine and one car, your reader at the window */}
        <g transform={`translate(${roll + jolt} 0)`}>
          <rect x={0} y={TY - 190} width={250} height={150} rx={18} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
          <rect x={266} y={TY - 190} width={250} height={150} rx={18} fill="rgba(232,121,43,0.3)" stroke={C.ink} strokeWidth={6} />
          <path d={`M250 ${TY - 100} L 266 ${TY - 100}`} stroke={C.ink} strokeWidth={8} />
          <path d={`M516 ${TY - 150} L 560 ${TY - 150} C 590 ${TY - 150}, 600 ${TY - 110}, 600 ${TY - 40} L 516 ${TY - 40}`} fill="rgba(232,121,43,0.3)" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          {[30, 140].map((x) => <rect key={x} x={x} y={TY - 164} width={84} height={66} rx={8} fill="#ffffff" stroke={C.ink} strokeWidth={5} />)}
          {[296, 406].map((x) => <rect key={x} x={x} y={TY - 164} width={84} height={66} rx={8} fill="#ffffff" stroke={C.ink} strokeWidth={5} />)}
          <Face x={338} y={TY - 128} r={27} panic={f > stopAt ? 0.7 : 0} start={0} />
          {wheel(56)}{wheel(194)}{wheel(322)}{wheel(460)}{wheel(560)}
          {f > stopAt && <text x={616} y={TY - 180} fontFamily={F.serif} fontWeight={600} fontSize={96} fill={C.orange} opacity={blink}>!</text>}
          {f <= stopAt && [0, 1, 2].map((i) => <path key={i} d={`M${-30 - i * 34} ${TY - 150 + i * 44} l -60 0`} stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />)}
        </g>
        {/* the text from the train */}
        <g transform={`translate(520 730) scale(${pop})`} opacity={Math.min(1, pop * 1.5)}>
          <path d="M-400 -120 C -200 -134, 200 -134, 400 -120 C 430 -114, 436 -70, 434 0 C 432 76, 426 108, 400 114 C 200 126, -30 126, -70 122 L -110 196 L -128 122 C -240 124, -330 122, -400 114 C -428 108, -434 76, -436 0 C -434 -70, -430 -114, -400 -120 Z" fill="#ffffff" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          {lines.map((l, i) => (
            <text key={i} x={0} y={(i - (lines.length - 1) / 2) * 66 + 16} textAnchor="middle" fontFamily={F.type} fontStyle="italic" fontSize={54} fill={C.ink}>{l}</text>
          ))}
        </g>
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The chair across the table, with the part's name on it and nobody in it; your sides shake.
 *  `calm` is the same table a minute later: the phone sits on the chair and reads the part. */
type Chair = { type: "chair"; seconds: number; line: string; accent: string; tag: string; page?: string; calm?: boolean };
const ChairScene: React.FC<{ s: Chair }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shake = s.calm ? 0 : Math.sin(f * 1.7) * 5 * prog(f, 16, 40);
  const lit = s.calm ? spring({ frame: f - 12, fps, config: { damping: 12 } }) : 0;
  const TY = 1200, KX = 760;
  const wave = (i: number) => 0.25 + 0.75 * Math.abs(Math.sin(f / 4 + i * 1.3));
  return (
    <AbsoluteFill>
      {!s.calm && <Sfx name="cine/heartbeat" at={14} vol={0.5} />}
      {!s.calm && <Sfx name="cine/toing" at={8} vol={0.4} />}
      {s.calm && <Sfx name="cine/ping" at={12} vol={0.5} />}
      {s.calm && <Sfx name="boop_hi" at={20} vol={0.5} />}
      <AbsoluteFill style={{ background: `radial-gradient(circle 300px at ${KX}px 1010px, rgba(232,121,43,${0.34 * lit}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the chair */}
        <Ink d={`M${KX - 90} ${TY + 180} L ${KX - 90} 800 C ${KX - 90} 770, ${KX + 90} 770, ${KX + 90} 800 L ${KX + 90} ${TY + 180}`} start={0} dur={16} w={8} />
        <Ink d={`M${KX - 88} 880 L ${KX + 88} 880 M${KX - 88} 960 L ${KX + 88} 960`} start={10} dur={10} w={6} color={C.inkSoft} />
        <Ink d={`M${KX - 110} 1090 L ${KX + 110} 1090 L ${KX + 110} 1118 L ${KX - 110} 1118 Z`} start={8} dur={10} w={6} fill={PAPER_FILL} />
        {/* the name tag on the chair */}
        <g transform={`translate(${KX} 820) rotate(${-4 + Math.sin(f / 14) * 2})`} opacity={prog(f, 12, 20)}>
          <path d="M-40 -34 L 0 -66 L 40 -34" fill="none" stroke={C.ink} strokeWidth={4} />
          <rect x={-128} y={-34} width={256} height={76} rx={6} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
          <text x={0} y={18} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={42} letterSpacing={3} fill={C.ink}>{s.tag}</text>
        </g>
        {s.calm ? (
          <g transform={`translate(${KX} 1004)`} opacity={Math.min(1, lit * 1.4)}>
            <rect x={-50} y={-90} width={100} height={178} rx={18} fill={APP.bg} stroke={C.ink} strokeWidth={6} />
            <rect x={-38} y={-76} width={76} height={150} rx={10} fill={`rgba(242,207,58,${0.3 + 0.55 * lit})`} />
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-28 + i * 13} y={-wave(i) * 30} width={7} height={wave(i) * 60} rx={3} fill={APP.bg} />)}
            {[0, 1].map((i) => <path key={i} d={`M${-84 - i * 30} ${-40 - i * 16} C ${-110 - i * 34} -10, ${-110 - i * 34} 20, ${-84 - i * 30} ${50 + i * 16}`} fill="none" stroke={C.orange} strokeWidth={6} strokeLinecap="round" opacity={wave(i + 2)} />)}
          </g>
        ) : (
          <g opacity={prog(f, 18, 30)}>
            <circle cx={KX} cy={985} r={58} fill="none" stroke={C.inkSoft} strokeWidth={5} strokeDasharray="14 12" />
            <text x={KX} y={1012} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={78} fill={C.inkSoft}>?</text>
          </g>
        )}
        {/* the table between you */}
        <Ink d={`M150 ${TY} C 380 ${TY - 6}, 640 ${TY + 6}, 900 ${TY}`} start={2} dur={14} w={8} />
        <Ink d={`M210 ${TY + 2} L 226 ${TY + 200} M840 ${TY + 2} L 824 ${TY + 200}`} start={10} dur={10} w={6} color={C.inkSoft} />
        {/* you, and the sides in your hand */}
        <Ink d={`M150 ${TY - 4} C 150 ${TY - 80}, 230 ${TY - 104}, 300 ${TY - 104} C 370 ${TY - 104}, 450 ${TY - 80}, 450 ${TY - 4}`} start={8} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Face x={300} y={1014} r={84} panic={s.calm ? 0 : 0.85 * prog(f, 10, 30)} hope={s.calm ? prog(f, 14, 24) : 0} start={6} />
        <g transform={`translate(${498 + shake} ${1120 + shake * 0.6}) rotate(${8 + shake * 1.4})`} opacity={prog(f, 14, 22)}>
          <rect x={-74} y={-92} width={148} height={184} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
          <text x={0} y={-52} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={22} letterSpacing={1.5} fill={C.ink}>{s.page ?? "THE BEAR"}</text>
          <path d="M-54 -22 L 54 -22 M-54 2 L 40 2 M-54 26 L 50 26 M-54 50 L 30 50" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
          {!s.calm && [0, 1].map((i) => <path key={i} d={`M${92 + i * 18} ${-70 + i * 60} l 16 -8`} stroke={C.ink} strokeWidth={4} strokeLinecap="round" opacity={0.5 + 0.5 * Math.sin(f + i)} />)}
        </g>
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Word by word captions for the narration (Canberk, 2026-11-08: drawn films need captions). Ink on a
 *  soft paper pill above the bottom quarter, the spoken word in orange. Hidden on the end card. */
const StoryCaptions: React.FC<{ lines: StoryVoice["lines"]; until: number }> = ({ lines, until }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  if (t >= until) return null;
  const dur = (l: StoryVoice["lines"][number]) => l.dur ?? (l.words?.length ? l.words[l.words.length - 1].e + 0.15 : l.text.split(" ").length * 0.36 + 0.4);
  // A line with "sub": false has no captions (the app's own text is on screen: one text layer at a time).
  const line = lines.find((l) => l.sub !== false && t >= l.at - 0.05 && t <= l.at + dur(l) + 0.25);
  if (!line) return null;
  const lt = t - line.at;
  const all = line.words?.length ? line.words : line.text.split(" ").map((w, i) => ({ w, s: i * 0.34, e: i * 0.34 + 0.3 }));
  // Show the narration in short chunks (at most 6 words) so a long line never fills the screen.
  const chunks: typeof all[] = [];
  for (let i = 0; i < all.length; i += 6) chunks.push(all.slice(i, i + 6));
  const chunk = chunks.find((c, i) => lt < (chunks[i + 1]?.[0].s ?? Infinity) - 0.02) ?? chunks[chunks.length - 1];
  const op = interpolate(lt, [-0.05, 0.1, dur(line) + 0.05, dur(line) + 0.25], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 170px 450px 80px", opacity: op, pointerEvents: "none" }}>
      <div style={{ background: C.ink, borderRadius: 22, padding: "16px 28px", boxShadow: "0 8px 30px rgba(33,26,21,0.25)",
        textAlign: "center", fontFamily: F.serif, fontWeight: 600, fontSize: 50, lineHeight: 1.2, color: "#fbf7f0", maxWidth: 830 }}>
        {chunk.map((w, i) => {
          const on = lt >= w.s - 0.02;
          const now = on && lt <= w.e + 0.08;
          return <span key={i} style={{ opacity: on ? 1 : 0.45, color: now ? "#f5a35c" : undefined, marginRight: 14, display: "inline-block" }}>{w.w}</span>;
        })}
      </div>
    </AbsoluteFill>
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
  const ph = (t?: string) => t === "phone" || t === "screens";
  const moves = spec.scenes.map((sc, i) => i > 0 && !(ph(sc.type) && ph(spec.scenes[i - 1].type)));
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
    const phoneish = (t?: string) => t === "phone" || t === "screens";
    const firstPhone = phoneish(sc.type) && !(i > 0 && phoneish(spec.scenes[i - 1].type));
    return sc.type === "screens" ? <ScreensScene s={sc} first={firstPhone} /> :
      sc.type === "night" ? <NightScene s={sc} /> :
      sc.type === "books" ? <BooksScene s={sc} /> :
      sc.type === "thinking" ? <ThinkingScene s={sc} /> :
      sc.type === "email" ? <EmailScene s={sc} /> :
      sc.type === "phone" ? <PhoneScene s={sc} first={firstPhone} /> :
      sc.type === "notify" ? <NotifyScene s={sc} /> :
      sc.type === "stage" ? <StageScene s={sc} /> :
      sc.type === "lobby" ? <LobbyScene s={sc} /> :
      sc.type === "panel" ? <PanelScene s={sc} /> :
      sc.type === "inbox" ? <InboxScene s={sc} /> :
      sc.type === "bring" ? <BringScene s={sc} /> :
      sc.type === "runs" ? <RunsScene s={sc} /> :
      sc.type === "kitchen" ? <KitchenScene s={sc} /> :
      sc.type === "book" ? <BookScene s={sc} /> :
      sc.type === "ten" ? <TenScene s={sc} /> :
      sc.type === "callback" ? <CallbackScene s={sc} /> :
      sc.type === "folder" ? <FolderScene s={sc} /> :
      sc.type === "floor" ? <FloorScene s={sc} /> :
      sc.type === "ready" ? <ReadyScene s={sc} /> :
      sc.type === "spiral" ? <SpiralScene s={sc} /> :
      sc.type === "rewind" ? <RewindScene s={sc} /> :
      sc.type === "cafe" ? <CafeScene s={sc} /> :
      sc.type === "train" ? <TrainScene s={sc} /> :
      sc.type === "chair" ? <ChairScene s={sc} /> :
      <EndScene s={sc} />;
  };

  const spans: [number, number][] = (spec.voice?.lines ?? []).map((l) => [Math.round(l.at * FPS), Math.round((l.at + (l.dur ?? 2)) * FPS)]);

  return (
    <SpeechCtx.Provider value={spans}>
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <Paper />
      {spec.music && (
        <Audio src={staticFile(`music/${spec.id}.wav`)}
          volume={(f) => {
            const base = spec.music!.volume ?? 0.42;
            // smooth duck: look a few frames around f so the bed eases down and back up
            // and stays down before the first line: the bed's opening hit sat on a quiet first word (2026-11-09)
            let k = spans.length && f < spans[0][0] ? 1 : 0; for (let d = -6; d <= 6; d += 3) k = Math.max(k, speaking(spans, f + d, 0) ? 1 : 0);
            return base * (k ? DUCK : 1);
          }} />
      )}
      {(spec.voice?.takes ?? []).map((tk, i) => (
        <Sequence key={`take${i}`} from={Math.round(tk.at * FPS)} layout="none">
          <Audio src={staticFile(tk.audio)} volume={spec.voice?.volume ?? 1} />
        </Sequence>
      ))}
      {spec.voice?.take && (
        <Sequence from={Math.round((spec.voice.take_at ?? 0.3) * FPS)} layout="none">
          <Audio src={staticFile(spec.voice.take)} volume={spec.voice?.volume ?? 1} />
        </Sequence>
      )}
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
              <SceneStartCtx.Provider value={i === 0 ? -PREROLL : moves[i] ? starts[i] - T : starts[i]}>
                <AbsoluteFill style={{ transform: `translateX(${x}px)` }}>{renderScene(sc, i)}</AbsoluteFill>
              </SceneStartCtx.Provider>
            </Sequence>
          </React.Fragment>
        );
      })}
      {spec.voice?.lines?.length && spec.voice.subtitles !== false ? (
        <StoryCaptions lines={spec.voice.lines}
          until={spec.scenes[spec.scenes.length - 1]?.type === "end" ? spec.scenes.slice(0, -1).reduce((n, sc) => n + sc.seconds, 0) : 1e9} />
      ) : null}
    </AbsoluteFill>
    </SpeechCtx.Provider>
  );
};
