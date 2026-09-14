/**
 * The headline, one word per rope. Each word is its own inline-block with a
 * transform origin far above it, so the CSS swing reads as a pendulum on a
 * line rather than a wobble in place. Pure CSS, server-rendered: it starts
 * the moment the curtain clears (via --curtain-delay) with no JS in the loop.
 *
 * Words are separated by real spaces, so the line wraps like text, selects
 * like text, and reads to a screen reader like text.
 */
/** `suffix` is punctuation that rides the same rope but stays plain
 *  ("rehearsing" lit orange, the full stop after it not). */
type Word = { text: string; hot?: boolean; italic?: boolean; suffix?: string };
export type RopeLine = Word[];

const WORD_STAGGER_S = 0.09;

export function RopeHeadline({ lines, className = "" }: { lines: RopeLine[]; className?: string }) {
  let i = 0;
  return (
    <h1 className={className}>
      {lines.map((line, li) => (
        <span key={li} className="block">
          {line.map((w, wi) => {
            // Alternate the hang so neighbouring words swing against each
            // other; done inline because each word sits in its own wrapper
            // and an nth-child rule would never see a sibling.
            const tilt = i % 2 === 0 ? "-4deg" : "4deg";
            const delay = `${(i++ * WORD_STAGGER_S).toFixed(2)}s`;
            const Tag = w.hot ? "em" : "span";
            return (
              <span key={wi}>
                <Tag
                  className={`rope-word ${w.hot ? "text-primary" : ""} ${
                    w.hot && !w.italic ? "not-italic sm:italic" : w.italic ? "italic" : "not-italic"
                  }`}
                  style={{ "--rope-d": delay, "--rope-tilt": tilt } as React.CSSProperties}
                >
                  {w.text}
                  {w.suffix ? <span className="not-italic text-[var(--stage-fg)]">{w.suffix}</span> : null}
                </Tag>
                {wi < line.length - 1 ? " " : null}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
