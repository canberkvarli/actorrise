/**
 * The route as a pencil sketch: a few loose street lines, the real route line
 * from Google (squeezed into a 0..1 box by the server), a ring where you start
 * and a pin where you're going. Decorative; the words beside it carry the facts.
 */

const W = 160;
const H = 120;
const PAD = 18;

/** A small, steady wobble so the line reads as drawn by hand, the same on every render. */
function wobble(i: number): number {
  return Math.sin(i * 12.9898) * 0.9;
}

export function TripSketch({ points, from, to }: { points: [number, number][]; from: string | null; to: string | null }) {
  if (points.length < 2) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * scale) / 2 - Math.min(...xs) * scale;
  const offY = (H - spanY * scale) / 2 - Math.min(...ys) * scale;
  const pts = points.map(([x, y], i) => [x * scale + offX + wobble(i), y * scale + offY + wobble(i + 7)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [sx, sy] = pts[0];
  const [ex, ey] = pts[pts.length - 1];
  const short = (s: string | null) => (s && s.length > 16 ? `${s.slice(0, 15)}…` : s);

  return (
    <svg
      className="aud-sketch shrink-0"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g strokeWidth="1" opacity=".35">
        <path d="M6 34 C50 31 104 37 154 32" />
        <path d="M4 82 C52 85 102 79 156 84" />
        <path d="M44 4 C41 44 46 80 42 116" />
        <path d="M112 4 C115 42 109 82 113 116" />
      </g>
      <path className="aud-sketch-route" pathLength={1} d={d} strokeWidth="1.8" />
      <circle cx={sx} cy={sy} r="5" strokeWidth="1.5" />
      <path d={`M${ex - 6} ${ey - 9} l6 9 l6 -9 a7 7 0 1 0 -12 0z`} strokeWidth="1.5" />
      {from && (
        <text x={Math.min(sx + 8, W - 4)} y={Math.min(sy + 16, H - 4)} fontSize="11" fill="currentColor" stroke="none" className="aud-pencil-muted" textAnchor={sx > W / 2 ? "end" : "start"}>
          {short(from)}
        </text>
      )}
      {to && (
        <text x={ex > W / 2 ? ex - 10 : ex + 10} y={Math.max(ey - 12, 11)} fontSize="12" fill="currentColor" stroke="none" className="aud-pencil" textAnchor={ex > W / 2 ? "end" : "start"}>
          {short(to)}
        </text>
      )}
    </svg>
  );
}
