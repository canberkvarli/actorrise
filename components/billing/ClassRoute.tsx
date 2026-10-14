import type { CSSProperties } from "react";

/**
 * The way through a wall for an actor who has no card: a student.
 *
 * Between 2026-09-28 and 10-12, three of the four people who reached the
 * Stripe page from a wall left at the card form, and two of the three were
 * students (a school domain, an iPhone, the read limit). They did not say no;
 * most teenagers have no card to give. Students come in through their teacher
 * (CLAUDE.md, the educator offer), so this sends them there instead of to a
 * dead end.
 */
export function ClassRoute({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <p className={className} style={style}>
      In a class? Your teacher can get you in free. Ask them to email{" "}
      <a href="mailto:canberk@actorrise.com" className="underline underline-offset-2">
        canberk@actorrise.com
      </a>
      .
    </p>
  );
}
