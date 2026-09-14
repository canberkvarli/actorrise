"use client";

import { useTheatreStats } from "./useTheatreStats";

const TITLES = [
  "Hamlet",
  "A Doll's House",
  "Twelfth Night",
  "The Seagull",
  "Miss Julie",
  "Macbeth",
  "Hedda Gabler",
  "Uncle Vanya",
  "Three Sisters",
  "Othello",
  "The Cherry Orchard",
  "Ghosts",
  "King Lear",
];

/**
 * The fly system: titles travelling past on a batten.
 *
 * The list is printed twice and the row translates exactly -50%, so the loop
 * has no seam. The generous vertical padding and 1.25 line-height are not
 * decoration — at this size the descenders on "Ghosts" and "Twelfth Night"
 * get sliced off by the overflow clip without them.
 */
export function PlayMarquee() {
  const { plays } = useTheatreStats();

  return (
    <section
      aria-label="Plays in the library"
      className="overflow-hidden pb-10 pt-12"
      style={{ background: "var(--t-ink)", borderBottom: "1px solid oklch(0.22 0.02 55)" }}
    >
      <div
        className="overflow-hidden py-5"
        style={{ transform: "rotate(-1.5deg) scale(1.03)" }}
      >
        <div
          className="flex w-max"
          style={{ animation: "t-marq 60s linear infinite", lineHeight: 1.25 }}
        >
          {[0, 1].map((copy) =>
            TITLES.map((t) => (
              <span
                key={`${copy}-${t}`}
                aria-hidden={copy === 1}
                className="flex items-center gap-8 whitespace-nowrap px-4 transition-colors hover:!text-[var(--t-gel)]"
                style={{
                  fontFamily: "var(--t-display)",
                  fontStyle: "italic",
                  fontSize: "clamp(2.4rem,6vw,5.5rem)",
                  lineHeight: 1.25,
                  color: "oklch(0.35 0.03 55)",
                }}
              >
                {t}
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: "var(--t-orange)" }}
                />
              </span>
            ))
          )}
        </div>
      </div>
      <p
        className="t-dir mt-6 text-center"
        style={{ fontSize: 13, color: "var(--t-faint)" }}
      >
        (a few of the {plays}+ plays, films and shows in the library.)
      </p>
    </section>
  );
}
