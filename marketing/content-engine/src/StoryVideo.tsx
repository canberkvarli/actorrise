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
import { CollageDefs, CollageBg, CMilo, CPerson, CTitle, CNote, CHook, CHeart, Place, P as CP, ease as cease } from "./collage";

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
export type StoryLook = "paper" | "marker" | "midnight" | "bold" | "noir" | "riso" | "sketch" | "collage";
const HL = "#ffe15a";
// Fills for drawn shapes and pages; the look sets them (dark shapes on the midnight sheet).
let PAPER_FILL = "#f8f4ec";
let PAGE = "#ffffff";
let LOOK: StoryLook = "paper";
/** The dark sheets (midnight, noir): drawn shapes get dark fills and the ink is light. */
const DARK = () => LOOK === "midnight" || LOOK === "noir";
const F_PAPER = { serif: "Playfair", serifI: "PlayfairItalic", type: "CourierPrime", sans: "Montserrat" };
const F = { ...F_PAPER };
const applyLook = (look: StoryLook) => {
  LOOK = look;
  Object.assign(C, C_PAPER, look === "marker" ? { paper: "#f7f5f0", ink: "#141414", inkSoft: "rgba(20,20,20,0.55)" }
    // midnight (2026-11-17): the reel's midnight look for drawn films. Deep blue black sheet, cream ink, warm amber key word.
    : look === "midnight" ? { paper: "#0d1020", ink: "#f3efe6", inkSoft: "rgba(243,239,230,0.55)", orange: "#f2b75b" }
    // bold (2026-11-22): the reel's bold look for drawn films. Orange field, near black ink, the key word in white.
    : look === "bold" ? { paper: "#e8792b", ink: "#15100c", inkSoft: "rgba(21,16,12,0.6)", orange: "#ffffff" }
    // noir (2026-11-23): lights off. Warm near black sheet, cream ink, the brand orange as the only colour.
    : look === "noir" ? { paper: "#0d0b09", ink: "#f1ece2", inkSoft: "rgba(241,236,226,0.5)", orange: "#f08a3c" }
    // riso (2026-11-20, Canberk asked for a new style): a two ink risograph print. Riso blue line work on
    // cream stock, fluorescent pink as the second ink, printed a few pixels off register, halftone dots, grain.
    // sketch (2026-11-20): a different way of DRAWING, not a palette. Graphite pencil on sketchbook paper:
    // every line is redrawn wobbly and doubled like a quick pencil sketch, the fills go soft, one red pencil.
    // collage (2026-11-20): the cut-paper world (src/collage.tsx). Teal paper sheet, cream type, red accent.
    : look === "collage" ? { paper: "#1f5c5a", ink: "#f3ead8", inkSoft: "rgba(243,234,216,0.6)", orange: "#e8792b" }
    : look === "sketch" ? { paper: "#f3f0e8", ink: "#3b3a38", inkSoft: "rgba(59,58,56,0.5)", orange: "#d8452b" }
    : look === "riso" ? { paper: "#f2ead9", ink: "#2340a0", inkSoft: "rgba(35,64,160,0.55)", orange: "#ff3d7f" } : {});
  PAPER_FILL = look === "midnight" ? "#1a2038" : look === "noir" ? "#1c1916" : look === "riso" ? "#f6efe0" : look === "sketch" ? "url(#hatch)" : look === "collage" ? "#f3ead8" : "#f8f4ec";
  PAGE = look === "midnight" ? "#262d4a" : look === "noir" ? "#27231f" : look === "riso" ? "#fbf6ea" : "#ffffff";
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
  shots: { src: string; at: number; tap?: { x: number; y: number; at: number; hold?: number }; push?: { x: number; y: number; scale?: number; from?: number };
    /** move the shot up inside the phone by this share of its height, [from, to], so a low part (the tab bar) reaches the safe area */
    pan?: [number, number];
    /** cross fade in instead of sliding in (a shot that changes while the phone turns) */
    fade?: boolean;
    /** a drawn sticky note stuck on the phone (shares of the screen), from the story's own world: it sits over a part of the
     *  real screen that may not be filmed (a line of an in-copyright play in Tonight's speech). Never a fake screen. */
    note?: { x: number; y: number; w: number; h: number; text: string; rot?: number } }[];
  /** the drawn phone turns on its side at this scene frame (0 = it is already sideways), the way the actor turns it for casting */
  turn?: number;
  /** big spoken cue words under the sideways phone: what the actor says ("action", "cut") */
  cues?: { text: string; at: number; until?: number }[];
};
export type StoryScene = Screens | Night | Books | Thinking | Email | Phone | Notify | Stage | Lobby | Panel | Inbox | Bring | Runs | Kitchen | BookMode | Ten | Callback | Folder | Floor | Ready | Spiral | Rewind | Cafe | Train | Chair | Hall | Fumble | Gone | Thud | Dry | Scatter | Tally | Snap | Fresh | Notice | Tower | Buried | Cards | OneAm | Peeks | Pillow | SelfTape | Ophelias | Cutout | BusStop | LibDesk | Sofa | End;
/** Music bed made by scripts/make_music.py into public/music/<id>.wav (render.sh runs it). */
export type StoryMusic = { style: "sunny" | "pizzicato" | "build" | "festive" | "bed" | "wood" | "beat" | "pulse"; drop?: string | number; volume?: number; seed?: string };
/** Narration (scripts/voice.py fills audio + words); `at` is seconds from the start of the video. */
export type StoryVoice = { lines: { text: string; at: number; sub?: boolean; audio?: string; dur?: number; words?: { w: string; s: number; e: number }[] }[]; volume?: number; subtitles?: boolean; take?: string; take_at?: number; takes?: { audio: string; at: number; voice?: string }[] };
/** How a scene arrives (2026-11-23, the edit kit, Canberk: "catchy, nice sounds and effects, transitions"):
 *  slide = the paper camera pan (old default), whip = a fast whip pan with motion blur and a whoosh,
 *  punch = hard cut that punches in from 1.22x with a low thump, tear = the new scene tears up over the old
 *  one with a paper rip (collage), cut = a hard cut on the beat. Set per scene with "in", or for the
 *  whole film with spec "transition". */
export type StoryTransition = "slide" | "whip" | "punch" | "tear" | "cut";
export type StorySpec = { id: string; scenes: StoryScene[]; music?: StoryMusic; look?: StoryLook; voice?: StoryVoice; transition?: StoryTransition };
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
      {i >= 0 && (LOOK === "marker" || LOOK === "bold") && (
        <span style={{ position: "relative", display: "inline-block", color: C.ink, padding: "0 0.08em" }}>
          <span style={{ position: "absolute", left: "-0.04em", right: "-0.04em", top: "0.22em", bottom: "0.06em", background: LOOK === "bold" ? "#ffffff" : HL, transform: "rotate(-1.6deg) skewX(-8deg)", borderRadius: 6, zIndex: 0 }} />
          <span style={{ position: "relative" }}>{accent}</span>
        </span>
      )}
      {i >= 0 && LOOK !== "marker" && LOOK !== "bold" && (
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

const RISO_GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.14  0 0 0 0 0.2  0 0 0 0 0.5  0 0 0 0.55 0"/></filter><rect width="300" height="300" filter="url(#n)"/></svg>')}")`;
/** riso: halftone dots of the pink ink fading down the sheet, plus paper grain over everything. */
const RisoPaper: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <AbsoluteFill style={{ backgroundImage: "radial-gradient(circle, rgba(255,61,127,0.32) 2.6px, transparent 3.2px)", backgroundSize: "15px 15px",
      WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)",
      maskImage: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)" }} />
  </AbsoluteFill>
);
const RisoGrain: React.FC = () => (
  <AbsoluteFill style={{ backgroundImage: RISO_GRAIN, opacity: 0.22, mixBlendMode: "multiply", pointerEvents: "none" }} />
);

/** sketch: the pencil filter. Two displaced copies of every line (a firm stroke and a faint second pass)
 *  so it reads as drawn by hand, plus graphite grain eaten into the strokes. Real app screens never get it. */
const SketchDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      <pattern id="hatch" patternUnits="userSpaceOnUse" width="18" height="18" patternTransform="rotate(38)">
        <rect width="18" height="18" fill="#f7f5ef" />
        <line x1="0" y1="4" x2="18" y2="4" stroke="#3b3a38" strokeOpacity={0.33} strokeWidth={2.2} />
        <line x1="0" y1="12" x2="18" y2="13" stroke="#3b3a38" strokeOpacity={0.18} strokeWidth={1.6} />
      </pattern>
    </defs>
    <filter id="pencil" x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves={2} seed={3} result="n1" />
      <feDisplacementMap in="SourceGraphic" in2="n1" scale={16} xChannelSelector="R" yChannelSelector="G" result="d1" />
      <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={11} result="n2" />
      <feDisplacementMap in="SourceGraphic" in2="n2" scale={26} xChannelSelector="G" yChannelSelector="R" result="d2" />
      <feColorMatrix in="d2" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="d2f" />
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves={1} seed={5} result="g" />
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.45" result="ga" />
      <feMerge result="m"><feMergeNode in="d2f" /><feMergeNode in="d1" /></feMerge>
      <feComposite in="m" in2="ga" operator="in" />
    </filter>
  </svg>
);
const SketchPaper: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 95% 75% at 50% 42%, #faf8f3 0%, ${C.paper} 70%, #e6e1d6 100%)` }}>
    <AbsoluteFill style={{ backgroundImage: RISO_GRAIN, opacity: 0.12, mixBlendMode: "multiply", filter: "grayscale(1)" }} />
  </AbsoluteFill>
);

const Paper: React.FC = () => LOOK === "riso" ? <RisoPaper /> : LOOK === "sketch" ? <SketchPaper /> : LOOK === "collage" ? <CollageBg floorY={2400} /> : (
  <AbsoluteFill
    style={{
      background: LOOK === "noir"
        ? `radial-gradient(ellipse 90% 70% at 50% 45%, #1a1613 0%, ${C.paper} 62%, #050403 100%)`
        : DARK()
        ? `radial-gradient(ellipse 90% 70% at 50% 40%, #171c36 0%, ${C.paper} 62%, #070914 100%)`
        : LOOK === "marker"
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
/** `hold` keeps the finger down that many frames longer (a long press), with a second ripple. */
type FTap = { at: number; x: number; y: number; hold?: number };
/** ONE drawn finger for a run of taps (Canberk, 2026-11-15: overlapping fingers read as a stutter, "multiple
 *  fingers"). Taps close together share the same finger: it presses, then glides to the next spot instead of
 *  leaving while a second one arrives. Only taps far apart (over 70 frames) let it go and come back. */
const FingerTrack: React.FC<{ taps: FTap[]; ring?: boolean }> = ({ taps, ring = true }) => {
  const f = useCurrentFrame();
  const ts = [...taps].sort((p, q) => p.at - q.at);
  if (!ts.length || f < ts[0].at) return null;
  // arrive A (= at + 12, when the ripple fires), hold the press to P, then glide on
  const A: number[] = [], P: number[] = [];
  ts.forEach((t, k) => {
    const a0 = t.at + 12;
    A.push(k > 0 ? Math.max(a0, P[k - 1] + 6) : a0);
    P.push(A[k] + 8 + (t.hold ?? 0));
  });
  const stays = (k: number) => k + 1 < ts.length && ts[k + 1].at - ts[k].at <= 70;
  let k = 0;
  for (let j = 0; j < ts.length; j++) if (f >= (j === 0 || !stays(j - 1) ? ts[j].at : P[j - 1])) k = j;
  const ease = Easing.inOut(Easing.cubic);
  let x = ts[k].x, y = ts[k].y, away = 0;
  const entering = k === 0 || !stays(k - 1);
  if (entering && f < A[k]) away = 1 - Easing.out(Easing.cubic)(prog(f, ts[k].at, A[k]));
  if (!entering && f < A[k]) {
    const g = ease(prog(f, P[k - 1], A[k]));
    x = ts[k - 1].x + (ts[k].x - ts[k - 1].x) * g;
    y = ts[k - 1].y + (ts[k].y - ts[k - 1].y) * g;
  }
  if (!stays(k) && f > P[k] + 8) away = Easing.in(Easing.cubic)(prog(f, P[k] + 8, P[k] + 22));
  if (away >= 1 && f > P[k]) return null;
  const press = interpolate(f, [A[k] - 4, A[k], P[k] - 2, P[k] + 3], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // the finger is drawn once at the origin and moved as a whole, so it never redraws or doubles
  const dx = 0.387, dy = 0.922, nx = 0.922, ny = -0.387;
  const Q = (along: number, side: number) => `${(dx * along + nx * side).toFixed(1)} ${(dy * along + ny * side).toFixed(1)}`;
  const d = [`M${Q(0, -34)}`, `C ${Q(-46, -34)}, ${Q(-46, 34)}, ${Q(0, 34)}`, `L ${Q(380, 38)}`,
    `C ${Q(400, 110)}, ${Q(470, 170)}, ${Q(540, 160)}`, `L ${Q(900, 260)}`, `L ${Q(900, -60)}`, `L ${Q(420, -40)}`, "Z"].join(" ");
  const nail = `M${Q(10, -20)} C ${Q(-18, -18)}, ${Q(-18, 18)}, ${Q(10, 20)}`;
  const crease1 = `M${Q(150, -30)} C ${Q(156, -10)}, ${Q(156, 10)}, ${Q(150, 30)}`;
  const crease2 = `M${Q(300, -32)} C ${Q(306, -10)}, ${Q(306, 12)}, ${Q(300, 34)}`;
  const curled = `M${Q(400, 60)} C ${Q(420, 120)}, ${Q(470, 150)}, ${Q(520, 150)}`;
  const rp = prog(f, A[k] + 2, A[k] + 18);
  return (
    <>
      {ring && f >= A[k] && rp < 1 && (
        <div style={{ position: "absolute", left: ts[k].x - 70, top: ts[k].y - 70, width: 140, height: 140, borderRadius: "50%",
          border: `4px solid ${C.orange}`, opacity: 1 - rp, transform: `scale(${0.4 + rp})` }} />
      )}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <g transform={`translate(${(x + away * 380).toFixed(1)} ${(y + 8 + away * 700 - press * 10).toFixed(1)})`}>
          <path d={d} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <path d={nail} fill="none" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
          <path d={crease1} fill="none" stroke={C.inkSoft} strokeWidth={3} strokeLinecap="round" />
          <path d={crease2} fill="none" stroke={C.inkSoft} strokeWidth={3} strokeLinecap="round" />
          <path d={curled} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
        </g>
      </svg>
    </>
  );
};
const TapFinger: React.FC<FTap> = (t) => <FingerTrack taps={[t]} />;

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
const PH0 = PH;
const SX = PX + PI, SY = PY + PI, SW = PW - PI * 2;

const DrawnPhone: React.FC<{ start: number; children?: React.ReactNode; whole?: boolean; h?: number }> = ({ start, children, whole, h }) => {
  const f = useCurrentFrame();
  // whole: the bottom is drawn too (the phone is seen entire when it turns on its side); otherwise it runs off the frame.
  const PH = h ?? PH0;
  const body = whole ? `M${PX + 96} ${PY} L ${PX + PW - 96} ${PY} C ${PX + PW - 30} ${PY}, ${PX + PW} ${PY + 30}, ${PX + PW} ${PY + 96} L ${PX + PW} ${PY + PH - 96} C ${PX + PW} ${PY + PH - 30}, ${PX + PW - 30} ${PY + PH}, ${PX + PW - 96} ${PY + PH} L ${PX + 96} ${PY + PH} C ${PX + 30} ${PY + PH}, ${PX} ${PY + PH - 30}, ${PX} ${PY + PH - 96} L ${PX} ${PY + 96} C ${PX} ${PY + 30}, ${PX + 30} ${PY}, ${PX + 96} ${PY} Z` : `M${PX + 96} ${PY} L ${PX + PW - 96} ${PY} C ${PX + PW - 30} ${PY}, ${PX + PW} ${PY + 30}, ${PX + PW} ${PY + 96} L ${PX + PW} ${PY + PH} L ${PX} ${PY + PH} L ${PX} ${PY + 96} C ${PX} ${PY + 30}, ${PX + 30} ${PY}, ${PX + 96} ${PY} Z`;
  const screenOn = prog(f, start + 10, start + 22);
  return (
    <>
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <Ink d={body} start={start} dur={18} w={7} fill={PAPER_FILL} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: SX,
          top: SY,
          width: SW,
          height: whole ? PH - PI * 2 : PH,
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
  const shots = s.shots;
  // Canberk, 2026-11-12: zooming into a screenshot broke the app's own layout (cropped, blown up, the
  // bottom of the screen off the frame). So real screens are NEVER scaled. The phone stays at its true
  // size and the camera only glides up or down so the part that matters sits in view; `push` now marks
  // that spot with a soft spotlight and an orange ring instead of a zoom.
  const side = s.turn === undefined ? 0 : s.turn <= 0 ? 1 : spring({ frame: f - s.turn, fps, config: { damping: 16, mass: 0.9 } });
  const PCX = PX + PW / 2;
  // Canberk, 2026-11-12: the screen is exactly one iPhone screen tall (never a long phone, never a crop
  // or zoom inside the app). The whole phone is drawn, at true proportions, and moved up into view; the
  // hand and the tap ring do the pointing.
  const HN = SHOT_H + PI * 2, K = 0.82, PCYn = PY + HN / 2;
  const kk = interpolate(side, [0, 1], [K, 0.675]);
  const ty = (1 - side) * (440 - (PCYn - K * HN / 2)) + side * (664 - PCYn);
  const camT = `translateY(${(1 - up) * 900 + ty}px) rotate(${side * 90}deg) scale(${kk})`;
  const pzAt = (_i: number, _g: number) => 1;
  const panAt = (i: number, g: number) => {
    const sh = shots[i];
    if (!sh.pan || true) return 0; // never scroll inside a real screen (Canberk, 2026-11-12)
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
      {s.turn !== undefined && s.turn > 0 && <Sfx name="slide" at={s.turn} vol={0.5} />}
      {(s.cues ?? []).map((cu, i) => <Sfx key={`cu${i}`} name="cine/ping" at={cu.at} vol={0.5} />)}
      {(s.cues ?? []).map((cu, i) => {
        if (f < cu.at || f > (cu.until ?? cu.at + 45)) return null;
        const pop = spring({ frame: f - cu.at, fps, config: { damping: 11, mass: 0.6 } });
        return (
          <AbsoluteFill key={`cw${i}`} style={{ alignItems: "center", paddingTop: 965 }}>
            <div style={{ fontFamily: F.serifI, fontStyle: "italic", fontSize: 150, lineHeight: 1, color: C.orange, transform: `scale(${0.6 + 0.4 * pop}) rotate(-3deg)`, opacity: Math.min(1, pop * 1.5) }}>{cu.text}</div>
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill style={{ transform: camT, transformOrigin: `${PCX}px ${PCYn}px` }}>
        <DrawnPhone start={first ? 0 : -100} whole h={HN}>
          {shots.map((sh, i) => {
            const next = shots[i + 1];
            if (f < sh.at - 1 || (next && f > next.at + 12)) return null;
            const inP0 = i === 0 ? 1 : Easing.out(Easing.cubic)(prog(f, sh.at, sh.at + 12));
            const inP = sh.fade ? 1 : inP0;
            const outP = next ? Easing.in(Easing.cubic)(prog(f, next.at, next.at + 12)) : 0;
            const end = next ? next.at : sh.at + 120;
            void end;
            return (
              <div key={i} style={{ position: "absolute", left: 0, top: 0, width: SW, height: SHOT_H,
                transform: `translateX(${(1 - inP) * SW - (next?.fade ? 0 : outP * SW * 0.35)}px)`, opacity: sh.fade ? inP0 : next?.fade ? 1 : 1 - outP * 0.6,
                boxShadow: i > 0 && inP < 1 ? "-20px 0 40px rgba(0,0,0,0.35)" : undefined }}>
                <Img src={staticFile(sh.src)} style={{ width: SW, height: SHOT_H, objectFit: "cover",
                  objectPosition: "top" }} />
                {sh.note && (
                  <div style={{ position: "absolute", left: sh.note.x * SW, top: sh.note.y * SHOT_H, width: sh.note.w * SW, height: sh.note.h * SHOT_H,
                    background: HL, border: `5px solid ${C_PAPER.ink}`, transform: `rotate(${sh.note.rot ?? -2}deg)`, boxShadow: "0 10px 24px rgba(0,0,0,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.serifI, fontStyle: "italic", fontSize: 78, color: C_PAPER.ink }}>
                    {sh.note.text}
                  </div>
                )}
                {sh.push && f >= sh.at + 6 && (() => {
                  const a = Easing.out(Easing.cubic)(prog(f, sh.at + 6, sh.at + 20)) * (next ? 1 - prog(f, next.at, next.at + 8) : 1);
                  const ring = spring({ frame: f - sh.at - 8, fps, config: { damping: 12, mass: 0.7 } });
                  const cx = sh.push!.x * SW, cy = sh.push!.y * SHOT_H;
                  return (
                    <>
                      <div style={{ position: "absolute", inset: 0, opacity: a,
                        background: `radial-gradient(circle at ${cx}px ${cy}px, rgba(0,0,0,0) 120px, rgba(0,0,0,0.5) 200px)` }} />
                      <div style={{ position: "absolute", left: cx - 125, top: cy - 125, width: 250, height: 250, borderRadius: "50%",
                        border: `6px solid ${C.orange}`, opacity: a, transform: `scale(${0.7 + 0.3 * ring})`, boxShadow: `0 0 30px ${C.orange}66` }} />
                    </>
                  );
                })()}
                {sh.tap && f >= sh.tap.at + 12 && f <= sh.tap.at + 40 + (sh.tap.hold ?? 0) && (() => {
                  // a held finger ripples twice
                  const h2 = sh.tap!.hold && f > sh.tap!.at + 34 ? sh.tap!.hold - 6 : 0;
                  const r = prog(f, sh.tap!.at + 12 + h2, sh.tap!.at + 34 + h2);
                  const m = mapTap(i);
                  return <div style={{ position: "absolute", left: m.x * SW - 60 * r, top: m.y * SHOT_H - 60 * r, width: 120 * r, height: 120 * r,
                    borderRadius: "50%", border: `5px solid ${C.orange}`, opacity: 1 - r }} />;
                })()}
              </div>
            );
          })}
        </DrawnPhone>
        <FingerTrack ring={false} taps={shots.flatMap((sh, i) => (sh.tap ? [{ at: sh.tap.at, hold: sh.tap.hold, x: SX + mapTap(i).x * SW, y: SY + mapTap(i).y * SHOT_H }] : []))} />
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
      <path d="M-74 -18 C -70 -80, 60 -96, 76 -24 C 50 -52, -20 -60, -74 -18 Z" fill={DARK() ? "#b9823f" : C.ink} />
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


// ---------- the spark and the phone that was not ready (2026-11-17, the Tape tab held) ----------
/** A four point spark: the feeling of a scene finally landing. */
const sparkD = (R: number, r = R * 0.2) => `M0 ${-R} Q ${r} ${-r} ${R} 0 Q ${r} ${r} 0 ${R} Q ${-r} ${r} ${-R} 0 Q ${-r} ${-r} 0 ${-R} Z`;
const Spark: React.FC<{ x: number; y: number; k?: number; at?: number; ghost?: boolean }> = ({ x, y, k = 1, at = 0, ghost }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - at, fps, config: { damping: 9, mass: 0.5 } });
  if (f < at) return null;
  const pulse = 1 + 0.1 * Math.sin(f / 4);
  if (ghost) return (
    <g transform={`translate(${x} ${y}) scale(${k * pop})`}>
      <path d={sparkD(70)} fill="none" stroke={C.inkSoft} strokeWidth={5} strokeDasharray="12 12" strokeLinejoin="round" />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${k * pop * pulse}) rotate(${Math.sin(f / 9) * 8})`}>
      <circle r={120} fill={C.orange} opacity={0.14 + 0.06 * Math.sin(f / 5)} />
      <path d={sparkD(70)} fill={C.orange} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      {[[-96, -70, 16], [100, -54, 12], [84, 82, 14]].map(([sx, sy, sr], i) => (
        <path key={i} transform={`translate(${sx} ${sy})`} d={sparkD(sr)} fill={C.orange} opacity={0.4 + 0.6 * Math.abs(Math.sin(f / 6 + i * 2))} />
      ))}
    </g>
  );
};
/** A drawn face with nothing left in it: sad brows, heavy lids, a small frown. */
const FlatFace: React.FC<{ x: number; y: number; r?: number; start?: number }> = ({ x, y, r = 84, start = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - start, fps, config: { damping: 12, mass: 0.6 } });
  if (f < start) return null;
  const sag = 4 * Math.sin(f / 16);
  return (
    <g transform={`translate(${x} ${y + sag}) rotate(-7) scale(${(r / 78) * pop})`}>
      <circle cx={0} cy={0} r={78} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
      <path d="M-74 -18 C -70 -80, 60 -96, 76 -24 C 50 -52, -20 -60, -74 -18 Z" fill={DARK() ? "#b9823f" : C.ink} />
      <path d="M-42 -20 L -16 -32 M16 -32 L 42 -20" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
      <path d="M-36 -2 C -30 6, -20 6, -14 -2 M14 -2 C 20 6, 30 6, 36 -2" fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
      <path d="M-20 42 C -8 30, 8 30, 20 42" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
    </g>
  );
};
/** A night window; stars inside it. */
const NightWindow: React.FC<{ x: number; y: number; w: number; h: number; start?: number }> = ({ x, y, w, h, start = 0 }) => {
  const f = useCurrentFrame();
  return (
    <>
      <Ink d={`M${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`} start={start} dur={16} w={7} fill={DARK() ? "#05070f" : "rgba(33,26,21,0.12)"} />
      <Ink d={`M${x + w / 2} ${y + 2} L ${x + w / 2} ${y + h - 2} M${x + 2} ${y + h / 2} L ${x + w - 2} ${y + h / 2}`} start={start + 8} dur={10} w={4} color={C.inkSoft} />
      <Ink d={`M${x - 22} ${y + h + 4} L ${x + w + 22} ${y + h + 4}`} start={start + 6} dur={8} w={8} />
      {[[0.2, 0.22], [0.72, 0.16], [0.3, 0.7], [0.82, 0.62]].map(([a, b], i) => (
        <circle key={i} cx={x + w * a} cy={y + h * b} r={4} fill={C.ink} opacity={prog(f, start + 14, start + 20) * (0.35 + 0.5 * Math.abs(Math.sin(f / 11 + i)))} />
      ))}
    </>
  );
};

/** The hallway, one lamp, and the scene finally lands: a spark over your head. calm: it is caught, the phone is rolling. */
type Hall = { type: "hall"; seconds: number; line: string; accent: string; page?: string; calm?: boolean; sparkAt?: number };
const HallScene: React.FC<{ s: Hall }> = ({ s }) => {
  const f = useCurrentFrame();
  const FY = 1400, LX = 836;
  const sparkAt = s.sparkAt ?? 26;
  const lit = 0.85 + 0.15 * Math.sin(f / 13);
  const rec = Math.floor(f / 12) % 2 === 0;
  return (
    <AbsoluteFill>
      <Sfx name="cine/switch" at={8} vol={0.4} />
      <Sfx name="cine/ping" at={sparkAt} vol={0.6} />
      {s.calm && <Sfx name="boop_hi" at={sparkAt + 10} vol={0.5} />}
      <AbsoluteFill style={{ background: `radial-gradient(circle 520px at ${LX}px 900px, rgba(242,183,91,${0.26 * lit * prog(f, 8, 18)}) 0%, rgba(242,183,91,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the hallway: the floor, a door, the skirting running away */}
        <Ink d={`M50 ${FY} C 380 ${FY - 8}, 700 ${FY + 8}, 1030 ${FY}`} start={0} dur={16} w={8} />
        <Ink d={`M96 ${FY - 2} L 96 800 L 316 800 L 316 ${FY - 2}`} start={4} dur={16} w={7} fill={PAPER_FILL} />
        <Ink d="M130 850 L 282 850 L 282 1060 L 130 1060 Z M130 1110 L 282 1110 L 282 1340 L 130 1340 Z" start={14} dur={12} w={4} color={C.inkSoft} />
        <circle cx={290} cy={1088} r={10} fill={C.ink} opacity={prog(f, 18, 24)} />
        {/* the one lamp */}
        <Ink d={`M${LX} ${FY - 2} L ${LX} 900 M${LX - 56} ${FY - 2} L ${LX + 56} ${FY - 2}`} start={6} dur={12} w={7} />
        <Ink d={`M${LX - 84} 900 L ${LX + 84} 900 L ${LX + 52} 770 L ${LX - 52} 770 Z`} start={10} dur={12} w={7} fill={`rgba(242,183,91,${0.55 * lit})`} />
        {/* you, mid speech, the pages in your hand */}
        <Ink d={`M410 ${FY - 4} C 410 1250, 470 1180, 550 1180 C 630 1180, 690 1250, 690 ${FY - 4}`} start={10} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Face x={550} y={1082} r={86} hope={prog(f, sparkAt, sparkAt + 10)} start={8} />
        {!s.calm && (
          <g transform={`translate(726 1262) rotate(${9 + Math.sin(f / 10) * 3})`} opacity={prog(f, 14, 22)}>
            <rect x={-84} y={-98} width={168} height={196} fill={PAGE} stroke={C.ink} strokeWidth={5} />
            <text x={0} y={-56} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={22} letterSpacing={1.5} fill={C.ink}>{s.page ?? "THE SEAGULL"}</text>
            <path d="M-60 -24 L 60 -24 M-60 2 L 44 2 M-60 28 L 54 28 M-60 54 L 30 54" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
          </g>
        )}
        {s.calm && (
          <g opacity={prog(f, 6, 14)}>
            {/* the phone on its side, on a stack of plays, rolling */}
            <path d={`M196 ${FY - 4} L 196 ${FY - 44} L 396 ${FY - 44} L 396 ${FY - 4} M210 ${FY - 44} L 210 ${FY - 84} L 384 ${FY - 84} L 384 ${FY - 44}`} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
            <rect x={186} y={FY - 216} width={224} height={126} rx={18} fill={APP.bg} stroke={C.ink} strokeWidth={6} />
            <circle cx={214} cy={FY - 188} r={9} fill="#e5484d" opacity={rec ? 1 : 0.25} />
            <circle cx={384} cy={FY - 153} r={15} fill="none" stroke="#f4ead9" strokeWidth={4} />
            <circle cx={384} cy={FY - 153} r={8} fill="#e5484d" />
            <circle cx={290} cy={FY - 160} r={22} fill="none" stroke="rgba(244,234,217,0.7)" strokeWidth={4} />
            <path d={`M262 ${FY - 108} C 262 ${FY - 132}, 318 ${FY - 132}, 318 ${FY - 108}`} fill="none" stroke="rgba(244,234,217,0.7)" strokeWidth={4} />
          </g>
        )}
        <Spark x={550} y={886} at={sparkAt} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** You grab the phone: unlock, swipe, the wrong app, the camera, flip it. The spark floats out of the window. */
type Fumble = { type: "fumble"; seconds: number; line: string; accent: string; steps: string[]; at?: number[] };
const FumbleIcon: React.FC<{ k: number }> = ({ k }) => {
  const st = { fill: "none", stroke: APP.cream, strokeWidth: 9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return k === 0 ? (<g><rect x={-46} y={-10} width={92} height={74} rx={10} {...st} /><path d="M-28 -10 L -28 -34 C -28 -72, 28 -72, 28 -34 L 28 -10" {...st} /></g>)
    : k === 1 ? (<g><path d="M-70 20 L 60 20 M26 -14 L 62 20 L 26 54" {...st} /><path d="M-70 -30 L -10 -30" {...st} opacity={0.4} /></g>)
    : k === 2 ? (<g><rect x={-52} y={-66} width={104} height={132} rx={12} {...st} /><path d="M-30 -40 L 30 -40 M-30 -6 L -22 -6 M-4 -6 L 4 -6 M22 -6 L 30 -6 M-30 26 L -22 26 M-4 26 L 4 26 M22 26 L 30 26" {...st} strokeWidth={8} /><path d="M-74 -86 L 74 86 M74 -86 L -74 86" stroke="#e5484d" strokeWidth={12} strokeLinecap="round" /></g>)
    : k === 3 ? (<g><path d="M-70 -36 L -34 -36 L -20 -58 L 20 -58 L 34 -36 L 70 -36 L 70 52 L -70 52 Z" {...st} /><circle cx={0} cy={8} r={26} {...st} /></g>)
    : (<g><path d="M-58 -10 C -50 -62, 30 -70, 56 -30 M56 -62 L 58 -28 L 24 -30" {...st} /><path d="M58 14 C 50 66, -30 74, -56 34 M-56 66 L -58 32 L -24 34" {...st} /></g>);
};
const FumbleScene: React.FC<{ s: Fumble }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = Math.round(s.seconds * FPS);
  const n = s.steps.length;
  const ats = s.at ?? s.steps.map((_, i) => 14 + Math.round(((total - 50) * i) / n));
  let k = -1; ats.forEach((a, i) => { if (f >= a) k = i; });
  const since = k >= 0 ? f - ats[k] : 0;
  const pop = k >= 0 ? spring({ frame: since, fps, config: { damping: 10, mass: 0.5 } }) : 0;
  const shake = Math.sin(f * 1.5) * 5;
  // the spark drifts off, up and out through the window
  const d = Easing.inOut(Easing.cubic)(prog(f, 16, total - 6));
  const sx = interpolate(d, [0, 1], [250, 800]), sy = interpolate(d, [0, 0.5, 1], [820, 640, 716]) + Math.sin(f / 7) * 14;
  const PXc = 610, PYc = 1104;
  return (
    <AbsoluteFill>
      {ats.map((a, i) => <Sfx key={i} name={i === 2 ? "thud" : "cine/tap"} at={a} vol={i === 2 ? 0.5 : 0.6} />)}
      <Sfx name="cine/toing" at={ats[2] + 4} vol={0.35} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <NightWindow x={650} y={580} w={300} h={290} start={0} />
        {/* you, eyes on the phone */}
        <Ink d="M96 1400 C 96 1220, 160 1150, 250 1150 C 340 1150, 404 1220, 404 1400" start={6} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Face x={250} y={1052} r={84} panic={0.2 + 0.75 * prog(f, 20, total - 20)} tilt={8} start={4} />
        {/* the phone, in two hands */}
        <g transform={`translate(${PXc + shake} ${PYc}) rotate(${-4 + shake * 0.5})`} opacity={prog(f, 6, 14)}>
          <rect x={-170} y={-270} width={340} height={540} rx={46} fill={APP.bg} stroke={C.ink} strokeWidth={7} />
          <rect x={-44} y={-250} width={88} height={24} rx={12} fill="#000" />
          {k >= 0 && (
            <g transform={`scale(${0.7 + 0.3 * pop})`} opacity={Math.min(1, pop * 1.6)}>
              <g transform="translate(0 -40) scale(1.25)"><FumbleIcon k={k} /></g>
              <text x={0} y={130} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={50} fill={k === 2 ? "#e5484d" : APP.cream}>{s.steps[k]}</text>
            </g>
          )}
          {s.steps.map((_, i) => <circle key={i} cx={(i - (n - 1) / 2) * 30} cy={222} r={7} fill={i <= k ? APP.yellow : "rgba(244,234,217,0.25)"} />)}
          {/* thumbs */}
          <path d="M-196 150 C -150 120, -110 150, -120 200 C -130 240, -180 250, -210 230" fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" transform={`rotate(${Math.sin(f * 0.9) * 6} -170 200)`} />
          <path d="M196 90 C 150 60, 110 90, 120 140 C 130 180, 180 190, 210 170" fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" transform={`rotate(${Math.cos(f * 1.1) * 7} 170 140)`} />
        </g>
        <Spark x={sx} y={sy} k={interpolate(d, [0, 0.75, 1], [0.9, 0.7, 0.18])} at={0} />
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The camera is finally open. The spark is not: it is a dot in the night, and then it is not there. */
type Gone = { type: "gone"; seconds: number; line: string; accent: string; outAt?: number };
const GoneScene: React.FC<{ s: Gone }> = ({ s }) => {
  const f = useCurrentFrame();
  const outAt = s.outAt ?? 34;
  const far = 1 - prog(f, outAt, outAt + 10);
  return (
    <AbsoluteFill>
      <Sfx name="cine/pong" at={8} vol={0.45} />
      <Sfx name="cine/plink" at={outAt} vol={0.4} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <NightWindow x={560} y={600} w={380} h={420} start={0} />
        {/* the spark, far off, going out */}
        <g transform={`translate(${800 + f * 0.5} ${760 - f * 0.6})`} opacity={far}>
          <path d={sparkD(20 - Math.min(10, f / 5))} fill={C.orange} />
        </g>
        {/* where it was */}
        <Spark x={300} y={900} at={10} ghost />
        <Ink d="M150 1400 C 150 1240, 214 1196, 300 1196 C 386 1196, 450 1240, 450 1400" start={4} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <FlatFace x={300} y={1104} r={86} start={4} />
        {/* the phone, camera open at last, hanging from one hand */}
        <g transform={`translate(600 1290) rotate(${24 + Math.sin(f / 12) * 4})`} opacity={prog(f, 10, 18)}>
          <rect x={-74} y={-128} width={148} height={256} rx={24} fill={APP.bg} stroke={C.ink} strokeWidth={6} />
          <g transform="translate(0 -6) scale(0.62)"><FumbleIcon k={3} /></g>
          <circle cx={0} cy={92} r={15} fill="none" stroke={APP.cream} strokeWidth={4} />
        </g>
        <Ink d="M50 1400 C 380 1392, 700 1408, 1030 1400" start={0} dur={16} w={8} />
        {/* a sigh */}
        {[0, 1, 2].map((i) => <path key={i} d={`M${410 + i * 34} ${1150 - i * 12} q 14 -10 28 0`} fill="none" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" opacity={prog(f, 20 + i * 5, 26 + i * 5) * (1 - prog(f, 44 + i * 5, 54 + i * 5))} />)}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Word by word captions for the narration (Canberk, 2026-11-08: drawn films need captions). Ink on a
 *  soft paper pill above the bottom quarter, the spoken word in orange. Hidden on the end card. */

// ---------- the read-through, the dry highlighter, the pages in the air (2026-11-19, bring your sides: scan and map) ----------
/** The first read-through: the whole script lands on the table with a thud, and you are in very little of it.
 *  `calm` is the same table after: the big script shut, your few scenes in a slim, lit set of pages. */
type Thud = { type: "thud"; seconds: number; line: string; accent: string; title: string; pages: string; tent?: string; slim?: string; calm?: boolean; /** scene frame the script lands on (the first scene of a film starts 62 frames in) */ landAt?: number };
const ThudScene: React.FC<{ s: Thud }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const TY = 1180, BX = 600, BW = 380, BH = 132;
  const LAND = s.landAt ?? 10;
  const drop = s.calm ? 1 : spring({ frame: f - (LAND - 8), fps, config: { damping: 9, mass: 0.7, stiffness: 160 } });
  const y = TY - BH - (1 - drop) * 620;
  const squash = s.calm ? 0 : Math.max(0, 1 - Math.abs(f - LAND - 2) / 5) * 0.08;
  const lit = s.calm ? spring({ frame: f - 10, fps, config: { damping: 12 } }) : 0;
  const dust = s.calm ? 0 : prog(f, LAND, LAND + 22);
  return (
    <AbsoluteFill>
      {!s.calm && <Sfx name="thud" at={LAND} vol={0.9} />}
      {!s.calm && <Sfx name="cine/toing" at={LAND + 16} vol={0.35} />}
      {s.calm && <Sfx name="cine/ping" at={10} vol={0.5} />}
      {s.calm && <Sfx name="boop_hi" at={18} vol={0.5} />}
      <AbsoluteFill style={{ background: `radial-gradient(circle 280px at 330px 1070px, rgba(232,121,43,${0.36 * lit}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the read-through table */}
        <Ink d={`M90 ${TY} C 360 ${TY - 8}, 700 ${TY + 8}, 990 ${TY}`} start={0} dur={14} w={8} />
        <Ink d={`M170 ${TY + 2} L 190 ${TY + 210} M910 ${TY + 2} L 890 ${TY + 210}`} start={8} dur={10} w={6} color={C.inkSoft} />
        {/* you, behind the table */}
        <Ink d={`M150 ${TY - 4} C 150 ${TY - 86}, 240 ${TY - 110}, 320 ${TY - 110} C 400 ${TY - 110}, 490 ${TY - 86}, 490 ${TY - 4}`} start={4} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Face x={320} y={TY - 200} r={88} panic={s.calm ? 0 : 0.8 * prog(f, LAND + 4, LAND + 26)} hope={s.calm ? prog(f, 12, 22) : 0} start={4} />
        {/* the name tent */}
        {s.tent && !s.calm && (
          <g transform={`translate(330 ${TY - 2})`} opacity={prog(f, 6, 14)}>
            <path d="M-78 0 L -62 -62 L 62 -62 L 78 0 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
            <text x={0} y={-18} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={36} letterSpacing={3} fill={C.ink}>{s.tent}</text>
          </g>
        )}
        {/* the script: a brick of pages */}
        <g transform={`translate(${s.calm ? BX + 30 : BX} ${y + BH * squash}) scale(${1 + squash} ${1 - squash})`} opacity={s.calm ? 0.55 : 1}>
          <path d={`M0 0 L 46 -40 L ${BW + 46} -40 L ${BW} 0 Z`} fill="#ffffff" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <rect x={0} y={0} width={BW} height={BH} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
          <path d={`M${BW} 0 L ${BW + 46} -40 L ${BW + 46} ${BH - 40} L ${BW} ${BH} Z`} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M8 ${13 * (i + 1)} L ${BW - 8} ${13 * (i + 1)}`} stroke={C.inkSoft} strokeWidth={3} />)}
          <text x={BW / 2 + 22} y={-10} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={26} letterSpacing={4} fill={C.ink} transform="skewX(-48)" style={{ transformOrigin: `${BW / 2 + 22}px -10px` }}>{s.title}</text>
        </g>
        {/* how many pages */}
        {!s.calm && (
          <g transform={`translate(${BX + BW - 150} ${TY - BH - 170}) rotate(7) scale(${spring({ frame: f - LAND - 6, fps, config: { damping: 9, mass: 0.5 } })})`}>
            <rect x={-122} y={-46} width={244} height={92} rx={8} fill={HL} stroke={C.ink} strokeWidth={6} />
            <text x={0} y={16} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={50} fill={C.ink}>{s.pages}</text>
          </g>
        )}
        {/* dust off the table */}
        {!s.calm && dust > 0 && dust < 1 && [-1, 1].map((d) => [0, 1, 2].map((i) => (
          <circle key={`${d}${i}`} cx={BX + BW / 2 + d * (BW / 2 + 30 + dust * (50 + i * 34))} cy={TY - 14 - dust * (20 + i * 22)} r={(16 - i * 3) * (1 - dust * 0.4)} fill="none" stroke={C.inkSoft} strokeWidth={4} opacity={1 - dust} />
        )))}
        {/* after: your scenes, slim and lit */}
        {s.calm && (
          <g transform={`translate(560 ${TY - 96}) rotate(${-6 + Math.sin(f / 16) * 1.5}) scale(${0.6 + 0.4 * lit})`} opacity={Math.min(1, lit * 1.5)}>
            <rect x={-96} y={-124} width={192} height={236} fill="#ffffff" stroke={C.ink} strokeWidth={4} transform="rotate(5)" />
            <rect x={-96} y={-124} width={192} height={236} fill="#ffffff" stroke={C.ink} strokeWidth={6} />
            <text x={0} y={-70} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={34} letterSpacing={3} fill={C.ink}>{s.tent ?? ""}</text>
            <text x={0} y={-28} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={30} fill={C.orange}>{s.slim ?? ""}</text>
            <path d="M-66 6 L 66 6 M-66 32 L 44 32 M-66 58 L 58 58 M-66 84 L 26 84" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />
          </g>
        )}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Hunting for your lines with a highlighter: the pages flip, one name gets the yellow, and the pen runs dry halfway. */
type Dry = { type: "dry"; seconds: number; line: string; accent: string; names: string[]; mine: string; head?: string; dryAt?: number };
const DryScene: React.FC<{ s: Dry }> = ({ s }) => {
  const f = useCurrentFrame();
  const PXL = 250, PYT = 640, PWD = 580, PHT = 640, ROW = 74;
  const dryAt = s.dryAt ?? 62;
  const flips = Math.min(46, 3 + Math.floor(prog(f, 8, dryAt + 30) * 44));
  const rows = s.names.slice(0, 7);
  const mineIdx = rows.map((n, i) => (n === s.mine ? i : -1)).filter((i) => i >= 0);
  // the pen works through the rows that are yours: the first swipe is full, the second dies halfway
  const seg = (k: number) => prog(f, 22 + k * 26, 40 + k * 26);
  const cur = seg(1) > 0 ? 1 : 0;
  const rowY = (i: number) => PYT + 150 + i * ROW;
  const penRow = mineIdx[Math.min(cur, mineIdx.length - 1)] ?? 0;
  const penP = seg(cur);
  const scratch = f > dryAt ? Math.sin(f * 1.6) * 26 : 0;
  const penX = PXL + 150 + penP * (cur === 1 ? 200 : 370) + scratch;
  const penY = rowY(penRow) - 6;
  return (
    <AbsoluteFill>
      <Sfx name="pencil_long" at={22} vol={0.5} />
      <Sfx name="pencil_short" at={48} vol={0.5} />
      <Sfx name="cine/toing" at={dryAt} vol={0.45} />
      <Sfx name="pencil_short" at={dryAt + 12} vol={0.35} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the pages behind */}
        <rect x={PXL + 18} y={PYT + 14} width={PWD} height={PHT} fill="#ffffff" stroke={C.inkSoft} strokeWidth={4} />
        <rect x={PXL + 9} y={PYT + 7} width={PWD} height={PHT} fill="#ffffff" stroke={C.inkSoft} strokeWidth={4} />
        <Ink d={`M${PXL} ${PYT} L ${PXL + PWD} ${PYT} L ${PXL + PWD} ${PYT + PHT} L ${PXL} ${PYT + PHT} Z`} start={0} dur={14} w={6} fill="#ffffff" />
        <g opacity={prog(f, 6, 16)}>
          <text x={PXL + 40} y={PYT + 70} fontFamily={F.sans} fontWeight={600} fontSize={30} letterSpacing={4} fill={C.ink}>{s.head ?? ""}</text>
          <text x={PXL + PWD - 40} y={PYT + 70} textAnchor="end" fontFamily={F.sans} fontWeight={600} fontSize={30} fill={C.inkSoft}>{`p. ${flips}`}</text>
          <path d={`M${PXL + 40} ${PYT + 92} L ${PXL + PWD - 40} ${PYT + 92}`} stroke={C.inkSoft} strokeWidth={3} />
          {rows.map((n, i) => {
            const k = mineIdx.indexOf(i);
            const p = k < 0 ? 0 : seg(k);
            const full = k === 0;
            return (
              <g key={i}>
                {k >= 0 && p > 0 && (full ? (
                  <rect x={PXL + 32} y={rowY(i) - 34} width={(PWD - 64) * p} height={48} fill={HL} opacity={0.9} />
                ) : (
                  <>
                    <rect x={PXL + 32} y={rowY(i) - 34} width={Math.min(150, 330 * p)} height={48} fill={HL} opacity={0.75} />
                    {p > 0.45 && [0, 1, 2, 3].map((j) => <path key={j} d={`M${PXL + 190 + j * 34} ${rowY(i) - 26 + (j % 2) * 18} l 24 ${j % 2 ? -8 : 8}`} stroke={HL} strokeWidth={7} strokeLinecap="round" opacity={Math.max(0, 0.8 - j * 0.22) * prog(f, dryAt - 10 + j * 3, dryAt + j * 3)} />)}
                  </>
                ))}
                <text x={PXL + 40} y={rowY(i)} fontFamily={F.sans} fontWeight={600} fontSize={30} letterSpacing={2} fill={n === s.mine ? C.ink : C.inkSoft}>{n}</text>
                <path d={`M${PXL + 250} ${rowY(i) - 10} L ${PXL + PWD - 50 - ((i * 53) % 120)} ${rowY(i) - 10}`} stroke={C.inkSoft} strokeWidth={6} strokeLinecap="round" opacity={0.6} />
              </g>
            );
          })}
        </g>
        {/* the highlighter */}
        {f >= 16 && (
          <g transform={`translate(${penX} ${penY}) rotate(${38 + (f > dryAt ? Math.sin(f * 1.6) * 5 : 0)})`} opacity={prog(f, 16, 22)}>
            <path d="M-10 0 L 10 0 L 16 -34 L -16 -34 Z" fill={f > dryAt ? "#e9e2c4" : HL} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
            <rect x={-30} y={-250} width={60} height={216} rx={12} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
            <rect x={-30} y={-110} width={60} height={46} fill={HL} stroke={C.ink} strokeWidth={5} />
          </g>
        )}
        {/* dry */}
        {f > dryAt + 4 && [0, 1, 2].map((i) => <path key={i} d={`M${penX + 70 + i * 26} ${penY - 70 - i * 30} l 22 -14`} stroke={C.ink} strokeWidth={5} strokeLinecap="round" opacity={0.4 + 0.6 * Math.abs(Math.sin(f / 3 + i))} />)}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The director moves a scene and your marked pages go up in the air, out of order. */
type Scatter = { type: "scatter"; seconds: number; line: string; accent: string; say: string; labels: string[]; goAt?: number };
const ScatterScene: React.FC<{ s: Scatter }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const goAt = s.goAt ?? 34;
  const CX = 560, CY = 1150;
  const spots: [number, number, number][] = [[-330, -280, -24], [-70, -340, 14], [210, -330, 32], [330, -150, -18], [-360, -90, 20], [120, -200, -36]];
  return (
    <AbsoluteFill>
      <Sfx name="pop" at={8} vol={0.6} />
      <Sfx name="toss" at={goAt} vol={0.8} />
      <Sfx name="slide" at={goAt + 6} vol={0.4} />
      <Sfx name="cine/toing" at={goAt + 14} vol={0.4} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the director, off to the side, and what they said */}
        <Cloud x={400} y={625} w={600} h={160} at={8} text={s.say} size={42} hot />
        {/* you */}
        <Ink d={`M${CX - 170} ${CY + 180} C ${CX - 170} ${CY + 90}, ${CX - 80} ${CY + 64}, ${CX} ${CY + 64} C ${CX + 80} ${CY + 64}, ${CX + 170} ${CY + 90}, ${CX + 170} ${CY + 180}`} start={2} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Face x={CX} y={CY} r={92} panic={0.9 * prog(f, goAt - 4, goAt + 14)} start={4} />
        {/* the pages */}
        {s.labels.slice(0, 6).map((lab, i) => {
          const sp = spots[i];
          const go = spring({ frame: f - goAt - i * 2, fps, config: { damping: 13, mass: 0.8 } });
          const drift = Math.max(0, f - goAt - 14);
          const x = CX + 150 + (sp[0] - 150) * go + Math.sin((f + i * 20) / 11) * 14 * go;
          const y = CY + 120 + (sp[1] - 120) * go + drift * 0.9 + Math.cos((f + i * 31) / 13) * 12 * go;
          const rot = 6 + (sp[2] - 6) * go + Math.sin((f + i * 17) / 9) * 12 * go;
          return (
            <g key={i} transform={`translate(${x} ${y}) rotate(${rot})`} opacity={prog(f, 4, 12)}>
              <rect x={-66} y={-84} width={132} height={168} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
              <text x={0} y={-44} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={24} letterSpacing={2} fill={C.ink}>{lab}</text>
              <rect x={-48} y={-22} width={74} height={18} fill={HL} opacity={i % 2 ? 0.9 : 0} />
              <path d="M-48 -12 L 48 -12 M-48 12 L 34 12 M-48 36 L 44 36 M-48 60 L 20 60" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the tally sheet, the snapped pencil, the fresh ink (2026-11-20, nobody brings that one: Benedick) ----------
/** The casting director, seen over the top of the sheet: glasses, tired lines for eyes, then wide awake. */
const Caster: React.FC<{ x: number; y: number; awake: number; start?: number; k?: number }> = ({ x, y, awake, start = 0, k = 1 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (f < start) return null;
  const pop = spring({ frame: f - start, fps, config: { damping: 13, mass: 0.6 } });
  const lift = awake * 22;
  return (
    <g transform={`translate(${x} ${y - lift}) scale(${k * pop}) rotate(${(1 - awake) * 7})`}>
      <path d="M-128 196 C -128 96, -60 78, 0 78 C 60 78, 128 96, 128 196 Z" fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <circle cx={0} cy={0} r={86} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
      <path d="M-84 -20 C -92 -74, -40 -104, 8 -98 C 52 -96, 86 -66, 84 -22 C 60 -56, 20 -70, -20 -62 C -48 -58, -70 -44, -84 -20 Z" fill={DARK() ? "#8f95b8" : C.ink} />
      <path d={`M-46 ${-34 - awake * 16} L -14 ${-38 - awake * 12} M14 ${-38 - awake * 12} L 46 ${-34 - awake * 16}`} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
      <circle cx={-30} cy={-4} r={25} fill="none" stroke={C.ink} strokeWidth={5} />
      <circle cx={30} cy={-4} r={25} fill="none" stroke={C.ink} strokeWidth={5} />
      <path d="M-5 -6 L 5 -6" stroke={C.ink} strokeWidth={5} />
      {awake < 0.5 ? (
        <path d="M-42 -2 L -18 -2 M18 -2 L 42 -2" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
      ) : (
        <g><circle cx={-30} cy={-6} r={6 + awake * 5} fill={C.ink} /><circle cx={30} cy={-6} r={6 + awake * 5} fill={C.ink} /></g>
      )}
      {awake < 0.5 ? (
        <path d="M-20 44 C -8 36, 8 36, 20 44" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      ) : (
        <ellipse cx={0} cy={44} rx={13} ry={9 + awake * 7} fill={C.ink} />
      )}
    </g>
  );
};
/** Tally marks in fives: four strokes and a slash. `n` marks are down so far. */
const TallyMarks: React.FC<{ x: number; y: number; n: number; per?: number; color?: string }> = ({ x, y, n, per = 3, color = C.ink }) => (
  <g>
    {Array.from({ length: n }, (_, i) => {
      const g = Math.floor(i / 5), j = i % 5, row = Math.floor(g / per), col = g % per;
      const gx = x + col * 176, gy = y + row * 104;
      return j < 4
        ? <path key={i} d={`M${gx + j * 26} ${gy} l ${(i % 3) - 1} 66`} stroke={color} strokeWidth={7} strokeLinecap="round" />
        : <path key={i} d={`M${gx - 16} ${gy + 54} L ${gx + 96} ${gy + 10}`} stroke={color} strokeWidth={7} strokeLinecap="round" />;
    })}
  </g>
);
const SheetBoard: React.FC<{ x: number; y: number; w: number; h: number; head: string; start?: number; children?: React.ReactNode }> = ({ x, y, w, h, head, start = 0, children }) => {
  const f = useCurrentFrame();
  return (
    <g>
      <Ink d={`M${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`} start={start} dur={14} w={6} fill={PAGE} />
      <g opacity={prog(f, start + 6, start + 14)}>
        <rect x={x + w / 2 - 90} y={y - 30} width={180} height={56} rx={10} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} />
        <text x={x + 44} y={y + 96} fontFamily={F.sans} fontWeight={600} fontSize={32} letterSpacing={5} fill={C.inkSoft}>{head}</text>
        <path d={`M${x + 44} ${y + 120} L ${x + w - 44} ${y + 120}`} stroke={C.inkSoft} strokeWidth={3} />
        {children}
      </g>
    </g>
  );
};
/** The casting director's tally sheet: one name, ticked again and again. */
type Tally = { type: "tally"; seconds: number; line: string; accent: string; head: string; name: string; marks?: number; from?: number; every?: number };
const TallyScene: React.FC<{ s: Tally }> = ({ s }) => {
  const f = useCurrentFrame();
  const X = 170, Y = 610, W = 720, H = 640;
  const total = s.marks ?? 23, from = s.from ?? 20, every = s.every ?? 5;
  const n = Math.max(0, Math.min(total, Math.floor((f - from) / every) + 1));
  const g = Math.floor(Math.max(0, n - 1) / 5), j = Math.max(0, n - 1) % 5;
  const px = X + 70 + (g % 3) * 176 + j * 26, py = Y + 300 + Math.floor(g / 3) * 104 + 66;
  return (
    <AbsoluteFill>
      {Array.from({ length: total }, (_, i) => (i % 2 === 0 ? <Sfx key={i} name="cine/tick" at={from + i * every} vol={0.3} /> : null))}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <SheetBoard x={X} y={Y} w={W} h={H} head={s.head}>
          <text x={X + 44} y={Y + 220} fontFamily={F.sans} fontWeight={600} fontSize={84} letterSpacing={6} fill={C.orange}>{s.name}</text>
          <TallyMarks x={X + 70} y={Y + 300} n={n} />
        </SheetBoard>
        {f >= from - 6 && (
          <g transform={`translate(${px + 8} ${py + 4}) rotate(${142 + Math.sin(f / 1.6) * 4})`} opacity={prog(f, from - 6, from)}>
            <path d="M0 0 L -13 -40 L 13 -40 Z" fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
            <rect x={-13} y={-270} width={26} height={230} fill={C.orange} stroke={C.ink} strokeWidth={5} />
            <rect x={-13} y={-300} width={26} height={30} fill="#d9898a" stroke={C.ink} strokeWidth={5} />
          </g>
        )}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
/** One more walks in saying the same name; one more tick, and the pencil snaps. */
type Snap = { type: "snap"; seconds: number; line: string; accent: string; say: string; inAt?: number; snapAt?: number };
const SnapScene: React.FC<{ s: Snap }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inAt = s.inAt ?? 40, snapAt = s.snapAt ?? 110;
  const open = prog(f, inAt - 14, inAt);
  const walk = spring({ frame: f - inAt, fps, config: { damping: 14 } });
  const sn = f >= snapAt ? spring({ frame: f - snapAt, fps, config: { damping: 8, mass: 0.5 } }) : 0;
  const press = prog(f, snapAt - 26, snapAt);
  const DX = 700, DY = 640;
  return (
    <AbsoluteFill>
      <Sfx name="cine/click" at={inAt - 14} vol={0.6} />
      <Sfx name="pop" at={inAt + 12} vol={0.6} />
      <Sfx name="pencil_short" at={snapAt - 24} vol={0.6} />
      <Sfx name="cine/impact" at={snapAt} vol={0.5} />
      <Sfx name="cine/toing" at={snapAt + 6} vol={0.5} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the door, and one more of him */}
        <Ink d={`M${DX} ${DY + 440} L ${DX} ${DY} L ${DX + 210} ${DY} L ${DX + 210} ${DY + 440}`} start={0} dur={14} w={6} />
        <path d={`M${DX} ${DY} L ${DX + 210 - open * 150} ${DY + open * 26} L ${DX + 210 - open * 150} ${DY + 440 + open * 22} L ${DX} ${DY + 440} Z`} fill={PAPER_FILL} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" opacity={prog(f, 8, 16)} />
        {f >= inAt && (
          <g transform={`translate(${(1 - walk) * 90} 0)`} opacity={Math.min(1, walk * 1.4)}>
            <path d={`M${DX + 40} ${DY + 440} C ${DX + 40} ${DY + 300}, ${DX + 80} ${DY + 270}, ${DX + 130} ${DY + 270} C ${DX + 180} ${DY + 270}, ${DX + 220} ${DY + 300}, ${DX + 220} ${DY + 440} Z`} fill="rgba(232,121,43,0.35)" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
            <Face x={DX + 130} y={DY + 190} r={70} hope={1} start={inAt} />
          </g>
        )}
        {f >= inAt + 12 && (() => {
          const bp = spring({ frame: f - inAt - 12, fps, config: { damping: 9, mass: 0.5 } });
          return (
            <g transform={`translate(${DX - 70} ${DY + 20 + Math.sin(f / 9) * 4}) scale(${bp})`}>
              <rect x={-190} y={-62} width={380} height={124} rx={62} fill={PAGE} stroke={C.ink} strokeWidth={6} />
              <path d="M110 58 L 150 104 L 150 56 Z" fill={PAGE} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
              <text x={0} y={18} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={58} fill={C.orange}>{s.say}</text>
            </g>
          );
        })()}
        {/* the casting director and the desk */}
        <Caster x={300} y={930} awake={0} start={4} />
        <Ink d={`M80 1140 C 300 1132, 520 1148, 640 1140`} start={2} dur={14} w={8} />
        {/* the pencil: pressed down, then in two */}
        <g transform={`translate(${560 + sn * 30} ${1120 + press * 6}) rotate(${-32 + sn * 26})`}>
          <path d="M0 0 L -13 -40 L 13 -40 Z" fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <rect x={-13} y={-150} width={26} height={110} fill={C.orange} stroke={C.ink} strokeWidth={5} />
        </g>
        <g transform={`translate(${560 - 80 + sn * 16} ${1120 - 128 - sn * 120 + press * 6}) rotate(${-32 - sn * 52})`}>
          <rect x={-13} y={-130} width={26} height={130} fill={C.orange} stroke={C.ink} strokeWidth={5} />
          <rect x={-13} y={-160} width={26} height={30} fill="#d9898a" stroke={C.ink} strokeWidth={5} />
        </g>
        {f >= snapAt && f < snapAt + 20 && [0, 1, 2, 3, 4].map((i) => {
          const a = -150 + i * 34, r0 = 34 + sn * 20, r1 = 74 + sn * 40;
          return <path key={i} d={`M${500 + Math.cos(a * Math.PI / 180) * r0} ${985 + Math.sin(a * Math.PI / 180) * r0} L ${500 + Math.cos(a * Math.PI / 180) * r1} ${985 + Math.sin(a * Math.PI / 180) * r1}`} stroke={C.orange} strokeWidth={7} strokeLinecap="round" opacity={1 - prog(f, snapAt + 6, snapAt + 20)} />;
        })}
        {f >= snapAt + 2 && (
          <text x={560} y={1290} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={96} fill={C.orange} transform={`rotate(-6 560 1290) scale(1)`} opacity={Math.min(1, sn * 1.5)}>snap.</text>
        )}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
/** The next name goes down in fresh ink, and the casting director looks up. */
type Fresh = { type: "fresh"; seconds: number; line: string; accent: string; head: string; old: string; name: string; from: string; writeAt?: number; fromAt?: number; upAt?: number };
const FreshScene: React.FC<{ s: Fresh }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const X = 150, Y = 590, W = 780, H = 470;
  const wAt = s.writeAt ?? 40, fAt = s.fromAt ?? wAt + 60, upAt = s.upAt ?? fAt + 40;
  const n = Math.max(0, Math.min(s.name.length, Math.floor((f - wAt) / 2)));
  const up = f >= upAt ? spring({ frame: f - upAt, fps, config: { damping: 10, mass: 0.6 } }) : 0;
  const glint = 0.5 + 0.5 * Math.sin(f / 5);
  return (
    <AbsoluteFill>
      <Sfx name="pencil_long" at={wAt} vol={0.6} />
      <Sfx name="cine/ping" at={wAt + s.name.length * 2 + 4} vol={0.5} />
      <Sfx name="pencil_short" at={fAt} vol={0.4} />
      <Sfx name="boop_hi" at={upAt} vol={0.6} />
      <AbsoluteFill style={{ background: `radial-gradient(circle 330px at 540px ${Y + 300}px, rgba(242,183,91,${0.2 * prog(f, wAt, wAt + 40)}) 0%, rgba(242,183,91,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <SheetBoard x={X} y={Y} w={W} h={H} head={s.head}>
          <text x={X + 44} y={Y + 186} fontFamily={F.sans} fontWeight={600} fontSize={40} letterSpacing={4} fill={C.inkSoft}>{s.old}</text>
          <g opacity={0.55}><TallyMarks x={X + 330} y={Y + 142} n={15} per={3} color={C.inkSoft} /></g>
          <path d={`M${X + 44} ${Y + 236} L ${X + W - 44} ${Y + 236}`} stroke={C.inkSoft} strokeWidth={3} />
          <text x={X + 44} y={Y + 336} fontFamily={F.serifI} fontStyle="italic" fontSize={86} fill={C.orange}>{s.name.slice(0, n)}</text>
          <text x={X + 48} y={Y + 410} fontFamily={F.sans} fontWeight={600} fontSize={38} letterSpacing={3} fill={C.ink} opacity={prog(f, fAt, fAt + 12)}>{s.from}</text>
          {n >= s.name.length && [0, 1, 2].map((i) => (
            <path key={i} d={`M${X + W - 96 + i * 22} ${Y + 262 - i * 16} l 0 -22 M${X + W - 107 + i * 22} ${Y + 251 - i * 16} l 22 0`} stroke={C.orange} strokeWidth={5} strokeLinecap="round" opacity={0.3 + 0.7 * Math.abs(Math.sin(f / 6 + i))} />
          ))}
        </SheetBoard>
        {/* the pen */}
        {f >= wAt - 8 && n < s.name.length && (
          <g transform={`translate(${X + 56 + (n / s.name.length) * 640} ${Y + 340}) rotate(${30 + Math.sin(f / 1.5) * 3})`} opacity={prog(f, wAt - 8, wAt)}>
            <path d="M0 0 L -12 -44 L 12 -44 Z" fill={C.orange} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
            <rect x={-15} y={-250} width={30} height={206} rx={8} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} />
          </g>
        )}
        <circle cx={X + 60} cy={Y + 350} r={6 + glint * 3} fill={C.orange} opacity={n > 0 ? 0.8 : 0} />
        {/* the casting director, over the bottom edge of the sheet */}
        <Caster x={540} y={1172 + (1 - up) * 22} awake={up} start={6} k={0.8} />
        {up > 0.3 && [-1, 1].map((d) => [0, 1].map((i) => (
          <path key={`${d}${i}`} d={`M${540 + d * (118 + i * 34)} ${1086 - i * 32} l ${d * 26} -20`} stroke={C.orange} strokeWidth={6} strokeLinecap="round" opacity={Math.min(1, up)} />
        )))}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- Milo (Canberk, 2026-11-16: one recurring actor in every drawn film) ----------
/** Milo: a working actor in his late twenties. Messy dark hair, a long mustard scarf, a tote bag always overflowing
 *  with scripts. The same drawing every film: use this component, never redraw him. George is his inner voice. */
const MUSTARD = "#dba423";
const Milo: React.FC<{ x: number; y: number; r?: number; panic?: number; hope?: number; tilt?: number; start?: number; /** where his tote bag sits (video px), if it is in the shot */ tote?: [number, number]; /** the tote tips and the scripts slide out (0 to 1) */ spill?: number }> = ({ x, y, r = 84, panic = 0, hope = 0, tilt = 0, start = 0, tote, spill = 0 }) => {
  const f = useCurrentFrame();
  if (f < start) return null;
  const k = r / 78, op = prog(f, start, start + 8);
  const swing = Math.sin(f / 12) * 4 + panic * Math.sin(f / 3) * 3;
  return (
    <>
      {tote && (
        <g transform={`translate(${tote[0]} ${tote[1]}) rotate(${-6 + spill * 62}) scale(${k})`} opacity={op}>
          {[[-34, -14, -16], [0, -26, 4], [32, -12, 18]].map(([px, py, pr], i) => (
            <g key={i} transform={`translate(${px + spill * (30 + i * 16)} ${py - 78 - spill * (40 + i * 34)}) rotate(${pr + spill * i * 14})`}>
              <rect x={-30} y={-44} width={60} height={88} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
              <path d="M-18 -24 L 18 -24 M-18 -8 L 10 -8 M-18 8 L 16 8" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" />
            </g>
          ))}
          <path d="M-44 -70 C -44 -150, 44 -150, 44 -70" fill="none" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
          <path d="M-74 -72 L 74 -72 L 64 84 L -64 84 Z" fill="#efe2c6" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <path d="M-36 -6 L 36 -6 M-36 16 L 20 16" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />
        </g>
      )}
      <Face x={x} y={y} r={r} panic={panic} hope={hope} tilt={tilt} start={start} />
      <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${k})`} opacity={op}>
        {/* the hair: never combed */}
        <path d="M-78 -16 L -92 -58 L -62 -50 L -60 -96 L -30 -68 L -10 -112 L 12 -72 L 40 -104 L 46 -64 L 84 -78 L 76 -20 C 50 -52, -20 -60, -74 -18 Z" fill={DARK() ? "#3a2a22" : C.ink} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
        {/* the mustard scarf: wound once, one long end */}
        <g transform={`rotate(${swing} 34 96)`}>
          <path d="M16 92 L 60 86 L 86 300 L 44 308 Z" fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <path d="M50 306 l 2 22 M62 304 l 4 22 M74 302 l 6 22" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          <path d="M34 150 L 68 144 M40 210 L 76 204" stroke="rgba(33,26,21,0.35)" strokeWidth={5} strokeLinecap="round" />
        </g>
        <path d="M-62 56 C -30 92, 30 92, 62 56 L 68 98 C 30 130, -30 130, -68 98 Z" fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        <path d="M-40 92 C -14 108, 14 108, 40 92" fill="none" stroke="rgba(33,26,21,0.35)" strokeWidth={5} strokeLinecap="round" />
      </g>
    </>
  );
};

// ---------- Milo's corkboard of searched names (2026-11-22, backstage list: what actors searched this week) ----------
/** Index cards pinned to cork. Each card shows a name; at its `flips` frame it turns over to its count of speeches
 *  (real numbers from the library on the day), or, with `ask`, to an empty search bar with a blinking cursor.
 *  4 cards sit 2 by 2 on the board (the hook scene), 3 in a column, 1 big. `milo`: he stands under the board;
 *  `snag`: his scarf is caught on the card's pin and the tote spills when the card turns. */
type Cards = { type: "cards"; seconds: number; line: string; accent: string; cards: { name: string; count?: number; unit?: string; ask?: boolean }[];
  /** scene frame each card turns over (the first scene of a film starts 62 frames in); none = the names stay up */
  flips?: number[]; milo?: boolean; snag?: boolean; size?: number };
const CardsScene: React.FC<{ s: Cards }> = ({ s }) => {
  const f = useCurrentFrame();
  const n = s.cards.length;
  const lay: { x: number; y: number; w: number; h: number; fs: number; rot: number }[] =
    n >= 4 ? [[290, 850], [690, 836], [286, 1082], [694, 1090]].map(([x, y], i) => ({ x, y, w: 356, h: 196, fs: 46, rot: [-3, 2.5, 2, -2.5][i] }))
    : n === 1 ? [{ x: 500, y: 800, w: 720, h: 380, fs: 104, rot: -2 }]
    : s.cards.map((_, i) => ({ x: 500, y: 660 + i * 262, w: 700, h: 226, fs: 62, rot: [-1.6, 1.4, -1][i % 3] }));
  const board = n >= 4 ? [70, 706, 840, 520] : n === 1 ? [90, 560, 820, 480] : [100, 510, 800, 820];
  const split = (t: string) => { const out: string[] = []; let cur = ""; for (const w of t.split(" ")) { if ((cur + " " + w).trim().length > 15 && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } if (cur) out.push(cur); return out; };
  const flipOf = (i: number) => s.flips?.[i];
  const snagAt = flipOf(0) ?? 9999;
  const mx = n === 1 ? 300 : 250, my = n === 1 ? 1250 : 1362;
  return (
    <AbsoluteFill>
      {s.cards.map((_, i) => <Sfx key={`p${i}`} name="pop" at={6 + i * 5} vol={0.4} />)}
      {s.cards.map((_, i) => flipOf(i) != null ? <Sfx key={`f${i}`} name={s.cards[i].ask ? "cine/toing" : "toss"} at={flipOf(i)!} vol={0.5} /> : null)}
      {s.cards.map((c, i) => flipOf(i) != null && !c.ask ? <Sfx key={`n${i}`} name="cine/ping" at={flipOf(i)! + 7} vol={0.4} /> : null)}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the corkboard */}
        <rect x={board[0] + 12} y={board[1] + 14} width={board[2]} height={board[3]} fill="rgba(21,16,12,0.18)" />
        <Ink d={`M${board[0]} ${board[1]} L ${board[0] + board[2]} ${board[1]} L ${board[0] + board[2]} ${board[1] + board[3]} L ${board[0]} ${board[1] + board[3]} Z`} start={0} dur={14} w={12} color="#6b4a2c" fill={CORK} />
        {[[0.13, 0.2], [0.82, 0.12], [0.5, 0.55], [0.2, 0.86], [0.9, 0.8], [0.66, 0.34]].map(([a, b], i) => (
          <circle key={i} cx={board[0] + a * board[2]} cy={board[1] + b * board[3]} r={5} fill="rgba(107,74,44,0.35)" opacity={prog(f, 10, 18)} />
        ))}
        {s.cards.map((c, i) => {
          const L = lay[i], at = 4 + i * 5, fl = flipOf(i);
          const land = prog(f, at, at + 10);
          if (land <= 0) return null;
          const p = fl == null ? 0 : prog(f, fl, fl + 12);
          const sx = Math.abs(Math.cos(p * Math.PI)), back = p > 0.5;
          const lines = split(c.name), lh = L.fs * 1.12;
          const blink = Math.floor(f / 9) % 2 === 0;
          return (
            <g key={i} transform={`translate(${L.x} ${L.y - (1 - land) * 40}) rotate(${L.rot + Math.sin(p * Math.PI) * 4})`} opacity={land}>
              <g transform={`scale(${Math.max(0.02, sx)} ${1 + Math.sin(p * Math.PI) * 0.06})`}>
                <rect x={-L.w / 2 + 8} y={-L.h / 2 + 10} width={L.w} height={L.h} fill="rgba(21,16,12,0.22)" />
                <rect x={-L.w / 2} y={-L.h / 2} width={L.w} height={L.h} fill={back && !c.ask ? "#15100c" : "#fffdf7"} stroke="#15100c" strokeWidth={6} />
                {!back && (
                  <>
                    <path d={`M${-L.w / 2 + 24} ${-L.h / 2 + 34} L ${L.w / 2 - 24} ${-L.h / 2 + 34}`} stroke="rgba(203,75,0,0.55)" strokeWidth={3} />
                    {lines.map((t, k) => (
                      <text key={k} x={0} y={(k - (lines.length - 1) / 2) * lh + L.fs * 0.36 + 10} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={L.fs} fill="#15100c">{t}</text>
                    ))}
                  </>
                )}
                {back && !c.ask && (
                  <>
                    <text x={-L.w * 0.2} y={L.h * 0.26} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={L.h * 0.74} fill="#f08a3c">{c.count}</text>
                    <text x={L.w * 0.16} y={-6} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={L.fs * 0.74} fill="#fbf7f0">{c.unit ?? (c.count === 1 ? "speech" : "speeches")}</text>
                    <text x={L.w * 0.16} y={L.fs * 0.74} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={L.fs * 0.5} fill="rgba(251,247,240,0.7)">{c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name}</text>
                  </>
                )}
                {back && c.ask && (
                  <>
                    <rect x={-L.w / 2 + 44} y={-62} width={L.w - 88} height={124} rx={62} fill="#15100c" />
                    <circle cx={-L.w / 2 + 116} cy={-4} r={22} fill="none" stroke="#fbf7f0" strokeWidth={7} />
                    <path d={`M${-L.w / 2 + 132} 12 L ${-L.w / 2 + 150} 30`} stroke="#fbf7f0" strokeWidth={7} strokeLinecap="round" />
                    {blink && <rect x={-L.w / 2 + 180} y={-32} width={7} height={64} fill="#f08a3c" />}
                  </>
                )}
              </g>
              {/* the pin */}
              <circle cx={0} cy={-L.h / 2 + 4} r={n === 1 ? 20 : 14} fill="#c0392b" stroke="#15100c" strokeWidth={5} />
            </g>
          );
        })}
        {/* Milo under his board */}
        {s.milo && (
          <>
            {s.snag && (
              <g opacity={prog(f, 8, 16)}>
                {/* the scarf, caught on the pin again */}
                <path d={`M${mx + 20} ${my + 78} L ${mx + 62} ${my + 96} L ${lay[0].x - lay[0].w / 2 + 96 + Math.sin(f / 5) * 3} ${lay[0].y + lay[0].h / 2 - 4} L ${lay[0].x - lay[0].w / 2 + 56} ${lay[0].y + lay[0].h / 2 - 10} Z`} fill={MUSTARD} stroke="#15100c" strokeWidth={6} strokeLinejoin="round" />
                <circle cx={lay[0].x - lay[0].w / 2 + 76} cy={lay[0].y + lay[0].h / 2 - 12} r={18} fill="#c0392b" stroke="#15100c" strokeWidth={5} />
              </g>
            )}
            <Ink d={`M${mx - 170} ${my + 200} C ${mx - 170} ${my + 110}, ${mx - 80} ${my + 84}, ${mx} ${my + 84} C ${mx + 80} ${my + 84}, ${mx + 170} ${my + 110}, ${mx + 170} ${my + 200}`} start={4} dur={12} w={6} fill={LOOK === "bold" ? "#f8f4ec" : "rgba(232,121,43,0.35)"} />
            <Milo x={mx} y={my} r={n === 1 ? 84 : 74} tilt={s.snag ? 10 : -6} panic={s.snag ? 0.7 * (1 - prog(f, snagAt, snagAt + 14)) : 0} hope={s.snag ? prog(f, snagAt + 6, snagAt + 22) : 0.4} start={4}
              tote={n === 1 ? [720, 1330] : [590, 1420]} spill={s.snag ? prog(f, snagAt - 26, snagAt - 6) : 0} />
          </>
        )}
      </svg>
      {/* the hook: big, bold, there from frame 0 (it is the cover) */}
      <AbsoluteFill style={{ alignItems: "center", padding: "262px 60px 0" }}>
        <Rise at={2}><Headline text={s.line} accent={s.accent} color={C.ink} size={s.size ?? 92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- the audition notice, the tower of Complete Works, buried (2026-11-21, story + how-to: Viola) ----------
/** The notice on the wall: the play, the part circled in orange, what to bring. You look up at it, and the question marks start. */
type Notice = { type: "notice"; seconds: number; line: string; accent: string; head: string; play: string; role: string; ask: string; /** scene frame the circle goes round the part (the first scene of a film starts 62 frames in) */ circleAt?: number; /** scene frame the question marks start */ askAt?: number };
const NoticeScene: React.FC<{ s: Notice }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = s.circleAt ?? 40, ask = s.askAt ?? 72;
  const NX = 640, NY = 880, NW = 560, NH = 520, NK = 0.8;
  const sway = Math.sin(f / 26) * 1.2 - 2;
  const marks: [number, number, number][] = [[110, 1130, 0], [190, 1050, 12], [335, 1040, 24]];
  return (
    <AbsoluteFill>
      <Sfx name="pencil_long" at={at} vol={0.5} />
      {marks.map((m, i) => <Sfx key={i} name={i === 2 ? "cine/toing" : "pop"} at={ask + m[2]} vol={0.45} />)}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(${NX} ${NY}) scale(${NK}) translate(${-NX} ${-NY}) rotate(${sway} ${NX} ${NY - NH / 2})`}>
          <rect x={NX - NW / 2 + 12} y={NY - NH / 2 + 12} width={NW} height={NH} fill="rgba(33,26,21,0.12)" />
          <Ink d={`M${NX - NW / 2} ${NY - NH / 2} L ${NX + NW / 2} ${NY - NH / 2} L ${NX + NW / 2} ${NY + NH / 2} L ${NX - NW / 2} ${NY + NH / 2} Z`} start={0} dur={14} w={6} fill="#ffffff" />
          <g opacity={prog(f, 8, 18)}>
            <text x={NX} y={NY - 172} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={34} letterSpacing={10} fill={C.inkSoft}>{s.head}</text>
            <text x={NX} y={NY - 92} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={64} fill={C.ink}>{s.play}</text>
            <path d={`M${NX - 200} ${NY - 54} L ${NX + 200} ${NY - 54}`} stroke={C.inkSoft} strokeWidth={3} />
            <text x={NX} y={NY + 76} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={112} letterSpacing={8} fill={C.ink}>{s.role}</text>
            <text x={NX} y={NY + 190} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={50} fill={C.ink}>{s.ask}</text>
          </g>
          {/* the part, circled */}
          <Ink d={`M${NX - 214} ${NY + 44} C ${NX - 230} ${NY - 52}, ${NX + 190} ${NY - 70}, ${NX + 226} ${NY + 26} C ${NX + 250} ${NY + 124}, ${NX - 190} ${NY + 140}, ${NX - 222} ${NY + 36}`} start={at} dur={16} w={8} color={C.orange} />
          {/* the pin */}
          <circle cx={NX} cy={NY - NH / 2 + 30} r={16} fill={C.orange} stroke={C.ink} strokeWidth={5} opacity={prog(f, 4, 10)} />
        </g>
        {/* you, looking up at it */}
        <Ink d="M130 1440 C 130 1350, 220 1324, 300 1324 C 380 1324, 470 1350, 470 1440" start={4} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Milo x={300} y={1240} r={84} tilt={8} panic={0.55 * prog(f, ask, ask + 24)} start={4} tote={[620, 1340]} />
        {marks.map((m, i) => {
          const p = spring({ frame: f - ask - m[2], fps, config: { damping: 9, mass: 0.5 } });
          return p <= 0 ? null : (
            <text key={i} x={m[0]} y={m[1] - Math.sin((f + i * 9) / 9) * 8} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={110 * p} fill={i === 1 ? C.orange : C.ink} transform={`rotate(${(i - 1) * 14} ${m[0]} ${m[1]})`}>?</text>
          );
        })}
      </svg>
      {/* the hook: big, bold, there from frame 0 (it is the cover) */}
      <AbsoluteFill style={{ alignItems: "center", padding: "262px 56px 0" }}>
        <Rise at={2}><Headline text={s.line} accent={s.accent} color={C.ink} size={100} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** One book of the tower: a fat spine with its title, sticky notes poking out of the pages. */
const TOME_H = 64;
const TOMES: [number, number, number, string][] = [
  [0, 340, 0, "COMPLETE WORKS"], [-16, 300, -2, "SHAKESPEARE"], [14, 320, 1.5, "THE COMEDIES"], [-8, 290, -1, "COMPLETE WORKS"],
  [18, 310, 2, "ALL THE PLAYS"], [-14, 280, -2, "COMPLETE WORKS"], [8, 300, 1, "THE PLAYS"], [-4, 270, -1.5, "COMPLETE WORKS"]];
const Tome: React.FC<{ w: number; label: string; k: number; notes?: number }> = ({ w, label, k, notes = 0 }) => (
  <g>
    {Array.from({ length: Math.min(3, Math.max(0, Math.floor(notes))) }, (_, j) => {
      const right = (k + j) % 2 === 0;
      return <rect key={j} x={right ? w / 2 - 6 : -w / 2 - 34} y={-TOME_H + 8 + j * 17} width={40} height={15} fill={j === 1 ? "#ffb7a3" : HL} stroke={C.ink} strokeWidth={3} />;
    })}
    <rect x={-w / 2} y={-TOME_H} width={w} height={TOME_H} rx={7} fill={k % 3 === 1 ? "#f3c39c" : PAPER_FILL} stroke={C.ink} strokeWidth={6} />
    <path d={`M${-w / 2 + 28} ${-TOME_H} L ${-w / 2 + 28} 0 M${w / 2 - 28} ${-TOME_H} L ${w / 2 - 28} 0`} stroke={C.inkSoft} strokeWidth={3} />
    <text x={0} y={-TOME_H / 2 + 9} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={23} letterSpacing={3} fill={C.ink}>{label}</text>
  </g>
);

/** Every Complete Works you own lands on the floor, one on another, taller than you, bristling with sticky notes; you flip pages beside it. */
type Tower = { type: "tower"; seconds: number; line: string; accent: string; from?: number; every?: number };
const TowerScene: React.FC<{ s: Tower }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const FY = 1270, TX = 700;
  const from = s.from ?? 8, every = s.every ?? 10;
  const n = TOMES.length;
  const landed = Math.max(0, Math.min(n, Math.floor((f - from) / every) + 1));
  const tall = landed / n;
  const lean = Math.sin(f / 8) * tall * tall * 2.6;
  const flip = (f % 14) / 14;
  return (
    <AbsoluteFill>
      {TOMES.map((_, i) => <Sfx key={i} name="thud" at={from + i * every} vol={0.3 + i * 0.03} />)}
      {TOMES.map((_, i) => (i % 2 ? <Sfx key={`n${i}`} name="pop" at={from + i * every + 14} vol={0.35} /> : null))}
      <Sfx name="pencil_short" at={from + 30} vol={0.4} />
      <Sfx name="cine/toing" at={from + n * every + 6} vol={0.4} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {/* the floor */}
        <Ink d={`M80 ${FY} C 360 ${FY - 8}, 720 ${FY + 8}, 1000 ${FY}`} start={0} dur={14} w={8} />
        {/* the tower */}
        <g transform={`rotate(${lean} ${TX} ${FY})`}>
          {TOMES.map(([dx, w, tilt, label], i) => {
            const land = from + i * every;
            if (f < land - 8) return null;
            const d = spring({ frame: f - land + 8, fps, config: { damping: 11, mass: 0.6, stiffness: 170 } });
            return (
              <g key={i} transform={`translate(${TX + dx} ${FY - 4 - i * TOME_H - (1 - d) * 760}) rotate(${tilt + (1 - d) * 10})`}>
                <Tome w={w} label={label} k={i} notes={(f - land - 10) / 7} />
              </g>
            );
          })}
        </g>
        {/* you, cross legged beside it, flipping */}
        <Ink d={`M130 ${FY - 2} C 130 ${FY - 96}, 220 ${FY - 124}, 300 ${FY - 124} C 380 ${FY - 124}, 470 ${FY - 96}, 470 ${FY - 2}`} start={2} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Milo x={300} y={FY - 214} r={86} tilt={6} panic={0.15 + 0.6 * tall} start={2} tote={[112, FY - 74]} />
        <g transform={`translate(330 ${FY - 62})`} opacity={prog(f, 6, 14)}>
          <path d="M0 0 C -40 -22, -100 -22, -136 -6 L -136 52 C -100 36, -40 36, 0 58 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <path d="M0 0 C 40 -22, 100 -22, 136 -6 L 136 52 C 100 36, 40 36, 0 58 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <path d={`M0 2 C ${Math.cos(flip * Math.PI) * 60} ${-30 - Math.sin(flip * Math.PI) * 70}, ${Math.cos(flip * Math.PI) * 110} ${-20 - Math.sin(flip * Math.PI) * 60}, ${Math.cos(flip * Math.PI) * 132} ${-4 - Math.sin(flip * Math.PI) * 30}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          <rect x={96} y={-22} width={34} height={18} fill={HL} stroke={C.ink} strokeWidth={3} transform="rotate(-8 96 -22)" />
        </g>
        {/* it is taller than you now */}
        {tall >= 1 && [0, 1, 2].map((i) => <path key={i} d={`M${TX + 210 + i * 22} ${FY - n * TOME_H + 30 + i * 46} l 26 ${-10 + i * 10}`} stroke={C.ink} strokeWidth={5} strokeLinecap="round" opacity={0.3 + 0.7 * Math.abs(Math.sin(f / 4 + i))} />)}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** The tower tips and buries you. Sticky notes flutter down; then one hand comes up out of the heap, holding a phone. */
type Buried = { type: "buried"; seconds: number; line: string; accent: string; tipAt?: number; handAt?: number };
const BuriedScene: React.FC<{ s: Buried }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const FY = 1270, TX = 700;
  const tipAt = s.tipAt ?? 30, handAt = s.handAt ?? tipAt + 44;
  const n = TOMES.length;
  const heap: [number, number, number][] = [[250, FY, -4], [450, FY - 6, 8], [340, FY - 66, -12], [200, FY - 118, 22], [490, FY - 108, -26], [350, FY - 146, 6], [262, FY - 206, -18], [430, FY - 200, 30]];
  const wob = Math.sin(f / 3.2) * prog(f, 0, tipAt) * 5;
  const hand = spring({ frame: f - handAt, fps, config: { damping: 11, mass: 0.7 } });
  const hit = prog(f, tipAt + 8, tipAt + 30);
  return (
    <AbsoluteFill>
      <Sfx name="cine/toing" at={Math.max(0, tipAt - 22)} vol={0.5} />
      <Sfx name="toss" at={tipAt} vol={0.7} />
      {[0, 1, 2].map((i) => <Sfx key={i} name="thud" at={tipAt + 12 + i * 5} vol={0.8 - i * 0.15} />)}
      <Sfx name="cine/ping" at={handAt + 4} vol={0.55} />
      <AbsoluteFill style={{ background: `radial-gradient(circle 250px at 392px ${FY - 500}px, rgba(232,121,43,${0.4 * hand}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={`M80 ${FY} C 360 ${FY - 8}, 720 ${FY + 8}, 1000 ${FY}`} start={-20} dur={10} w={8} />
        {/* you, for one more second */}
        <Ink d={`M130 ${FY - 2} C 130 ${FY - 96}, 220 ${FY - 124}, 300 ${FY - 124} C 380 ${FY - 124}, 470 ${FY - 96}, 470 ${FY - 2}`} start={-20} dur={10} w={6} fill="rgba(232,121,43,0.35)" />
        <Milo x={300} y={FY - 214} r={86} tilt={10} panic={0.4 + 0.6 * prog(f, tipAt - 18, tipAt)} start={-20} tote={[112, FY - 74]} spill={prog(f, tipAt + 6, tipAt + 20)} />
        {/* the hand that makes it out, with the phone */}
        {hand > 0.01 && (
          <g transform={`translate(392 ${FY - 150 - hand * 200}) rotate(${-6 + Math.sin(f / 10) * 3})`}>
            <path d="M0 150 L 0 10" stroke={C.ink} strokeWidth={56} strokeLinecap="round" />
            <path d="M0 150 L 0 10" stroke="#f0b98e" strokeWidth={44} strokeLinecap="round" />
            <g transform="translate(0 -92) rotate(8)">
              <rect x={-62} y={-112} width={124} height={224} rx={22} fill={C.stage} stroke={C.ink} strokeWidth={7} />
              <rect x={-48} y={-94} width={96} height={188} rx={10} fill="#2a1a10" />
              <rect x={-34} y={-70} width={68} height={12} rx={6} fill={C.orange} opacity={0.6 + 0.4 * Math.sin(f / 6)} />
              <path d="M-34 -36 L 34 -36 M-34 -10 L 20 -10 M-34 16 L 30 16" stroke="rgba(239,230,216,0.5)" strokeWidth={7} strokeLinecap="round" />
            </g>
            <circle cx={0} cy={2} r={36} fill="#f0b98e" stroke={C.ink} strokeWidth={6} />
            <path d="M-30 -8 L 30 -8 M-32 8 L 32 8" stroke={C.ink} strokeWidth={4} strokeLinecap="round" opacity={0.5} />
          </g>
        )}
        {/* the tower, standing, then all of it on you */}
        {TOMES.map(([dx, w, tilt, label], i) => {
          const go = spring({ frame: f - tipAt - (n - 1 - i) * 0.6, fps, config: { damping: 14, mass: 0.9, stiffness: 120 } });
          const a = (wob * Math.PI) / 180;
          const sx = TX + dx - Math.sin(a) * i * TOME_H * 2.2, sy = FY - 4 - i * TOME_H;
          const [hx, hy, hr] = heap[i];
          const x = sx + (hx - sx) * go, y = sy + (hy - sy) * go - Math.sin(Math.min(1, go) * Math.PI) * (40 + i * 26);
          return (
            <g key={i} transform={`translate(${x} ${y}) rotate(${tilt - wob * (i / n) * 2 + (hr - tilt) * go})`}>
              <Tome w={w} label={label} k={i} notes={3 * (1 - prog(f, tipAt, tipAt + 6))} />
            </g>
          );
        })}
        {/* the scarf got caught, as always: its end sticks out of the heap */}
        {f > tipAt + 14 && (
          <g transform={`translate(545 ${FY - 30}) rotate(${-64 + Math.sin(f / 9) * 5})`} opacity={prog(f, tipAt + 14, tipAt + 20)}>
            <path d="M-20 0 L 20 0 L 26 150 L -16 154 Z" fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
            <path d="M-10 152 l 0 22 M4 152 l 3 22 M18 150 l 6 22" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          </g>
        )}
        {/* dust, and the sticky notes coming down after */}
        {hit > 0 && hit < 1 && [0, 1, 2, 3].map((i) => (
          <circle key={i} cx={(i % 2 ? 560 : 130) + (i % 2 ? 1 : -1) * hit * (30 + i * 24)} cy={FY - 24 - hit * (24 + i * 18)} r={(20 - i * 3) * (1 - hit * 0.4)} fill="none" stroke={C.inkSoft} strokeWidth={4} opacity={1 - hit} />
        ))}
        {f > tipAt + 4 && Array.from({ length: 9 }, (_, i) => {
          const t = f - tipAt - 4 - i * 2;
          if (t < 0) return null;
          const x = 640 - i * 52 + Math.sin((t + i * 13) / 9) * 30, y = Math.min(FY - 12 - (i % 3) * 4, 700 + i * 22 + t * (6 + (i % 3)));
          return <rect key={i} x={x} y={y} width={40} height={30} fill={i % 3 === 1 ? "#ffb7a3" : HL} stroke={C.ink} strokeWidth={3} transform={`rotate(${y >= FY - 24 ? i * 23 : t * (5 + i)} ${x + 20} ${y + 15})`} />;
        })}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 1am, off book tomorrow (2026-11-23, story + how-to: Run it with the lines hidden) ----------
const BED_FLOOR = 1310, BED_TOP = 1150;
const SKIN_LIT = "#f0b98e";
/** Milo's bed from the side, lights off: headboard on the left, the mattress, the footboard, an alarm clock on a shelf above the
 *  headboard. `pillow` up = propped against the headboard (he is sitting), flat = he has given up. */
const BedFrame: React.FC<{ start?: number; clock?: string; pillow?: "up" | "flat" }> = ({ start = 0, clock, pillow = "up" }) => {
  const f = useCurrentFrame();
  const soft = DARK() ? "#3a3632" : "#ffffff";
  return (
    <>
      <Ink d={`M60 ${BED_FLOOR} C 360 ${BED_FLOOR - 8}, 720 ${BED_FLOOR + 8}, 1020 ${BED_FLOOR}`} start={start} dur={14} w={8} />
      <Ink d={`M110 ${BED_FLOOR} L 110 880 C 110 846, 152 846, 152 880 L 152 ${BED_FLOOR} Z`} start={start + 2} dur={12} w={6} fill={PAPER_FILL} />
      <Ink d={`M770 ${BED_FLOOR} L 770 1092 C 770 1066, 802 1066, 802 1092 L 802 ${BED_FLOOR} Z`} start={start + 2} dur={12} w={6} fill={PAPER_FILL} />
      <Ink d={`M152 ${BED_TOP} L 770 ${BED_TOP} L 770 1238 L 152 1238 Z`} start={start + 4} dur={12} w={6} fill={PAGE} />
      <g opacity={prog(f, start + 6, start + 14)}>
        {pillow === "up" ? (
          <g transform="translate(206 1046) rotate(9)"><rect x={-44} y={-112} width={88} height={224} rx={38} fill={soft} stroke={C.ink} strokeWidth={6} /></g>
        ) : (
          <g transform="translate(262 1126)"><rect x={-112} y={-30} width={224} height={60} rx={28} fill={soft} stroke={C.ink} strokeWidth={6} /></g>
        )}
        {clock && (
          <>
            <path d="M70 794 L 272 794" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
            <rect x={86} y={702} width={170} height={86} rx={14} fill="#070605" stroke={C.ink} strokeWidth={5} />
            <text x={171} y={766} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={58} letterSpacing={2} fill={C_PAPER.orange}>{clock}</text>
          </>
        )}
      </g>
    </>
  );
};
/** The page he keeps peeking at, lying on the blanket: the part's name on it. */
const BedPage: React.FC<{ x: number; y: number; label: string; hot?: number }> = ({ x, y, label, hot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${12 - hot * 6}) scale(${1 + hot * 0.12})`}>
    <rect x={-62} y={-80} width={124} height={160} fill="#ffffff" stroke={hot > 0.3 ? C_PAPER.orange : C_PAPER.ink} strokeWidth={5 + hot * 3} />
    <text x={0} y={-44} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={19} letterSpacing={3} fill={C_PAPER.ink}>{label}</text>
    <path d="M-42 -22 L 42 -22 M-42 0 L 30 0 M-42 22 L 40 22 M-42 44 L 18 44" stroke="rgba(33,26,21,0.45)" strokeWidth={5} strokeLinecap="round" />
  </g>
);
const blanketFill = () => (DARK() ? "#2b2723" : "#e9dec8");
/** The blanket when he sits up: over his chest, a bump for the knees. */
const BLANKET_UP = `M236 ${BED_TOP} C 236 1116, 300 1102, 380 1106 C 440 1106, 468 1040, 540 1036 C 612 1034, 640 1100, 700 1124 C 735 1136, 760 1140, 770 ${BED_TOP} L 770 1238 L 236 1238 Z`;
const BLANKET_DOWN = `M392 ${BED_TOP} C 410 1072, 520 1050, 610 1074 C 690 1094, 750 1124, 770 ${BED_TOP} L 770 1238 L 392 1238 Z`;

/** The hook scene. 1am, lights off, Milo sitting up in bed with the phone, its glow on the ceiling; the clock ticks over. */
type OneAm = { type: "oneam"; seconds: number; line: string; accent: string; clock?: [string, string]; /** scene frame the clock ticks over (the first scene of a film starts 62 frames in) */ tickAt?: number; page: string };
const OneAmScene: React.FC<{ s: OneAm }> = ({ s }) => {
  const f = useCurrentFrame();
  const tick = s.tickAt ?? 150, clock = s.clock ?? ["1:00", "1:01"];
  const fl = 0.86 + 0.14 * Math.sin(f / 7);
  const worry = prog(f, tick, tick + 20);
  return (
    <AbsoluteFill>
      <Sfx name="cine/tick" at={tick} vol={0.6} />
      <Sfx name="cine/heartbeat" at={tick + 6} vol={0.35} />
      {/* the phone's glow: on him, and thrown up on the ceiling */}
      <AbsoluteFill style={{ background: `radial-gradient(circle 300px at 470px 985px, rgba(232,121,43,${0.34 * fl}) 0%, rgba(232,121,43,0) 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 330px 74px at 430px 660px, rgba(232,121,43,${0.3 * fl}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <path d="M505 960 L 160 660 L 700 660 Z" fill={`rgba(232,121,43,${0.05 * fl})`} />
        <BedFrame start={0} clock={f < tick ? clock[0] : clock[1]} />
        <Ink d={`M214 ${BED_TOP + 4} C 214 1082, 272 1052, 330 1052 C 388 1052, 446 1082, 446 ${BED_TOP + 4}`} start={2} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Milo x={330} y={958} r={84} tilt={5} panic={0.25 + 0.4 * worry} start={2} tote={[892, 1222]} />
        <Ink d={BLANKET_UP} start={4} dur={12} w={6} fill={blanketFill()} />
        <g opacity={prog(f, 10, 18)}>
          <path d="M300 1160 L 740 1160 M330 1196 L 760 1196" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" strokeDasharray="14 16" />
          <BedPage x={676} y={1070} label={s.page} />
          {/* the phone on his knees */}
          <g transform="translate(508 1004) rotate(-14)">
            <rect x={-38} y={-66} width={76} height={132} rx={14} fill={C_PAPER.stage} stroke={C.ink} strokeWidth={6} />
            <path d="M-38 -40 L -52 -34 L -52 30 L -38 40" fill={`rgba(232,121,43,${0.7 * fl})`} />
          </g>
          <circle cx={500} cy={1050} r={26} fill={SKIN_LIT} stroke={C.ink} strokeWidth={6} />
          {/* the scarf, still on, hanging off the side of the bed */}
          <g transform={`translate(262 1232) rotate(${Math.sin(f / 14) * 3})`}>
            <path d="M-20 0 L 20 0 L 24 64 L -18 68 Z" fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
            <path d="M-12 68 l 0 16 M2 67 l 2 16 M16 66 l 4 16" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          </g>
        </g>
      </svg>
      {/* the hook: big, bold, there from frame 0 (it is the cover) */}
      <AbsoluteFill style={{ alignItems: "center", padding: "262px 56px 0" }}>
        <Rise at={2}><Headline text={s.line} accent={s.accent} color={C.ink} size={98} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** He says a line, he peeks at the page, he says a line, he peeks. Over the bed, where the sheep should be, pages hop the fence
 *  and a counter of peeks climbs. */
type Peeks = { type: "peeks"; seconds: number; line: string; accent: string; from?: number; every?: number; /** the count he is already on */ count?: number; page: string };
const PeeksScene: React.FC<{ s: Peeks }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const from = s.from ?? 30, every = s.every ?? 24, c0 = s.count ?? 12;
  const total = Math.max(1, Math.floor((s.seconds * FPS + T - from) / every));
  const n = f < from ? -1 : Math.floor((f - from) / every);
  const ph = f < from ? 1 : ((f - from) % every) / every;
  const pk = ph < 0.5 ? Math.sqrt(Math.sin(ph * 2 * Math.PI)) : 0;
  const bump = spring({ frame: f - from - Math.max(0, n) * every, fps, config: { damping: 9, mass: 0.4 } });
  const fl = 0.86 + 0.14 * Math.sin(f / 7);
  const BX = 742, BY = 664;
  return (
    <AbsoluteFill>
      {Array.from({ length: total }, (_, i) => <Sfx key={i} name={i % 2 ? "cine/pong" : "pop"} at={from + i * every} vol={0.4} />)}
      <AbsoluteFill style={{ background: `radial-gradient(circle 300px at 470px 985px, rgba(232,121,43,${0.3 * fl}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <BedFrame start={0} clock="1:07" />
        <Ink d={`M214 ${BED_TOP + 4} C 214 1082, 272 1052, 330 1052 C 388 1052, 446 1082, 446 ${BED_TOP + 4}`} start={2} dur={12} w={6} fill="rgba(232,121,43,0.35)" />
        <Milo x={330 + pk * 16} y={958} r={84} tilt={-3 + pk * 19} panic={0.35 + 0.35 * Math.min(1, Math.max(0, n) / 5)} start={2} tote={[892, 1222]} />
        <Ink d={BLANKET_UP} start={4} dur={12} w={6} fill={blanketFill()} />
        <g opacity={prog(f, 8, 16)}>
          <path d="M300 1160 L 740 1160 M330 1196 L 760 1196" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" strokeDasharray="14 16" />
          {/* the peek: his eyes go to the page */}
          <path d="M420 985 L 606 1050" stroke={C.orange} strokeWidth={6} strokeLinecap="round" strokeDasharray="6 18" opacity={pk} />
          <BedPage x={676} y={1070} label={s.page} hot={pk} />
          <g transform="translate(508 1004) rotate(-14)">
            <rect x={-38} y={-66} width={76} height={132} rx={14} fill={C_PAPER.stage} stroke={C.ink} strokeWidth={6} />
            <path d="M-38 -40 L -52 -34 L -52 30 L -38 40" fill={`rgba(232,121,43,${0.7 * fl})`} />
          </g>
          <circle cx={500} cy={1050} r={26} fill={SKIN_LIT} stroke={C.ink} strokeWidth={6} />
          {/* mouthing the line, between peeks */}
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${432 + i * 20} ${972 - i * 10} q ${12 + i * 4} ${14 + i * 5}, 0 ${28 + i * 10}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round"
              opacity={(1 - pk) * (f >= from ? 0.25 + 0.75 * Math.abs(Math.sin(f / 3 + i)) : 0.6)} />
          ))}
          <g transform={`translate(262 1232) rotate(${Math.sin(f / 14) * 3})`}>
            <path d="M-20 0 L 20 0 L 24 64 L -18 68 Z" fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
            <path d="M-12 68 l 0 16 M2 67 l 2 16 M16 66 l 4 16" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          </g>
        </g>
        {/* where the sheep should be */}
        <circle cx={436} cy={826} r={11} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} opacity={prog(f, 10, 16)} />
        <circle cx={486} cy={782} r={17} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} opacity={prog(f, 14, 20)} />
        <Ink d={`M${BX - 236} ${BY} C ${BX - 236} ${BY - 196}, ${BX + 236} ${BY - 196}, ${BX + 236} ${BY} C ${BX + 236} ${BY + 196}, ${BX - 236} ${BY + 196}, ${BX - 236} ${BY} Z`} start={16} dur={14} w={6} fill={PAPER_FILL} />
        <g opacity={prog(f, 24, 32)}>
          {/* the fence */}
          <path d={`M${BX - 96} ${BY + 54} L ${BX + 96} ${BY + 54} M${BX - 96} ${BY + 86} L ${BX + 96} ${BY + 86} M${BX - 66} ${BY + 34} L ${BX - 66} ${BY + 112} M${BX} ${BY + 34} L ${BX} ${BY + 112} M${BX + 66} ${BY + 34} L ${BX + 66} ${BY + 112}`} stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
          <text x={BX} y={BY - 62} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={58} fill={C.ink}>
            peeks: <tspan fontFamily={F.serif} fontStyle="normal" fontWeight={600} fontSize={58 + 16 * (1 - Math.min(1, bump)) * (n >= 0 ? 1 : 0)} fill={C.orange}>{c0 + Math.max(0, n + 1)}</tspan>
          </text>
          {/* a page hops the fence for every peek */}
          {Array.from({ length: total }, (_, i) => {
            const t = f - from - i * every;
            if (t < 0 || t > 22) return null;
            const p = t / 22;
            return (
              <g key={i} transform={`translate(${BX - 150 + p * 300} ${BY + 74 - Math.sin(p * Math.PI) * 112}) rotate(${-20 + p * 220})`}>
                <rect x={-20} y={-27} width={40} height={54} fill="#ffffff" stroke={C_PAPER.ink} strokeWidth={4} />
                <path d="M-11 -11 L 11 -11 M-11 2 L 7 2 M-11 14 L 10 14" stroke="rgba(33,26,21,0.5)" strokeWidth={3} strokeLinecap="round" />
              </g>
            );
          })}
        </g>
      </svg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 290 }}>
        <Rise at={6}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** He drops flat and pulls the pillow over his face (the scarf is caught on the bedpost, the tote goes over). Then the turn:
 *  the pillow comes off and one arm comes up out of the blanket with the phone. */
type Pillow = { type: "pillow"; seconds: number; line: string; accent: string; dropAt?: number; turnAt?: number; mutter?: string };
const PillowScene: React.FC<{ s: Pillow }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dropAt = s.dropAt ?? 16, turnAt = s.turnAt ?? 56;
  const d = spring({ frame: f - dropAt, fps, config: { damping: 12, mass: 0.7, stiffness: 160 } });
  const o = spring({ frame: f - turnAt, fps, config: { damping: 13, mass: 0.7 } });
  const hand = spring({ frame: f - turnAt - 4, fps, config: { damping: 11, mass: 0.7 } });
  const soft = DARK() ? "#3a3632" : "#ffffff";
  return (
    <AbsoluteFill>
      <Sfx name="toss" at={dropAt} vol={0.6} />
      <Sfx name="thud" at={dropAt + 5} vol={0.7} />
      <Sfx name="cine/toing" at={dropAt + 10} vol={0.35} />
      <Sfx name="cine/ping" at={turnAt + 6} vol={0.55} />
      <AbsoluteFill style={{ background: `radial-gradient(circle 280px at 566px ${1010 - hand * 150}px, rgba(232,121,43,${0.42 * hand}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <BedFrame start={0} clock="1:12" pillow="flat" />
        {/* the scarf, caught on the bedpost as always, pulled tight */}
        <g opacity={prog(f, 6, 12)}>
          <path d={`M124 872 L 148 858 L 262 ${1040 + Math.sin(f / 5) * 3} L 236 1058 Z`} fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <circle cx={132} cy={864} r={17} fill={MUSTARD} stroke={C.ink} strokeWidth={6} />
        </g>
        <Milo x={302} y={1070} r={84} tilt={-80} panic={0.5 * (1 - o)} hope={o} start={2} tote={[892, 1222]} spill={prog(f, dropAt + 6, dropAt + 20)} />
        {/* the arm that comes up with the phone */}
        {hand > 0.01 && (
          <g transform={`translate(566 ${1094 - hand * 200}) rotate(${-5 + Math.sin(f / 10) * 3})`}>
            <path d="M0 150 L 0 10" stroke={C.ink} strokeWidth={56} strokeLinecap="round" />
            <path d="M0 150 L 0 10" stroke={SKIN_LIT} strokeWidth={44} strokeLinecap="round" />
            <g transform="translate(0 -92) rotate(8)">
              <rect x={-62} y={-112} width={124} height={224} rx={22} fill={C_PAPER.stage} stroke={C.ink} strokeWidth={7} />
              <rect x={-48} y={-94} width={96} height={188} rx={10} fill="#2a1a10" />
              <rect x={-34} y={-70} width={68} height={12} rx={6} fill={C_PAPER.orange} opacity={0.6 + 0.4 * Math.sin(f / 6)} />
              <path d="M-34 -36 L 34 -36 M-34 -10 L 20 -10 M-34 16 L 30 16" stroke="rgba(239,230,216,0.5)" strokeWidth={7} strokeLinecap="round" />
            </g>
            <circle cx={0} cy={2} r={36} fill={SKIN_LIT} stroke={C.ink} strokeWidth={6} />
          </g>
        )}
        <Ink d={BLANKET_DOWN} start={4} dur={12} w={6} fill={blanketFill()} />
        <path d="M430 1160 L 740 1160 M450 1196 L 760 1196" stroke={C.inkSoft} strokeWidth={4} strokeLinecap="round" strokeDasharray="14 16" opacity={prog(f, 10, 18)} />
        {/* the pillow, over his face */}
        {f >= dropAt && (
          <g transform={`translate(${306 - o * 30} ${1050 - (1 - d) * 520 - o * 190}) rotate(${-8 - o * 34})`}>
            <rect x={-132} y={-72} width={264} height={144} rx={62} fill={soft} stroke={C.ink} strokeWidth={6} />
            <path d="M-70 -20 C -30 -34, 30 -34, 70 -20" fill="none" stroke={C.inkSoft} strokeWidth={5} strokeLinecap="round" />
          </g>
        )}
        {s.mutter && f >= dropAt + 12 && f < turnAt + 6 && (
          <text x={500} y={930 - prog(f, dropAt + 12, turnAt) * 20} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={70} fill={C.inkSoft}
            opacity={prog(f, dropAt + 12, dropAt + 18) * (1 - prog(f, turnAt, turnAt + 6))} transform={`rotate(-6 500 930)`}>{s.mutter}</text>
        )}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", padding: "290px 56px 0" }}>
        <Rise at={turnAt}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- take fourteen of a self tape (2026-11-24, backstage: the Tape room's own words and countdown) ----------
/** Milo's self tape corner at home: a floor lamp, his mark taped on the floor, the phone propped on the windowsill with its
 *  red dot on, and a clapper on the floor that counts the takes. Three beats share the room:
 *  hook (take 14, the hook as big text from frame 0), doubts (his inner voice: one thought bubble after another, the lamp
 *  glows hotter on the first), slump (the clapper flips on, he slides down the wall, the scarf is caught on the lamp and
 *  pulls it over, the tote spills; then the turn: the phone on the sill lights up). */
type SelfTape = { type: "selftape"; seconds: number; line: string; accent: string; beat: "hook" | "doubts" | "slump"; count?: number;
  /** scene frames the clapper flips to the next take */ flips?: number[]; thoughts?: string[]; at?: number[]; slumpAt?: number; turnAt?: number };
const ST_FLOOR = 1384, ST_LX = 150, ST_MX = 440, ST_MY = 930;
const SelfTapeScene: React.FC<{ s: SelfTape }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flips = s.flips ?? [], thoughts = s.thoughts ?? [];
  const at = (k: number) => s.at?.[k] ?? 30 + k * 34;
  const slumpAt = s.beat === "slump" ? s.slumpAt ?? 30 : 1e6, turnAt = s.beat === "slump" ? s.turnAt ?? 62 : 1e6;
  const d = spring({ frame: f - slumpAt, fps, config: { damping: 12, mass: 0.8, stiffness: 150 } });
  const o = spring({ frame: f - turnAt, fps, config: { damping: 13, mass: 0.7 } });
  const passed = flips.filter((x) => f >= x).length;
  const last = passed ? flips[passed - 1] : -100;
  const bump = spring({ frame: f - last, fps, config: { damping: 8, mass: 0.4 } });
  const hot = s.beat === "doubts" ? prog(f, at(0), at(0) + 14) * (1 - prog(f, at(1) + 10, at(1) + 30) * 0.6) : 0;
  const fl = 0.9 + 0.1 * Math.sin(f / 6);
  const tiltL = d * 15;
  const rad = (tiltL * Math.PI) / 180;
  // where the lamp shade's near corner is once the lamp leans (the scarf is tied to it)
  const hx = ST_LX + Math.cos(rad) * 60 + Math.sin(rad) * 520, hy = ST_FLOOR - Math.cos(rad) * 520 + Math.sin(rad) * 60;
  const my = ST_MY + d * 236, mtilt = d * 12;
  const panic = s.beat === "hook" ? 0.3 : s.beat === "doubts" ? Math.min(0.95, 0.35 + 0.6 * prog(f, at(0), at(Math.max(0, thoughts.length - 1)) + 10)) : 0.7 * (1 - o);
  const spots = [{ x: 286, y: 652, w: 430 }, { x: 772, y: 668, w: 410 }, { x: 250, y: 1150, w: 440 }, { x: 706, y: 1124, w: 480 }];
  const rec = Math.sin(f / 5) > -0.2 ? 1 : 0.25;
  return (
    <AbsoluteFill>
      {flips.map((x, i) => <React.Fragment key={i}><Sfx name="cine/click" at={x} vol={0.7} /><Sfx name="thud" at={x + 2} vol={0.45} /></React.Fragment>)}
      {thoughts.map((_, k) => <React.Fragment key={k}><Sfx name="pop" at={at(k)} vol={0.6} /><Sfx name={k % 2 ? "boop_hi" : "boop_lo"} at={at(k) + 4} vol={0.4} /></React.Fragment>)}
      {s.beat === "slump" && <><Sfx name="toss" at={slumpAt} vol={0.6} /><Sfx name="thud" at={slumpAt + 6} vol={0.7} /><Sfx name="cine/toing" at={slumpAt + 9} vol={0.4} /><Sfx name="cine/ping" at={turnAt + 4} vol={0.55} /></>}
      {/* the lamp's light, hotter when he starts to doubt it */}
      <AbsoluteFill style={{ background: `radial-gradient(circle ${430 + hot * 120}px at ${ST_LX + d * 130}px 900px, rgba(232,121,43,${(0.3 + hot * 0.3) * fl}) 0%, rgba(232,121,43,0) 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle 250px at 800px 960px, rgba(232,121,43,${0.5 * o}) 0%, rgba(232,121,43,0) 100%)` }} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <defs><clipPath id="stfloor"><rect x={0} y={0} width={1080} height={ST_FLOOR} /></clipPath></defs>
        <Ink d={`M50 ${ST_FLOOR} C 360 ${ST_FLOOR - 8}, 720 ${ST_FLOOR + 8}, 1030 ${ST_FLOOR}`} start={0} dur={14} w={8} />
        {/* the window, night outside, and the sill the phone leans on */}
        <Ink d="M690 742 L 916 742 L 916 1030 L 690 1030 Z" start={2} dur={14} w={6} fill={DARK() ? "#070605" : "#dfe7ee"} />
        <g opacity={prog(f, 10, 18)}>
          <path d="M803 742 L 803 1030 M690 880 L 916 880" stroke={C.ink} strokeWidth={5} />
          <circle cx={862} cy={800} r={22} fill="#f1ece2" opacity={0.85} />
          <path d="M664 1036 L 942 1036" stroke={C.ink} strokeWidth={12} strokeLinecap="round" />
          {/* the phone, propped, its red dot on */}
          <g transform="translate(796 968) rotate(-7)">
            <rect x={-34} y={-62} width={68} height={124} rx={13} fill={C_PAPER.stage} stroke={C.ink} strokeWidth={6} />
            <rect x={-22} y={-44} width={44} height={10} rx={5} fill={C_PAPER.orange} opacity={o} />
            <circle cx={0} cy={-46} r={5} fill={C.ink} opacity={1 - o} />
          </g>
          <circle cx={752} cy={912} r={11} fill="#e5484d" opacity={rec * (1 - o)} />
        </g>
        {/* his mark */}
        <Ink d={`M${ST_MX - 46} ${ST_FLOOR - 22} L ${ST_MX + 46} ${ST_FLOOR + 22} M${ST_MX + 46} ${ST_FLOOR - 22} L ${ST_MX - 46} ${ST_FLOOR + 22}`} start={8} dur={10} w={9} color={C.orange} />
        {/* the clapper that counts the takes */}
        <g transform={`translate(786 1232) rotate(${-3 + (1 - Math.min(1, bump)) * (passed ? 8 : 0)})`} opacity={prog(f, 12, 20)}>
          <rect x={-112} y={-36} width={224} height={120} rx={8} fill={PAGE} stroke={C.ink} strokeWidth={6} />
          <g transform={`rotate(${-9 - (1 - Math.min(1, bump)) * (passed ? 16 : 0)} -112 -42)`}>
            <rect x={-112} y={-74} width={224} height={34} rx={6} fill={C.ink} />
            {[0, 1, 2, 3].map((i) => <path key={i} d={`M${-86 + i * 54} -74 l 22 0 l -18 34 l -22 0 Z`} fill={C.paper} />)}
          </g>
          <text x={-92} y={38} fontFamily={F.sans} fontWeight={600} fontSize={34} letterSpacing={4} fill={C.ink}>TAKE</text>
          <text x={62} y={62} textAnchor="middle" fontFamily={F.serif} fontWeight={600} fontSize={92 + 14 * (1 - Math.min(1, bump)) * (passed ? 1 : 0)} fill={C.orange}>{(s.count ?? 14) + passed}</text>
        </g>
        {/* the floor lamp; in the slump the scarf pulls it over */}
        <g transform={`rotate(${tiltL} ${ST_LX} ${ST_FLOOR})`}>
          <Ink d={`M${ST_LX} ${ST_FLOOR} L ${ST_LX} 900`} start={2} dur={12} w={9} />
          <Ink d={`M${ST_LX - 56} ${ST_FLOOR} L ${ST_LX + 56} ${ST_FLOOR}`} start={2} dur={8} w={12} />
          <Ink d={`M${ST_LX - 84} 900 L ${ST_LX - 54} 790 L ${ST_LX + 54} 790 L ${ST_LX + 84} 900 Z`} start={4} dur={12} w={6} fill={`rgba(232,121,43,${0.75 + hot * 0.25})`} />
        </g>
        {/* Milo on his mark */}
        <g clipPath="url(#stfloor)">
          <g transform={`translate(0 ${d * 236}) rotate(${mtilt} ${ST_MX} ${ST_MY + 330})`}>
            <Ink d={`M${ST_MX} ${ST_MY + 92} L ${ST_MX} ${ST_MY + 112} C ${ST_MX - 62} ${ST_MY + 122}, ${ST_MX - 84} ${ST_MY + 160}, ${ST_MX - 88} ${ST_MY + 216} L ${ST_MX - 92} ${ST_MY + 330} L ${ST_MX + 92} ${ST_MY + 330} L ${ST_MX + 88} ${ST_MY + 216} C ${ST_MX + 84} ${ST_MY + 160}, ${ST_MX + 62} ${ST_MY + 122}, ${ST_MX} ${ST_MY + 112}`} start={4} dur={14} w={6} fill={DARK() ? "#2b2723" : "rgba(232,121,43,0.35)"} />
            <Ink d={`M${ST_MX - 84} ${ST_MY + 170} C ${ST_MX - 122} ${ST_MY + 230}, ${ST_MX - 124} ${ST_MY + 290}, ${ST_MX - 112} ${ST_MY + 340} M${ST_MX + 84} ${ST_MY + 170} C ${ST_MX + 122} ${ST_MY + 230}, ${ST_MX + 124} ${ST_MY + 290}, ${ST_MX + 112} ${ST_MY + 340}`} start={10} dur={10} w={6} />
          </g>
          <g opacity={1 - d}>
            <Ink d={`M${ST_MX - 44} ${ST_MY + 330} L ${ST_MX - 46} ${ST_MY + 446} L ${ST_MX - 70} ${ST_MY + 452} M${ST_MX + 44} ${ST_MY + 330} L ${ST_MX + 46} ${ST_MY + 446} L ${ST_MX + 70} ${ST_MY + 452}`} start={12} dur={10} w={6} />
          </g>
        </g>
        {/* sitting: his legs out in front of him */}
        {d > 0.05 && <path d={`M${ST_MX + 50} ${ST_FLOOR - 40} L ${ST_MX + 236} ${ST_FLOOR - 30} L ${ST_MX + 250} ${ST_FLOOR - 78} M${ST_MX + 40} ${ST_FLOOR - 14} L ${ST_MX + 206} ${ST_FLOOR - 10} L ${ST_MX + 218} ${ST_FLOOR - 56}`} fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={d} />}
        {/* the scarf, caught on the lamp as always, pulled tight */}
        {s.beat === "slump" && (
          <g opacity={prog(f, 6, 12)}>
            <path d={`M${hx} ${hy - 10} L ${hx + 8} ${hy + 22} L ${ST_MX - 30} ${my + 96} L ${ST_MX - 52} ${my + 62} Z`} fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
            <circle cx={hx} cy={hy + 4} r={16} fill={MUSTARD} stroke={C.ink} strokeWidth={6} />
          </g>
        )}
        <Milo x={ST_MX + d * 14} y={my} r={84} tilt={mtilt} panic={panic} hope={o} start={4} tote={[584, ST_FLOOR - 92]} spill={prog(f, slumpAt + 6, slumpAt + 20)} />
        {/* saying it again, between doubts */}
        {s.beat === "hook" && [0, 1, 2].map((i) => (
          <path key={i} d={`M${ST_MX + 104 + i * 22} ${ST_MY + 4 - i * 12} q ${12 + i * 4} ${14 + i * 5}, 0 ${28 + i * 10}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" opacity={0.25 + 0.75 * Math.abs(Math.sin(f / 3 + i))} />
        ))}
        {/* what the inner voice says */}
        {thoughts.map((t, k) => {
          if (f < at(k)) return null;
          const sp = spots[k % spots.length], pop = spring({ frame: f - at(k), fps, config: { damping: 9, mass: 0.5 } });
          const ls = t.split("\n"), h = ls.length > 1 ? 156 : 112, wob = Math.sin((f + sp.x) / 9) * 4;
          const tx = ST_MX + (sp.x < ST_MX ? -60 : 70), ty = ST_MY + (sp.y < ST_MY ? -92 : 70);
          return (
            <g key={k}>
              {[0.52, 0.76].map((u, i) => <circle key={i} cx={sp.x + (tx - sp.x) * u} cy={sp.y + (ty - sp.y) * u} r={(15 - i * 6) * Math.min(1, pop)} fill="#f1ece2" stroke={C_PAPER.ink} strokeWidth={4} />)}
              <g transform={`translate(${sp.x} ${sp.y + wob}) scale(${pop})`}>
                <rect x={-sp.w / 2} y={-h / 2} width={sp.w} height={h} rx={h / 2} fill={k === 0 && hot > 0.3 ? "#f6b37c" : "#f1ece2"} stroke={C_PAPER.ink} strokeWidth={6} />
                {ls.map((l, i) => <text key={i} x={0} y={(i - (ls.length - 1) / 2) * 52 + 15} textAnchor="middle" fontFamily={F.sans} fontWeight={600} fontSize={44} fill={C_PAPER.ink}>{l}</text>)}
              </g>
            </g>
          );
        })}
      </svg>
      {/* hook beat: big, bold, there from frame 0 (it is the cover) */}
      <AbsoluteFill style={{ alignItems: "center", padding: `${s.beat === "hook" ? 262 : 290}px 56px 0` }}>
        <Rise at={s.beat === "slump" ? turnAt : s.beat === "hook" ? 2 : 6}><Headline text={s.line} accent={s.accent} color={C.ink} size={s.beat === "hook" ? 96 : 92} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- Milo among the Ophelias (2026-11-25, Nobody Brings: "Stop bringing Ophelia.") ----------
/** An audition lobby where every actor but Milo holds the same Ophelia page. Three beats, like the self tape:
 *  `hook` (the room, the hook big from frame 0), `five` (each one's bubble pops with the same line and a count),
 *  `snag` (a tighter drawing: he backs away, the scarf is caught on a folding chair, the tote spills, the phone lights up). */
type Ophelias = { type: "ophelias"; seconds: number; line: string; accent: string; beat: "hook" | "five" | "snag"; page?: string; bubble?: string;
  /** scene frames the five bubbles pop (the first scene of a film starts 62 frames in) */ at?: number[]; /** snag beat: scene frames he starts backing away, the scarf pulls tight, the phone comes up */ backAt?: number; snagAt?: number; turnAt?: number };
const OpheliaFig: React.FC<{ x: number; y: number; k?: number; page: string; seed: number; lean?: number }> = ({ x, y, k = 1, page, seed, lean = 0 }) => {
  const f = useCurrentFrame();
  const talk = Math.sin((f + seed * 5) / 3.1) > 0.05;
  const bob = Math.sin((f + seed * 11) / 10) * 3;
  return (
    <g transform={`translate(${x} ${y + bob}) rotate(${lean}) scale(${k})`}>
      {/* long loose hair, the same on every one */}
      <path d="M-52 -4 C -66 -78, 66 -78, 52 -4 L 62 132 C 44 146, 32 118, 28 62 L -28 62 C -32 118, -44 146, -62 132 Z" fill={C.ink} />
      {/* the same dress */}
      <path d="M-28 44 L 28 44 L 64 262 L -64 262 Z" fill="#dfe7ee" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <circle cx={0} cy={0} r={44} fill={PAPER_FILL} stroke={C.ink} strokeWidth={5} />
      <path d="M-44 -12 C -30 -40, 30 -40, 44 -12 C 24 -22, -24 -22, -44 -12 Z" fill={C.ink} />
      {/* the same flowers in the hair */}
      {[[-32, -30], [-11, -41], [11, -41], [32, -30]].map(([fx, fy], i) => (
        <g key={i}>
          <circle cx={fx} cy={fy} r={10} fill="#ffffff" stroke={C.ink} strokeWidth={3.5} />
          <circle cx={fx} cy={fy} r={4} fill={i % 2 ? C.orange : MUSTARD} />
        </g>
      ))}
      <circle cx={-15} cy={2} r={4.5} fill={C.ink} />
      <circle cx={15} cy={2} r={4.5} fill={C.ink} />
      {talk ? <ellipse cx={0} cy={23} rx={7} ry={8} fill={C.ink} /> : <path d="M-8 23 L 8 23" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />}
      {/* the same page */}
      <g transform={`rotate(${seed % 2 ? 4 : -4} 0 160)`}>
        <rect x={-56} y={98} width={112} height={132} rx={4} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
        <text x={0} y={136} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={700} fontSize={20} letterSpacing={1.5} fill={C_PAPER.orange}>{page}</text>
        <path d="M-38 158 L 38 158 M-38 176 L 28 176 M-38 194 L 34 194 M-38 212 L 18 212" stroke={C_PAPER.inkSoft} strokeWidth={3} strokeLinecap="round" />
        <circle cx={-56} cy={150} r={11} fill={PAPER_FILL} stroke={C.ink} strokeWidth={4} />
        <circle cx={56} cy={176} r={11} fill={PAPER_FILL} stroke={C.ink} strokeWidth={4} />
      </g>
    </g>
  );
};
/** Milo from the neck down, standing (the head, hair and scarf are the Milo component). */
const MiloStanding: React.FC<{ x: number; y: number; start?: number; legs?: number }> = ({ x, y, start = 4, legs = 1 }) => (
  <>
    <Ink d={`M${x} ${y + 92} L ${x} ${y + 112} C ${x - 62} ${y + 122}, ${x - 84} ${y + 160}, ${x - 88} ${y + 216} L ${x - 92} ${y + 330} L ${x + 92} ${y + 330} L ${x + 88} ${y + 216} C ${x + 84} ${y + 160}, ${x + 62} ${y + 122}, ${x} ${y + 112}`} start={start} dur={14} w={6} fill="#f6d2b4" />
    <Ink d={`M${x - 84} ${y + 170} C ${x - 122} ${y + 230}, ${x - 124} ${y + 290}, ${x - 112} ${y + 340} M${x + 84} ${y + 170} C ${x + 122} ${y + 230}, ${x + 124} ${y + 290}, ${x + 112} ${y + 340}`} start={start + 6} dur={10} w={6} />
    <g opacity={legs}>
      <Ink d={`M${x - 44} ${y + 330} L ${x - 46} ${y + 446} L ${x - 70} ${y + 452} M${x + 44} ${y + 330} L ${x + 46} ${y + 446} L ${x + 70} ${y + 452}`} start={start + 8} dur={10} w={6} />
    </g>
  </>
);
const OP_FLOOR = 1462;
// ---------- cutout: a generic cut-paper collage scene (look "collage", src/collage.tsx) ----------
/** Build a collage beat from data: a wall and floor of paper, a cast placed on the sheet, handwritten scraps.
 *  The line is the torn title card at the top (the hook on the first scene: there from frame 0, the cover).
 *  New props for a film (a bus stop, a bed) go in new collage components built from the pieces in collage.tsx. */
type CastMember = { who: "milo" | "person"; x: number; y: number; s?: number; at?: number; dress?: string; top?: string; hair?: string; skin?: string; long?: boolean;
  outfit?: "dress" | "trousers"; hairStyle?: "long" | "bun" | "short" | "curly"; arms?: "down" | "script" | "hip" | "wave";
  /** frame windows when this one talks (mouth flaps) */ talk?: [number, number][]; panic?: number; flip?: boolean; tote?: boolean; from?: "top" | "left" | "right" };
type Cutout = { type: "cutout"; seconds: number; line: string; accent?: string; wall?: string; floor?: string; floorY?: number; titleY?: number;
  cast: CastMember[]; notes?: { text: string; x: number; y: number; rot?: number; at?: number; size?: number }[] };
const CutoutScene: React.FC<{ s: Cutout }> = ({ s }) => {
  const f = useCurrentFrame();
  const talking = (w?: [number, number][]) => (w ?? []).some(([a, b]) => f >= a && f <= b) ? 0.5 + 0.5 * Math.abs(Math.sin(f / 2.2)) : 0;
  return (
    <AbsoluteFill>
      <CollageBg wall={s.wall} floor={s.floor} floorY={s.floorY} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        {s.cast.map((c, i) => (
          <Place key={i} at={c.at ?? 0} from={c.from}>
            {c.who === "milo"
              ? <CMilo x={c.x} y={c.y} s={c.s} panic={c.panic} talk={talking(c.talk)} flip={c.flip} tote={c.tote} />
              : <CPerson x={c.x} y={c.y} s={c.s} dress={c.dress ?? CP.red} top={c.top} hair={c.hair} skin={c.skin} long={c.long} outfit={c.outfit} hairStyle={c.hairStyle} arms={c.arms} seed={i} talk={talking(c.talk)} />}
          </Place>
        ))}
        {(s.notes ?? []).map((n, i) => <CNote key={i} text={n.text} x={n.x} y={n.y} rot={n.rot} at={n.at ?? 0} size={n.size} />)}
      </svg>
      <CTitle text={s.line} accent={s.accent} y={s.titleY ?? 260} />
    </AbsoluteFill>
  );
};

// ---------- libdesk: asked for contemporary, got Chekhov, cut-paper collage (2026-11-27) ----------
/** Milo asks a paper librarian for something written this century. Three beats: "hook" (the desk, the hook card
 *  from frame 0, Chekhov already on the desk), "ask" (his ask on a scrap, The Seagull slides across the desk),
 *  "pile" (Ibsen lands on it, then the Complete Shakespeare drops on his scarf and the dust rises).
 *  All new torn paper pieces: shelves of paper spines, the desk, the books, the dust. */
type LibDesk = { type: "libdesk"; beat: "hook" | "ask" | "pile"; seconds: number; line: string; accent?: string;
  hook?: string[]; red?: number[]; ask?: string; askAt?: number; slideAt?: number; ibsenAt?: number; shakesAt?: number };
const LIB = { wall: "#24423f", shelf: "#3a2a20", wood: "#a9713d", woodDark: "#7d4f28", floor: "#b5532e", dust: "#efe4cc",
  spines: ["#b5532e", "#e2a72a", "#2d3e66", "#5f8f5a", "#c8361b", "#d9cbb0", "#7b3f6a", "#1f5c5a", "#8a5a3c"] };
const LIB_DESK = 1170, LIB_FLOOR = 1500, LIB_STACK = 470;
/** The library: a wall of paper spines on three shelves, the floor, a QUIET card. */
const LibraryWall: React.FC = () => (
  <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
    <rect width={1080} height={1920} fill={LIB.wall} filter="url(#fibre)" />
    <rect x={30} y={590} width={1020} height={640} fill={LIB.shelf} filter="url(#torn)" />
    {[0, 1, 2].map((r) => {
      let x = 52; const out: React.ReactNode[] = [];
      for (let k = 0; x < 1000; k++) {
        const w = 34 + ((k * 37 + r * 53) % 40), h = 128 + ((k * 29 + r * 17) % 44), lean = (k * 7 + r * 3) % 11 === 0 ? 7 : 0;
        out.push(<rect key={k} x={x} y={612 + r * 204 + (180 - h)} width={w} height={h} fill={LIB.spines[(k * 5 + r * 2) % LIB.spines.length]} filter="url(#tornS)" transform={lean ? `rotate(${lean} ${x} ${792 + r * 204})` : undefined} />);
        x += w + 7;
      }
      return <g key={r}>{out}<rect x={30} y={792 + r * 204} width={1020} height={16} fill="#241812" /></g>;
    })}
    <rect x={-30} y={LIB_FLOOR} width={1140} height={460} fill={LIB.floor} filter="url(#torn)" />
  </svg>
);
/** The desk: one long wooden sheet with a darker front panel and a little QUIET card. Drawn over the librarian's legs. */
const LibraryDesk: React.FC = () => (
  <g>
    <rect x={330} y={LIB_DESK} width={800} height={LIB_FLOOR - LIB_DESK + 16} fill={LIB.woodDark} filter="url(#torn)" />
    <rect x={300} y={LIB_DESK - 14} width={860} height={54} fill={LIB.wood} filter="url(#torn)" />
    <g transform="rotate(-3 900 1300)"><rect x={800} y={1262} width={200} height={84} fill={CP.cream} filter="url(#tornS)" />
      <text x={900} y={1322} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={44} fill={CP.ink}>QUIET</text></g>
  </g>
);
/** A paper book lying flat, its spine to us: the name in Archivo Black, a year on a handwritten line. (x = middle, y = its bottom) */
const PBook: React.FC<{ x: number; y: number; w: number; h: number; fill: string; name: string; sub?: string; rot?: number; ink?: string }> = ({ x, y, w, h, fill, name, sub, rot = 0, ink = CP.cream }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-w / 2} y={-h} width={w} height={h} fill={fill} filter="url(#torn)" />
    <rect x={-w / 2 + 14} y={-h + 8} width={10} height={h - 16} fill={ink} opacity={0.5} />
    <text x={sub ? -w / 2 + 40 : 0} y={-h / 2 + (sub && h > 110 ? -4 : 15)} textAnchor={sub ? "start" : "middle"} fontFamily="ArchivoBlack" fontSize={sub && h > 110 ? 46 : 40} fill={ink}>{name}</text>
    {sub && (h > 110
      ? <text x={-w / 2 + 40} y={-h / 2 + 46} fontFamily="Caveat" fontSize={46} fill={ink}>{sub}</text>
      : <text x={w / 2 - 22} y={-h / 2 + 15} textAnchor="end" fontFamily="Caveat" fontSize={44} fill={ink}>{sub}</text>)}
  </g>
);
const LibDeskScene: React.FC<{ s: LibDesk }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const talkNow = (a: number, b: number) => f >= a && f <= b ? 0.45 + 0.55 * Math.abs(Math.sin(f / 2.3)) : 0;
  const MX = 196, MS = 0.84, LX = 770, LY = 1392, LS = 1.0;
  const Librarian: React.FC<{ arms?: "down" | "hip" | "script" | "wave"; talk?: number }> = ({ arms = "down", talk = 0 }) =>
    <CPerson x={LX} y={LY} s={LS} outfit="dress" dress={CP.green} top="#7b3f6a" hair="#8f8a84" hairStyle="bun" skin={CP.skin2} arms={arms} talk={talk} seed={3} />;
  const top = LIB_DESK - 14; // books sit on the desk top
  if (s.beat === "hook") {
    return (
      <AbsoluteFill>
        <Sfx name="slide" at={PREROLL + 2} vol={0.45} />
        <Sfx name="thud" at={PREROLL + 14} vol={0.45} />
        <LibraryWall />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <Librarian arms="hip" />
          <LibraryDesk />
          <PBook x={LIB_STACK} y={top} w={380} h={84} fill={CP.red} name="CHEKHOV" sub="1896" rot={-2} />
          <CMilo x={MX} y={LIB_FLOOR + 8} s={MS} flip panic={0.55} />
        </svg>
        <CHook lines={s.hook ?? [s.line]} red={s.red} />
      </AbsoluteFill>
    );
  }
  if (s.beat === "ask") {
    const askAt = s.askAt ?? 8, slideAt = s.slideAt ?? 80;
    const k = spring({ frame: f - slideAt, fps, config: { damping: 14, mass: 0.8, stiffness: 90 } });
    const bx = 760 + (LIB_STACK - 760) * k;
    return (
      <AbsoluteFill>
        <Sfx name="pop" at={askAt} vol={0.5} />
        <Sfx name="slide" at={slideAt} vol={0.6} />
        <Sfx name="thud" at={slideAt + 12} vol={0.5} />
        <LibraryWall />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <Librarian arms={f > slideAt - 6 ? "hip" : "down"} />
          <LibraryDesk />
          {f >= slideAt && <PBook x={bx} y={top} w={380} h={84} fill={CP.red} name="CHEKHOV" sub="1896" rot={-2 * k} />}
          <CMilo x={MX} y={LIB_FLOOR + 8} s={MS} flip talk={talkNow(askAt, slideAt - 4)} panic={f > slideAt + 10 ? 0.6 : 0} />
          {s.ask && <CNote text={s.ask} x={420} y={690} rot={-3} size={58} at={askAt} />}
        </svg>
        <CTitle text={s.line} accent={s.accent} y={262} />
      </AbsoluteFill>
    );
  }
  // pile: Ibsen lands on Chekhov, then the Complete Shakespeare drops on the scarf and the dust rises
  const ibsenAt = s.ibsenAt ?? 30, shakesAt = s.shakesAt ?? 80;
  const drop = (at: number) => { const k = interpolate(f, [at - 9, at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) }); return (1 - k) * -1100; };
  const squash = f >= shakesAt ? Math.max(0, 1 - (f - shakesAt) / 10) : 0;
  const shake = f >= shakesAt ? Math.sin((f - shakesAt) * 1.9) * 7 * Math.max(0, 1 - (f - shakesAt) / 14) : 0;
  const pinned = f >= shakesAt;
  const nx = MX - 30 * MS, ny = LIB_FLOOR + 8 - 400 * MS; // the scarf at his neck (he is flipped)
  const tug = pinned ? Math.sin((f - shakesAt) / 5) * 0.5 + 0.5 : 0;
  return (
    <AbsoluteFill>
      <Sfx name="thud" at={ibsenAt} vol={0.5} />
      <Sfx name="cine/impact" at={shakesAt} vol={0.55} />
      <Sfx name="cine/toing" at={shakesAt + 10} vol={0.5} />
      <LibraryWall />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(0 ${shake})`}>
          <Librarian arms={f > shakesAt + 8 ? "hip" : "down"} />
          <LibraryDesk />
          <CMilo x={MX} y={LIB_FLOOR + 8} s={MS} flip panic={pinned ? 1 : f > ibsenAt ? 0.6 : 0.3} talk={talkNow(0, ibsenAt - 12)} />
          <PBook x={LIB_STACK} y={top + squash * 6} w={380} h={84} fill={CP.red} name="CHEKHOV" sub="1896" rot={-2} />
          {f >= ibsenAt - 9 && <PBook x={LIB_STACK + 16} y={top - 84 + drop(ibsenAt) + squash * 5} w={350} h={84} fill={CP.navy} name="IBSEN" sub="1879" rot={2} />}
          {/* the scarf: pulled tight from his neck up into the stack, caught under Shakespeare */}
          {pinned && <path d={`M${nx + 62} ${ny - 4} L ${LIB_STACK - 150 + tug * 4} ${top - 176} l 46 6 L ${nx + 104} ${ny + 30} Z`} fill={CP.mustard} filter="url(#tornS)" />}
          {f >= shakesAt - 9 && (
            <g transform={`translate(${LIB_STACK + 4} ${top - 168 + drop(shakesAt)}) scale(${1 + squash * 0.06} ${1 - squash * 0.1})`}>
              <PBook x={0} y={0} w={470} h={168} fill={CP.kraft} ink={CP.ink} name="SHAKESPEARE" sub="the complete works, 1623" rot={-1} />
            </g>
          )}
        </g>
        {/* dust: pale paper puffs rising off the stack */}
        {pinned && Array.from({ length: 9 }).map((_, k) => {
          const t = Math.min(1, (f - shakesAt - k * 1.5) / (38 + k * 4)); if (t <= 0) return null;
          const dx = (k - 4) * 66 + Math.sin(k * 2.1 + t * 3) * 22, dy = -t * (150 + (k % 3) * 70);
          return <circle key={k} cx={LIB_STACK + dx} cy={top - 60 + dy + (k % 2) * 50} r={(20 + (k % 4) * 9) * (0.5 + t)} fill={LIB.dust} opacity={0.8 * (1 - t)} filter="url(#tornS)" />;
        })}
      </svg>
      <CTitle text={s.line} accent={s.accent} y={262} />
    </AbsoluteFill>
  );
};

// ---------- sofa: three weeks without saying a monologue out loud, cut-paper collage (2026-11-28) ----------
/** Milo on the sofa on a Sunday, his audition folder on the shelf above him. Three beats: "hook" (the room, Milo
 *  flat on the sofa, the hook card from frame 0, the scarf trailing to the spilled tote), "dust" (close on the
 *  shelf: dust settles on the folder, a paper spider comes down its thread and hangs a tiny sign), "tomorrow"
 *  (the tear-off calendar keeps flipping to TOMORROW while a pot plant grows over the folder).
 *  All new torn paper pieces: the sofa, the cushion, the shelf, the folder, the spider, the calendar, the plant. */
type Sofa = { type: "sofa"; beat: "hook" | "dust" | "tomorrow"; seconds: number; line: string; accent?: string;
  hook?: string[]; red?: number[]; note?: string; noteAt?: number; spiderAt?: number; sign?: string; flips?: number[]; growAt?: number };
const SOFA = { wall: "#3b3552", floor: "#b5532e", sofa: "#5f8f5a", sofaDark: "#47704a", shelf: "#a9713d", folder: "#c8361b", dust: "#efe4cc", leaf: "#3f7d4e", leaf2: "#6aa35f", pot: "#b5532e" };
/** The audition folder: a red paper folder standing on the shelf, a cream label. (x = middle, y = its bottom) */
const PFolder: React.FC<{ x: number; y: number; k?: number; dust?: number }> = ({ x, y, k = 1, dust = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${k})`}>
    <rect x={-150} y={-208} width={300} height={208} fill={SOFA.folder} filter="url(#torn)" transform="rotate(-2)" />
    <rect x={-150} y={-232} width={120} height={40} fill={SOFA.folder} filter="url(#tornS)" transform="rotate(-2)" />
    <rect x={-112} y={-150} width={224} height={84} fill={CP.cream} filter="url(#tornS)" transform="rotate(-2)" />
    <text x={0} y={-94} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={38} fill={CP.ink} transform="rotate(-2)">AUDITIONS</text>
    {dust > 0 && <rect x={-156} y={-226} width={312} height={26} fill={SOFA.dust} opacity={0.9 * dust} filter="url(#tornS)" transform="rotate(-2)" />}
  </g>
);
/** The shelf wall, close: a plum wall, one long wooden shelf. */
const ShelfWall: React.FC<{ y: number }> = ({ y }) => (
  <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
    <rect width={1080} height={1920} fill={SOFA.wall} filter="url(#fibre)" />
    <rect x={60} y={y} width={960} height={44} fill={SOFA.shelf} filter="url(#torn)" />
    <rect x={150} y={y + 44} width={34} height={90} fill="#7d4f28" filter="url(#tornS)" />
    <rect x={896} y={y + 44} width={34} height={90} fill="#7d4f28" filter="url(#tornS)" />
  </svg>
);
const SofaScene: React.FC<{ s: Sofa }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (s.beat === "hook") {
    const FL = 1400;
    return (
      <AbsoluteFill>
        <Sfx name="cine/plink" at={PREROLL + 4} vol={0.45} />
        <Sfx name="thud" at={PREROLL + 30} vol={0.35} />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <rect width={1080} height={1920} fill={SOFA.wall} filter="url(#fibre)" />
          <rect x={-30} y={FL} width={1140} height={560} fill={SOFA.floor} filter="url(#torn)" />
          {/* the shelf above the sofa, the folder already a little dusty */}
          <rect x={470} y={900} width={470} height={30} fill={SOFA.shelf} filter="url(#torn)" />
          <PFolder x={700} y={900} k={0.78} dust={0.7} />
          {/* the sofa: back, seat, two arms, a cushion */}
          <rect x={120} y={1010} width={800} height={250} rx={40} fill={SOFA.sofaDark} filter="url(#torn)" />
          <rect x={150} y={1206} width={740} height={150} fill={SOFA.sofa} filter="url(#torn)" />
          <rect x={196} y={1090} width={150} height={120} rx={26} fill={CP.pink} filter="url(#torn)" transform="rotate(-8 270 1150)" />
          {/* Milo flat on his back, head on the cushion, staring at the ceiling */}
          <g transform="translate(800 1150) rotate(-90)"><CMilo x={0} y={0} s={0.8} tote={false} panic={0.35} /></g>
          <rect x={80} y={1120} width={110} height={290} rx={36} fill={SOFA.sofa} filter="url(#torn)" />
          <rect x={880} y={1120} width={110} height={290} rx={36} fill={SOFA.sofa} filter="url(#torn)" />
          {/* the scarf trails off the sofa to the tote, which has tipped over on the floor */}
          <path d="M452 1196 l44 4 l-20 236 l150 30 l-6 40 l-190 -36 z" fill={CP.mustard} filter="url(#tornS)" />
          <g transform="rotate(-78 640 1440)">
            <rect x={590} y={1380} width={130} height={140} fill={CP.kraft} filter="url(#torn)" />
          </g>
          <rect x={690} y={1404} width={96} height={70} fill={CP.white} filter="url(#tornS)" transform="rotate(14 738 1440)" />
          <rect x={770} y={1430} width={90} height={66} fill={CP.cream} filter="url(#tornS)" transform="rotate(-9 815 1463)" />
          {/* slow Zs */}
          {[0, 1, 2].map((k) => { const t = ((f + k * 22) % 66) / 66; return <text key={k} x={300 + k * 34 + t * 30} y={1010 - t * 150 - k * 26} fontFamily="ArchivoBlack" fontSize={34 + k * 12} fill={CP.cream} opacity={0.75 * (1 - t)}>z</text>; })}
        </svg>
        <CHook lines={s.hook ?? [s.line]} red={s.red} />
      </AbsoluteFill>
    );
  }
  const SH = 1150, FX = 400; // shelf top, folder middle
  const Milo = (panic: number) => <CMilo x={140} y={1650} s={0.7} flip tote={false} panic={panic} />;
  if (s.beat === "dust") {
    const spiderAt = s.spiderAt ?? 60, noteAt = s.noteAt ?? 6;
    const dust = cease(f, 4, 50);
    const drop = spring({ frame: f - spiderAt, fps, config: { damping: 9, mass: 0.7, stiffness: 70 } });
    const sy = 560 + drop * 330, sx = FX + 370 + Math.sin(f / 11) * 8;
    const signK = spring({ frame: f - spiderAt - 22, fps, config: { damping: 10, mass: 0.5 } });
    return (
      <AbsoluteFill>
        <Sfx name="pop" at={noteAt} vol={0.45} />
        <Sfx name="cine/toing" at={spiderAt} vol={0.5} />
        <Sfx name="cine/plink" at={spiderAt + 22} vol={0.5} />
        <ShelfWall y={SH} />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <PFolder x={FX} y={SH} k={1.2} dust={dust} />
          {/* dust motes settling */}
          {Array.from({ length: 10 }).map((_, k) => { const t = ((f + k * 13) % 80) / 80; return <circle key={k} cx={330 + k * 44 + Math.sin(k * 3 + f / 20) * 12} cy={700 + t * 200} r={5 + (k % 3) * 2} fill={SOFA.dust} opacity={0.7 * (1 - t) * dust} />; })}
          {/* the spider: a thread, a round body, eight legs, two eyes, and its tiny sign */}
          {f >= spiderAt && (
            <g>
              <rect x={sx - 1.5} y={540} width={3} height={sy - 540} fill={CP.cream} opacity={0.8} />
              <g transform={`translate(${sx} ${sy})`}>
                <g filter="url(#tornS)">
                  {[-1, 1].map((d) => [0, 1, 2, 3].map((k) => <rect key={`${d}${k}`} x={d > 0 ? 18 : -62} y={-16 + k * 12} width={44} height={6} rx={3} fill={CP.ink} transform={`rotate(${d * (-28 + k * 18)} ${d * 18} ${-13 + k * 12})`} />))}
                  <circle cx={0} cy={0} r={34} fill={CP.ink} />
                  <circle cx={-11} cy={-6} r={8} fill={CP.white} /><circle cx={11} cy={-6} r={8} fill={CP.white} />
                  <circle cx={-10} cy={-5} r={3.5} fill={CP.ink} /><circle cx={12} cy={-5} r={3.5} fill={CP.ink} />
                </g>
                {signK > 0.02 && (
                  <g transform={`translate(0 ${40}) scale(${signK}) rotate(${Math.sin(f / 9) * 4})`}>
                    <rect x={-1.5} y={0} width={3} height={34} fill={CP.cream} />
                    <rect x={-150} y={32} width={300} height={86} fill={CP.white} filter="url(#tornS)" />
                    <text x={0} y={92} textAnchor="middle" fontFamily="Caveat" fontSize={46} fill={CP.ink}>{s.sign ?? "home sweet home"}</text>
                  </g>
                )}
              </g>
            </g>
          )}
          {Milo(f > spiderAt + 10 ? 0.7 : 0.2)}
          {s.note && <CNote text={s.note} x={330} y={770} rot={-4} size={60} at={noteAt} />}
        </svg>
        <CTitle text={s.line} accent={s.accent} y={262} />
      </AbsoluteFill>
    );
  }
  // tomorrow: the calendar keeps flipping to TOMORROW, the plant grows over the folder
  const flips = s.flips ?? [20, 44, 68], growAt = s.growAt ?? 50;
  const grow = cease(f, growAt, growAt + 50);
  const leaves: [number, number, number, number][] = [[-250, -70, 30, 0.02], [-210, -150, -30, 0.1], [-150, -220, 20, 0.2], [-90, -270, -40, 0.3], [-20, -250, 35, 0.4], [50, -280, -20, 0.5],
    [110, -230, 40, 0.6], [150, -150, -35, 0.68], [90, -120, 20, 0.76], [10, -150, -25, 0.84], [-70, -110, 30, 0.9], [170, -60, -15, 0.96]];
  return (
    <AbsoluteFill>
      {flips.map((a, k) => <Sfx key={k} name="toss" at={a} vol={0.45} />)}
      <Sfx name="cine/toing" at={growAt + 46} vol={0.45} />
      <ShelfWall y={SH} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <PFolder x={FX} y={SH} k={1.2} dust={1} />
        {/* the pot at the end of the shelf and its vine creeping over the folder */}
        <path d={`M${FX + 300} ${SH - 80} q -60 -150 -250 -190 q -160 -30 -300 60`} fill="none" stroke={SOFA.leaf} strokeWidth={12} strokeLinecap="round" strokeDasharray={900} strokeDashoffset={900 * (1 - grow)} />
        <path d={`M${FX + 240} ${SH} l 20 -96 h 110 l 20 96 z`} fill={SOFA.pot} filter="url(#torn)" />
        {leaves.map(([dx, dy, r, at], k) => { const q = spring({ frame: f - growAt - at * 50, fps, config: { damping: 9, mass: 0.5 } }); if (q < 0.02) return null;
          return <g key={k} transform={`translate(${FX + 40 + dx} ${SH + dy}) rotate(${r}) scale(${q})`}><ellipse cx={0} cy={0} rx={62} ry={30} fill={k % 2 ? SOFA.leaf2 : SOFA.leaf} filter="url(#tornS)" /></g>; })}
        {/* the tear-off calendar: every page says TOMORROW */}
        <g transform="translate(250 730)">
          <rect x={-140} y={-150} width={280} height={300} fill={CP.white} filter="url(#torn)" />
          <rect x={-140} y={-150} width={280} height={64} fill={CP.red} />
          <text x={0} y={-104} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={34} fill={CP.cream}>I'LL DO ONE</text>
          <text x={0} y={36} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={40} fill={CP.ink}>TOMORROW</text>
          <text x={0} y={104} textAnchor="middle" fontFamily="Caveat" fontSize={46} fill={CP.ink}>{`(day ${22 + flips.filter((a) => f >= a + 8).length})`}</text>
          {flips.map((a, k) => { const t = interpolate(f, [a, a + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); if (t <= 0 || t >= 1) return null;
            return <g key={k} transform={`translate(${t * 260} ${t * t * 520}) rotate(${t * 70})`} opacity={1 - t * 0.3}><rect x={-140} y={-86} width={280} height={236} fill={CP.cream} filter="url(#tornS)" /><text x={0} y={36} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={40} fill={CP.ink}>TOMORROW</text></g>; })}
        </g>
        {Milo(0.3 + 0.7 * grow)}
      </svg>
      <CTitle text={s.line} accent={s.accent} y={262} />
    </AbsoluteFill>
  );
};

// ---------- busstop: a love confession at the bus stop, cut-paper collage (2026-11-26) ----------
/** Milo rehearses a love confession into his phone at a bus stop at dusk, paper hearts rising. Three beats:
 *  "hook" (the stop, the hook card from frame 0), "bus" (the bus pulls up, the doors open, he steps on mid
 *  sentence and his scarf stays hooked on the stop sign), "inside" (the passengers lean in, one hands him a
 *  tissue, one asks what it is from). All new torn paper pieces; nothing from the outlined Ink world. */
type BusStop = { type: "busstop"; beat: "hook" | "bus" | "inside"; seconds: number; line: string; accent?: string;
  /** hook beat: the hook on the lines it should break on, and which lines are red */ hook?: string[]; red?: number[];
  /** a line of the speech on a handwritten scrap */ scrap?: string; scrapAt?: number;
  busAt?: number; doorAt?: number; walkAt?: number; leanAt?: number; tissueAt?: number; ask?: string; askAt?: number };
const DUSK = { sky: "#3a3463", plum: "#7b3f6a", ember: "#c9573a", gold: "#eba650", sun: "#f6d58a", far: "#28244a", road: "#2a2934", curb: "#565369", glass: "#bfe0d6", bus: "#c8361b", busDark: "#8f2413" };
const BS_FLOOR = 1232, BS_DY = 112; // everything in the street is drawn for a floor at 1232, then moved down
/** The street at dusk: three torn bands of sunset, a paper sun, far buildings with lit windows, the road. */
const DuskStreet: React.FC = () => (
  <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
    <rect width={1080} height={1920} fill={DUSK.sky} filter="url(#fibre)" />
    <g transform={`translate(0 ${BS_DY})`}>
    <rect x={-30} y={800} width={1140} height={460} fill={DUSK.plum} filter="url(#torn)" />
    <circle cx={846} cy={1010} r={104} fill={DUSK.sun} filter="url(#torn)" />
    <rect x={-30} y={960} width={1140} height={300} fill={DUSK.ember} filter="url(#torn)" />
    <rect x={-30} y={1090} width={1140} height={170} fill={DUSK.gold} filter="url(#torn)" />
    {[[30, 250, 190], [250, 330, 150], [690, 210, 170], [880, 300, 230]].map(([x, h, w], k) => (
      <g key={k}>
        <rect x={x} y={BS_FLOOR - h} width={w} height={h + 10} fill={DUSK.far} filter="url(#torn)" />
        {[0, 1, 2, 3].map((j) => ((k + j) % 3 ? <rect key={j} x={x + 26 + (j % 2) * 62} y={BS_FLOOR - h + 34 + Math.floor(j / 2) * 70} width={30} height={36} fill={DUSK.gold} opacity={0.85} filter="url(#tornS)" /> : null))}
      </g>
    ))}
    <rect x={-30} y={BS_FLOOR} width={1140} height={720} fill={DUSK.road} filter="url(#torn)" />
    <rect x={-30} y={BS_FLOOR} width={1140} height={30} fill={DUSK.curb} />
    </g>
  </svg>
);
/** The stop: a pole, a red BUS sign, a little timetable. (x = the pole) */
const StopSign: React.FC<{ x: number }> = ({ x }) => (
  <g>
    <rect x={x - 10} y={690} width={20} height={BS_FLOOR - 690} fill="#b9b4a6" filter="url(#torn)" />
    <rect x={x - 88} y={610} width={176} height={120} rx={16} fill={CP.red} filter="url(#torn)" />
    <text x={x} y={692} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={58} fill={CP.cream}>BUS</text>
    <rect x={x - 40} y={860} width={80} height={110} fill={CP.white} filter="url(#tornS)" transform={`rotate(-3 ${x} 915)`} />
    {[0, 1, 2, 3].map((k) => <rect key={k} x={x - 26} y={880 + k * 20} width={52 - (k % 2) * 16} height={7} fill={CP.ink} opacity={0.55} transform={`rotate(-3 ${x} 915)`} />)}
  </g>
);
/** Hearts that keep rising from (x, y), each on its own drift, fading as they climb `rise` px. */
const Hearts: React.FC<{ x: number; y: number; from?: number; rise?: number; n?: number }> = ({ x, y, from = 0, rise = 190, n = 6 }) => {
  const f = useCurrentFrame();
  return (
    <>
      {Array.from({ length: n }).map((_, k) => {
        const period = 46, t = ((f - from + 400 - k * (period / n) * 1.0) % period) / period;
        if (f < from) return null;
        const hx = x + Math.sin(k * 2.4 + t * 3.2) * (34 + k * 9) + (k % 2 ? 26 : -22);
        const hy = y - t * rise;
        return <g key={k} transform={`translate(${hx} ${hy}) rotate(${Math.sin(k + t * 4) * 16}) scale(${0.55 + 0.6 * Math.sin(Math.min(1, t * 2.4) * Math.PI / 2)})`} opacity={t < 0.75 ? 1 : (1 - t) * 4}>
          <CHeart r={k % 3 === 0 ? 30 : 22} fill={k % 2 ? CP.pink : CP.red} />
        </g>;
      })}
    </>
  );
};
const BusStopScene: React.FC<{ s: BusStop }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const talk = 0.45 + 0.55 * Math.abs(Math.sin(f / 2.3));
  if (s.beat === "hook") {
    const MX = 600, MY = BS_FLOOR + 14, MS = 0.95;
    return (
      <AbsoluteFill>
        <Sfx name="cine/plink" at={PREROLL + 4} vol={0.5} />
        <Sfx name="cine/ping" at={PREROLL + 34} vol={0.4} />
        <DuskStreet />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(0 ${BS_DY})`}>
            <StopSign x={210} />
            <CMilo x={MX} y={MY} s={MS} talk={talk} phone={1} />
            <Hearts x={MX - 150 * MS} y={MY - 590 * MS} rise={170} />
          </g>
        </svg>
        <CHook lines={s.hook ?? [s.line]} red={s.red} />
      </AbsoluteFill>
    );
  }
  if (s.beat === "bus") {
    const busAt = s.busAt ?? 14, doorAt = s.doorAt ?? 58, walkAt = s.walkAt ?? 74;
    const arrive = spring({ frame: f - busAt, fps, config: { damping: 15, mass: 1.1, stiffness: 70 } });
    const BX = 430 + (1 - arrive) * 900; // the bus's left edge
    const rock = f > busAt + 26 ? Math.sin((f - busAt - 26) / 3) * 4 * Math.max(0, 1 - (f - busAt - 26) / 16) : 0;
    const open = cease(f, doorAt, doorAt + 12);
    const walk = cease(f, walkAt, walkAt + 34);
    const MS = 0.88, DOOR = 430 + 170; // the doorway's middle, once the bus has stopped
    const mx = 330 + (DOOR - 330) * walk, my = BS_FLOOR + 14 - walk * 44 - Math.abs(Math.sin(walk * Math.PI * 3)) * 16 * (walk < 1 ? 1 : 0);
    const POLE = 150;
    const taut = cease(f, walkAt + 24, walkAt + 36);
    const twang = f > walkAt + 36 ? Math.sin((f - walkAt - 36) / 1.6) * 7 * Math.max(0, 1 - (f - walkAt - 36) / 18) : 0;
    const nx = mx + 30 * MS, ny = my - 400 * MS; // the scarf at his neck
    return (
      <AbsoluteFill>
        <Sfx name="slide" at={busAt} vol={0.5} />
        <Sfx name="thud" at={busAt + 24} vol={0.5} />
        <Sfx name="pop" at={doorAt} vol={0.6} />
        <Sfx name="boop_lo" at={walkAt + 6} vol={0.4} />
        <Sfx name="boop_hi" at={walkAt + 18} vol={0.4} />
        <Sfx name="cine/toing" at={walkAt + 34} vol={0.6} />
        <DuskStreet />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <g transform={`translate(0 ${BS_DY})`}>
          <StopSign x={POLE} />
          {/* the bus: one long red sheet, a cream stripe, pale glass with heads behind it, wheels, a route number */}
          <g transform={`translate(${BX} ${rock})`}>
            <rect x={0} y={640} width={900} height={540} rx={40} fill={DUSK.bus} filter="url(#torn)" />
            <rect x={0} y={1010} width={900} height={40} fill={CP.cream} />
            <rect x={300} y={590} width={250} height={84} rx={10} fill={CP.ink} filter="url(#torn)" />
            <text x={425} y={652} textAnchor="middle" fontFamily="ArchivoBlack" fontSize={54} fill={DUSK.gold}>24</text>
            {[330, 520].map((wx, k) => (
              <g key={k}>
                <rect x={wx} y={720} width={160} height={210} fill={DUSK.glass} filter="url(#tornS)" />
                <circle cx={wx + 80} cy={842} r={44} fill={k ? CP.skin3 : CP.skin2} filter="url(#tornS)" />
                <path d={`M${wx + 34} 842 q46 -84 92 0 q-46 -30 -92 0 z`} fill={k ? CP.hair : CP.hair2} filter="url(#tornS)" />
                <rect x={wx + 26} y={886} width={108} height={44} rx={18} fill={k ? CP.green : CP.navy} />
              </g>
            ))}
            {/* the doorway (lit inside), then the two doors folding back */}
            <rect x={80} y={720} width={180} height={440} fill="#f6d9a0" filter="url(#tornS)" />
            <rect x={80} y={1120} width={180} height={40} fill={DUSK.busDark} />
            <rect x={80 - open * 4} y={720} width={90 * (1 - open * 0.82)} height={440} fill={DUSK.busDark} filter="url(#tornS)" />
            <rect x={170 + 90 * open * 0.82 + open * 4} y={720} width={90 * (1 - open * 0.82)} height={440} fill={DUSK.busDark} filter="url(#tornS)" />
            <circle cx={22} cy={1090} r={22} fill={DUSK.sun} filter="url(#tornS)" />
            {[330, 720].map((cx, k) => (<g key={k} filter="url(#torn)"><circle cx={cx} cy={1180} r={74} fill={CP.ink} /><circle cx={cx} cy={1180} r={30} fill={CP.kraft} /></g>))}
          </g>
          {/* the scarf stays hooked on the stop sign: slack, then tight */}
          {walk > 0.05 && (
            <path d={`M${POLE + 70} ${640 + twang} Q ${(POLE + nx) / 2} ${(640 + ny) / 2 + (1 - taut) * 150 + twang}, ${nx} ${ny - 16} L ${nx} ${ny + 22} Q ${(POLE + nx) / 2} ${(640 + ny) / 2 + (1 - taut) * 150 + 40 + twang}, ${POLE + 70} ${682 + twang} Z`} fill={CP.mustard} filter="url(#tornS)" />
          )}
          <CMilo x={mx} y={my} s={MS} talk={talk} phone={1} panic={taut * 0.5} />
          <Hearts x={mx - 150 * MS} y={my - 590 * MS} rise={150} n={5} />
          </g>
          {s.scrap && <CNote text={s.scrap} x={540} y={606} rot={-2} size={54} at={s.scrapAt ?? 6} />}
        </svg>
        <CTitle text={s.line} accent={s.accent} y={262} />
      </AbsoluteFill>
    );
  }
  // inside the bus: he is still going, everyone leans in, a tissue arrives
  const leanAt = s.leanAt ?? 14, tissueAt = s.tissueAt ?? 70, askAt = s.askAt ?? 110;
  const lean = cease(f, leanAt, leanAt + 26);
  const MX = 520, MY = 1262, MS = 0.86;
  const give = spring({ frame: f - tissueAt, fps, config: { damping: 12, mass: 0.6 } });
  const lights = (k: number) => 1080 - ((f * 9 + k * 300) % 1500);
  const Lean: React.FC<{ x: number; y: number; deg: number; children: React.ReactNode }> = ({ x, y, deg, children }) => <g transform={`rotate(${deg * lean} ${x} ${y})`}>{children}</g>;
  return (
    <AbsoluteFill>
      <Sfx name="slide" at={leanAt} vol={0.35} />
      <Sfx name="pop" at={tissueAt} vol={0.6} />
      <Sfx name="cine/ping" at={askAt} vol={0.5} />
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <rect width={1080} height={1920} fill={CP.cream} filter="url(#fibre)" />
        <g transform="translate(0 96)">
        {/* the windows: dusk going by, street lights sliding past */}
        {[40, 386, 732].map((wx, k) => (
          <g key={k}>
            <rect x={wx} y={640} width={308} height={270} fill={DUSK.sky} filter="url(#torn)" />
            <rect x={wx + 6} y={820} width={296} height={84} fill={DUSK.ember} />
            {[0, 1, 2, 3, 4].map((j) => { const lx = lights(j); return lx > wx + 20 && lx < wx + 288 ? <circle key={j} cx={lx} cy={730} r={16} fill={DUSK.sun} /> : null; })}
          </g>
        ))}
        <rect x={-30} y={930} width={1140} height={340} fill={CP.tealDeep} filter="url(#torn)" />
        <rect x={-30} y={1262} width={1140} height={700} fill={DUSK.road} filter="url(#torn)" />
        {/* the rail and its hanging straps */}
        <rect x={-20} y={596} width={1120} height={16} fill={CP.mustard} filter="url(#tornS)" />
        {[150, 400, 690, 940].map((sx, k) => <g key={k} transform={`rotate(${Math.sin((f + k * 9) / 7) * 5} ${sx} 604)`}><rect x={sx - 5} y={604} width={10} height={54} fill={CP.ink} /><rect x={sx - 24} y={654} width={48} height={34} rx={12} fill={CP.kraft} filter="url(#tornS)" /></g>)}
        {/* passengers, each a different little paper body, all leaning in */}
        <Lean x={150} y={1270} deg={9}><CPerson x={150} y={1270} s={0.8} top={CP.green} dress={CP.green} outfit="trousers" hairStyle="bun" hair={CP.hair} skin={CP.skin3} seed={1} /></Lean>
        <Lean x={318} y={1236} deg={7}><CPerson x={318} y={1236} s={0.7} dress={CP.pink} top={CP.white} hairStyle="curly" hair={CP.hair2} skin={CP.skin} seed={2} /></Lean>
        <Lean x={964} y={1270} deg={-9}><CPerson x={964} y={1270} s={0.78} dress={CP.navy} top={CP.kraft} outfit="trousers" hairStyle="short" hair="#8d8a84" skin={CP.skin2} seed={3} /></Lean>
        <Lean x={800} y={1246} deg={-6}><CPerson x={800} y={1246} s={0.8} dress={CP.rust} top={CP.rust} hairStyle="long" hair={CP.hair} skin={CP.skin2} seed={4} talk={f >= askAt && f < askAt + 34 ? talk : 0} /></Lean>
        {/* the two seats in front of the ones sitting */}
        <rect x={40} y={1070} width={230} height={220} rx={30} fill={CP.red} filter="url(#torn)" />
        <rect x={860} y={1076} width={230} height={214} rx={30} fill={CP.red} filter="url(#torn)" />
        <CMilo x={MX} y={MY} s={MS} talk={talk} phone={1} />
        <Hearts x={MX - 150 * MS} y={MY - 590 * MS} rise={130} n={4} />
        {/* the tissue: an arm comes across from the woman on the right */}
        {f >= tissueAt && (
          <g opacity={Math.min(1, give * 1.5)}>
            <line x1={768} y1={1000} x2={768 - 96 * give} y2={1000 + 24 * give} stroke={CP.rust} strokeWidth={30} strokeLinecap="round" filter="url(#tornS)" />
            <circle cx={768 - 110 * give} cy={1000 + 28 * give} r={17} fill={CP.skin2} filter="url(#tornS)" />
            <rect x={768 - 110 * give - 62} y={1000 + 28 * give - 34} width={62} height={62} fill={CP.white} filter="url(#tornS)" transform={`rotate(${12 + Math.sin(f / 5) * 5} ${768 - 110 * give - 30} ${1000 + 28 * give})`} />
          </g>
        )}
        {s.ask && <CNote text={s.ask} x={790} y={640} rot={4} size={56} at={askAt} />}
        </g>
      </svg>
      <CTitle text={s.line} accent={s.accent} y={262} />
    </AbsoluteFill>
  );
};

const OpheliasScene: React.FC<{ s: Ophelias }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const page = s.page ?? "OPHELIA", bubble = s.bubble ?? "O, what a noble mind";
  if (s.beat === "snag") {
    const backAt = s.backAt ?? 8, snagAt = s.snagAt ?? 34, turnAt = s.turnAt ?? 70;
    const back = spring({ frame: f - backAt, fps, config: { damping: 200 }, durationInFrames: Math.max(8, snagAt - backAt) });
    const yank = spring({ frame: f - snagAt, fps, config: { damping: 7, mass: 0.6, stiffness: 180 } });
    const o = spring({ frame: f - turnAt, fps, config: { damping: 13, mass: 0.7 } });
    const mx = 600 - back * 250 + yank * 54, my = 990, tilt = -yank * 11 + (f >= snagAt ? Math.sin((f - snagAt) / 2.2) * 5 * Math.max(0, 1 - (f - snagAt) / 22) : 0);
    const CX = 790, CY = 1058; // the chair's near post, where the scarf is caught
    const taut = prog(f, snagAt - 6, snagAt);
    const nx = mx + 44, ny = my + 104;
    const sag = (1 - taut) * 130;
    const spill = prog(f, snagAt + 4, snagAt + 18);
    return (
      <AbsoluteFill>
        <Sfx name="slide" at={backAt} vol={0.35} />
        <Sfx name="cine/toing" at={snagAt} vol={0.6} />
        <Sfx name="toss" at={snagAt + 4} vol={0.6} />
        <Sfx name="thud" at={snagAt + 10} vol={0.6} />
        <Sfx name="cine/ping" at={turnAt + 4} vol={0.55} />
        <AbsoluteFill style={{ background: `radial-gradient(circle 300px at ${mx - 150}px ${my + 250}px, rgba(232,121,43,${0.5 * o}) 0%, rgba(232,121,43,0) 100%)` }} />
        <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
          <Ink d={`M50 ${OP_FLOOR} C 360 ${OP_FLOOR - 8}, 720 ${OP_FLOOR + 8}, 1030 ${OP_FLOOR}`} start={0} dur={14} w={8} />
          {/* three of them behind, still at it, leaning in to look */}
          <Ink d="M560 906 C 700 900, 860 910, 1020 904 M586 906 L 586 980" start={2} dur={14} w={6} color={C.inkSoft} />
          <g opacity={prog(f, 2, 10)}>
            {[[650, 730, 0], [800, 700, 1], [925, 742, 2]].map(([ox, oy, k]) => <OpheliaFig key={k} x={ox} y={oy} k={0.62} page={page} seed={k + 2} lean={-4 - k * 2} />)}
          </g>
          {/* the folding chair that has his scarf */}
          <g opacity={prog(f, 2, 10)} transform={`rotate(${-yank * 5 * Math.max(0, 1 - (f - snagAt) / 26)} 820 ${OP_FLOOR})`}>
            <path d={`M${CX} ${CY} L ${CX + 10} ${OP_FLOOR} M${CX + 150} ${CY + 4} L ${CX + 140} ${OP_FLOOR} M${CX + 6} 1262 L ${CX + 144} 1262 M${CX + 8} 1262 L ${CX - 50} ${OP_FLOOR} M${CX + 144} 1262 L ${CX + 110} ${OP_FLOOR}`} fill="none" stroke={C.ink} strokeWidth={9} strokeLinecap="round" />
            <rect x={CX - 2} y={CY + 16} width={156} height={84} rx={10} fill="#efe2c6" stroke={C.ink} strokeWidth={6} />
            <path d={`M${CX - 30} 1262 L ${CX + 150} 1262`} stroke={C.ink} strokeWidth={14} strokeLinecap="round" />
          </g>
          {/* the scarf: slack as he backs away, then tight */}
          <path d={`M${nx} ${ny - 16} Q ${(nx + CX) / 2} ${(ny + CY) / 2 + sag}, ${CX - 4} ${CY - 12} L ${CX + 6} ${CY + 26} Q ${(nx + CX) / 2} ${(ny + CY) / 2 + sag + 44}, ${nx - 6} ${ny + 26} Z`} fill={MUSTARD} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <circle cx={CX + 2} cy={CY + 6} r={20} fill={MUSTARD} stroke={C.ink} strokeWidth={6} />
          <g transform={`rotate(${tilt} ${mx} ${my + 452})`}>
            <MiloStanding x={mx} y={my} start={0} />
            {/* the phone comes up in his hand */}
            <g opacity={o} transform={`translate(${mx - 150} ${my + 300 - o * 70}) rotate(-12)`}>
              <rect x={-36} y={-66} width={72} height={132} rx={14} fill={C_PAPER.stage} stroke={C.ink} strokeWidth={6} />
              <rect x={-22} y={-44} width={44} height={10} rx={5} fill={C_PAPER.orange} />
              <path d="M-20 -18 L 20 -18 M-20 2 L 12 2" stroke="rgba(239,230,216,0.6)" strokeWidth={5} strokeLinecap="round" />
            </g>
          </g>
          <Milo x={mx} y={my} r={84} tilt={tilt} panic={0.75 * (1 - o) * Math.max(0.4, taut)} hope={o} start={0} tote={[654, OP_FLOOR - 92]} spill={spill} />
          {f >= snagAt && f < turnAt + 6 && [0, 1, 2].map((i) => {
            const p = spring({ frame: f - snagAt - i * 3, fps, config: { damping: 9, mass: 0.5 } });
            return <path key={i} d={`M${(nx + CX) / 2 - 40 + i * 44} ${(ny + CY) / 2 - 56 - i * 10} l ${-6 + i * 6} -44`} stroke={C.orange} strokeWidth={8} strokeLinecap="round" opacity={Math.min(1, p) * (1 - prog(f, turnAt - 6, turnAt + 6))} />;
          })}
        </svg>
        <AbsoluteFill style={{ alignItems: "center", padding: "290px 56px 0" }}>
          <Rise at={turnAt}><Headline text={s.line} accent={s.accent} color={C.ink} size={92} /></Rise>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  const five = s.beat === "five";
  const at = (k: number) => (five ? s.at?.[k] ?? 14 + k * 20 : 1e6);
  // three behind, two in front, Milo in the middle of them
  const figs: [number, number, number][] = [[176, 742, 0.86], [520, 716, 0.86], [848, 742, 0.86], [164, 1100, 1.02], [846, 1100, 1.02]];
  const bub: [number, number][] = [[196, 566], [556, 520], [800, 600], [250, 940], [770, 952]];
  const MX = 506, MY = 1010;
  const popped = figs.filter((_, k) => f >= at(k)).length;
  const panic = five ? Math.min(0.95, 0.3 + 0.14 * popped) : 0.3;
  const look = five ? 0 : Math.sin(f / 9) * 7;
  return (
    <AbsoluteFill>
      {figs.map((_, k) => (five ? <React.Fragment key={k}><Sfx name="pop" at={at(k)} vol={0.6} /><Sfx name={k % 2 ? "boop_hi" : "boop_lo"} at={at(k) + 3} vol={0.4} /></React.Fragment> : null))}
      <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
        <Ink d={`M50 ${OP_FLOOR} C 360 ${OP_FLOOR - 8}, 720 ${OP_FLOOR + 8}, 1030 ${OP_FLOOR}`} start={0} dur={14} w={8} />
        {/* the bench the back three sit along */}
        <Ink d="M70 968 C 380 962, 700 972, 1010 966 M96 968 L 96 1050 M984 966 L 984 1050" start={2} dur={16} w={6} color={C.inkSoft} />
        {figs.slice(0, 3).map(([x, y, k], i) => <OpheliaFig key={i} x={x} y={y} k={k} page={page} seed={i} lean={(1 - i) * -3} />)}
        <MiloStanding x={MX} y={MY} />
        <Milo x={MX} y={MY} r={84} tilt={look} panic={panic} start={0} tote={[676, OP_FLOOR - 86]} />
        {figs.slice(3).map(([x, y, k], i) => <OpheliaFig key={i + 3} x={x} y={y} k={k} page={page} seed={i + 3} lean={i ? -5 : 5} />)}
        {/* the same line out of every mouth, counted */}
        {figs.map(([x, y, k], i) => {
          if (f < at(i)) return null;
          const pop = spring({ frame: f - at(i), fps, config: { damping: 9, mass: 0.5 } });
          const [bx, by] = bub[i], w = 336, h = 84, wob = Math.sin((f + i * 13) / 9) * 3;
          const hx = x + (bx > x ? 20 : -20) * k, hy = y - 50 * k;
          return (
            <g key={i}>
              {[0.45, 0.75].map((u, j) => <circle key={j} cx={bx + (hx - bx) * u} cy={by + 40 + (hy - by - 40) * u} r={(12 - j * 5) * Math.min(1, pop)} fill="#ffffff" stroke={C_PAPER.ink} strokeWidth={4} />)}
              <g transform={`translate(${bx} ${by + wob}) scale(${pop})`}>
                <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="#ffffff" stroke={C_PAPER.ink} strokeWidth={5} />
                <text x={10} y={10} textAnchor="middle" fontFamily={F.serifI} fontStyle="italic" fontSize={31} fill={C_PAPER.ink}>{bubble}</text>
                <circle cx={-w / 2 + 6} cy={-h / 2 + 4} r={25} fill={C_PAPER.orange} stroke={C_PAPER.ink} strokeWidth={5} />
                <text x={-w / 2 + 6} y={-h / 2 + 15} textAnchor="middle" fontFamily={F_PAPER.sans} fontWeight={700} fontSize={30} fill="#ffffff">{i + 1}</text>
              </g>
            </g>
          );
        })}
      </svg>
      {/* hook beat: big, bold, there from frame 0 (it is the cover) */}
      <AbsoluteFill style={{ alignItems: "center", padding: `${five ? 286 : 262}px 56px 0` }}>
        <Rise at={five ? 6 : 2}><Headline text={s.line} accent={s.accent} color={C.ink} size={five ? 92 : 112} /></Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

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
      <div style={{ background: DARK() ? "#05070f" : LOOK === "collage" ? "#1f2a2a" : C.ink, border: DARK() ? "2px solid rgba(243,239,230,0.28)" : undefined, borderRadius: 22, padding: "16px 28px", boxShadow: "0 8px 30px rgba(33,26,21,0.25)",
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
  const trans: (StoryTransition | "swap" | "none")[] = spec.scenes.map((sc, i) =>
    i === 0 ? "none" : ph(sc.type) && ph(spec.scenes[i - 1].type) ? "swap"
      : ((sc as { in?: StoryTransition }).in ?? spec.transition ?? "slide"));
  const moves = trans.map((t) => t === "slide" || t === "whip");
  const TT = trans.map((t) => (t === "whip" ? 9 : T)); // frames the camera takes to arrive
  const slot: number[] = [];
  spec.scenes.forEach((_, i) => slot.push(i === 0 ? 0 : slot[i - 1] + (moves[i] ? 1 : 0)));
  let cam = 0;
  let blur = 0;
  spec.scenes.forEach((_, i) => {
    if (i > 0 && moves[i]) {
      const p = prog(frame, starts[i] - TT[i], starts[i]);
      cam += p;
      if (trans[i] === "whip") blur = Math.max(blur, 26 * Math.sin(Math.PI * p));
    }
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
      sc.type === "hall" ? <HallScene s={sc} /> :
      sc.type === "fumble" ? <FumbleScene s={sc} /> :
      sc.type === "gone" ? <GoneScene s={sc} /> :
      sc.type === "thud" ? <ThudScene s={sc} /> :
      sc.type === "dry" ? <DryScene s={sc} /> :
      sc.type === "scatter" ? <ScatterScene s={sc} /> :
      sc.type === "tally" ? <TallyScene s={sc} /> :
      sc.type === "snap" ? <SnapScene s={sc} /> :
      sc.type === "fresh" ? <FreshScene s={sc} /> :
      sc.type === "notice" ? <NoticeScene s={sc} /> :
      sc.type === "tower" ? <TowerScene s={sc} /> :
      sc.type === "buried" ? <BuriedScene s={sc} /> :
      sc.type === "cards" ? <CardsScene s={sc} /> :
      sc.type === "oneam" ? <OneAmScene s={sc} /> :
      sc.type === "peeks" ? <PeeksScene s={sc} /> :
      sc.type === "pillow" ? <PillowScene s={sc} /> :
      sc.type === "selftape" ? <SelfTapeScene s={sc} /> :
      sc.type === "ophelias" ? <OpheliasScene s={sc} /> :
      sc.type === "cutout" ? <CutoutScene s={sc} /> :
      sc.type === "busstop" ? <BusStopScene s={sc} /> :
      sc.type === "libdesk" ? <LibDeskScene s={sc} /> :
      sc.type === "sofa" ? <SofaScene s={sc} /> :
      <EndScene s={sc} />;
  };

  const spans: [number, number][] = (spec.voice?.lines ?? []).map((l) => [Math.round(l.at * FPS), Math.round((l.at + (l.dur ?? 2)) * FPS)]);

  return (
    <SpeechCtx.Provider value={spans}>
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <Paper />
      {LOOK === "sketch" && <SketchDefs />}
      {LOOK === "collage" && <CollageDefs />}
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
      {LOOK !== "collage" && <Thread slots={slots} cam={camEase} />}
      {blur > 0.5 && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id="mblur" x="-10%" y="0" width="120%" height="100%"><feGaussianBlur stdDeviation={`${blur.toFixed(1)} 0`} /></filter>
        </svg>
      )}
      {spec.scenes.map((sc, i) => {
        const frames = Math.round(sc.seconds * FPS);
        const x = slot[i] * 1080 - camEase;
        const tr = trans[i];
        const from = i === 0 ? -PREROLL : moves[i] ? starts[i] - TT[i] : starts[i];
        const under = trans[i + 1] === "tear" ? 12 : 0; // stay underneath while the next scene tears in
        const look = LOOK === "riso" ? "drop-shadow(7px 5px 0 rgba(255,61,127,0.55))"
          : LOOK === "sketch" && sc.type !== "screens" ? "url(#pencil)" : "";
        const filt = [look, blur > 0.5 ? "url(#mblur)" : ""].filter(Boolean).join(" ") || undefined;
        // punch: scale in from 1.22 over 8 frames; tear: a torn edge sweeps up from the bottom over 12 frames
        const lf = frame - starts[i];
        const punch = tr === "punch" && lf >= 0 && lf < 10 ? 1 + 0.22 * (1 - Easing.out(Easing.cubic)(lf / 10)) : 1;
        let clip: string | undefined;
        if (tr === "tear" && lf < 12) {
          const top = 1920 * (1 - Easing.out(Easing.cubic)(Math.max(0, lf) / 12));
          const pts = Array.from({ length: 19 }, (_, k) => `${(k * 60).toFixed(0)}px ${(top + ((k * 37 + i * 11) % 5) * 9 - 18).toFixed(0)}px`);
          clip = `polygon(${pts.join(", ")}, 1080px 1920px, 0px 1920px)`;
        }
        return (
          <React.Fragment key={i}>
            {tr === "slide" && <Sfx name="slide" at={starts[i] - T} vol={0.28} />}
            {tr === "whip" && <Sfx name="whoosh" at={starts[i] - TT[i] - 2} vol={0.42} />}
            {tr === "punch" && <Sfx name="punch" at={starts[i]} vol={0.5} />}
            {tr === "tear" && <Sfx name="rip" at={starts[i] - 1} vol={0.45} />}
            {tr === "slide" && LOOK !== "collage" && (
              <Sequence from={starts[i] - T - 2} durationInFrames={T + 14}>
                <Streaks seed={i} />
              </Sequence>
            )}
            <Sequence from={from} durationInFrames={frames + (moves[i] ? TT[i] : 0) + (i === 0 ? PREROLL : 0) + under}>
              <SceneStartCtx.Provider value={from}>
                <AbsoluteFill style={{ transform: `translateX(${x}px) scale(${punch})`, filter: filt, clipPath: clip }}>{renderScene(sc, i)}</AbsoluteFill>
              </SceneStartCtx.Provider>
            </Sequence>
          </React.Fragment>
        );
      })}
      {LOOK === "riso" && <RisoGrain />}
      {spec.voice?.lines?.length && spec.voice.subtitles !== false ? (
        <StoryCaptions lines={spec.voice.lines}
          until={spec.scenes[spec.scenes.length - 1]?.type === "end" ? spec.scenes.slice(0, -1).reduce((n, sc) => n + sc.seconds, 0) : 1e9} />
      ) : null}
    </AbsoluteFill>
    </SpeechCtx.Provider>
  );
};
