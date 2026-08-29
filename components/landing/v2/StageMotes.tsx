/**
 * Dust motes drifting up through the spotlight beam. Static values (no
 * randomness) so the server render matches hydration; pure CSS animation.
 */
const MOTES = [
  { left: "38%", top: "62%", size: 2, x: "22px", o: 0.35, t: "16s", d: "0s" },
  { left: "46%", top: "74%", size: 3, x: "-16px", o: 0.28, t: "21s", d: "3.5s" },
  { left: "52%", top: "58%", size: 2, x: "12px", o: 0.4, t: "14s", d: "7s" },
  { left: "58%", top: "70%", size: 2, x: "-24px", o: 0.3, t: "19s", d: "1.5s" },
  { left: "63%", top: "80%", size: 3, x: "18px", o: 0.25, t: "23s", d: "9s" },
  { left: "43%", top: "84%", size: 2, x: "-10px", o: 0.32, t: "17s", d: "5s" },
  { left: "55%", top: "88%", size: 2, x: "26px", o: 0.28, t: "20s", d: "11s" },
];

export function StageMotes() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="stage-mote"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              "--mote-x": m.x,
              "--mote-o": m.o,
              "--mote-t": m.t,
              "--mote-d": m.d,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
