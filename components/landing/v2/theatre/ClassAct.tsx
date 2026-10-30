import Link from "next/link";

/**
 * A note for teachers, pinned to the callboard. The class link a teacher makes
 * from their own library (TeacherClassCard), the month every student gets
 * through it, the class shelf (only that class ever sees the teacher's
 * scenes), and /class (counts, never what a student searched). 13 and up,
 * per the privacy policy.
 *
 * Index cards on a board, each at its own angle; a hover squares one up.
 */

const CARDS = [
  {
    n: "1",
    head: "Make your link",
    body: "One tap from your library. That's your class's door.",
    chip: "actorrise.com/join/your-class",
    rot: "-2deg",
    mt: "0px",
  },
  {
    n: "2",
    head: "Sign up together",
    body: "One class period, about ten minutes. Every student gets a month of Plus, on me.",
    rot: "1.5deg",
    mt: "28px",
  },
  {
    n: "3",
    head: "Share your own scenes",
    body: "Bring in the scenes you teach. Your class rehearses them. Nobody else can see them, ever.",
    rot: "-1deg",
    mt: "8px",
  },
  {
    n: "4",
    head: "See who's working",
    body: "Who joined, who's rehearsing, what they finished. Never what they searched for.",
    rot: "2deg",
    mt: "36px",
  },
];

export function ClassAct() {
  return (
    <section
      id="classroom"
      className="relative overflow-hidden px-6 pb-[140px] pt-[110px]"
      style={{ background: "var(--t-paper-2)", color: "var(--t-text)" }}
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div className="max-w-[760px]">
            <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
              (a note for teachers, pinned to the callboard.)
            </p>
            <h2 className="t-h2 mt-4">
              Bring the{" "}
              <em className="t-em" style={{ color: "var(--t-gel-ink)" }}>
                whole class.
              </em>
            </h2>
            <p className="m-0 mt-5 max-w-[58ch] text-[17px] leading-relaxed" style={{ color: "var(--t-muted-dark)" }}>
              One link, and every student is in, rehearsing between classes with a partner who never cancels. For
              actors 13 and up.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/for-teachers"
              className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold transition-transform duration-300 hover:-translate-y-0.5"
              style={{ background: "var(--t-text)", color: "var(--t-cream)", transitionTimingFunction: "var(--t-spring)" }}
            >
              For teachers
            </Link>
            <Link
              href="/pricing#schools"
              className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold transition-colors"
              style={{ border: "1.5px solid var(--t-text)" }}
            >
              Class plans from $249 a year
            </Link>
          </div>
        </div>

        {/* The board. */}
        <div
          className="relative mt-14 rounded-[28px] px-5 pb-12 pt-10 sm:px-10"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, oklch(0.62 0.07 60 / .35) 0 1px, transparent 1.5px) 0 0/14px 14px, radial-gradient(circle at 70% 60%, oklch(0.45 0.06 50 / .25) 0 1px, transparent 1.5px) 0 0/11px 11px, oklch(0.72 0.07 65)",
            boxShadow: "inset 0 0 0 10px oklch(0.42 0.05 50), inset 0 0 40px rgb(0 0 0 / .25)",
          }}
        >
          <div className="grid gap-7" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))" }}>
            {CARDS.map((c) => (
              <article
                key={c.n}
                className="relative px-5 pb-6 pt-7 transition-transform duration-500 hover:!rotate-0 hover:-translate-y-2"
                style={{
                  transform: `rotate(${c.rot})`,
                  marginTop: `clamp(0px, 2vw, ${c.mt})`,
                  background:
                    "repeating-linear-gradient(transparent 0 25px, oklch(0.62 0.08 230 / .16) 25px 26.5px) 0 60px, oklch(0.985 0.008 90)",
                  boxShadow: "0 18px 30px -16px rgb(0 0 0 / .55), 0 2px 0 rgb(0 0 0 / .06)",
                  transitionTimingFunction: "var(--t-spring)",
                }}
              >
                <span
                  aria-hidden
                  className="absolute left-1/2 top-2 size-4 -translate-x-1/2 rounded-full"
                  style={{
                    background: "radial-gradient(circle at 35% 35%, oklch(0.85 0.12 60), oklch(0.62 0.19 45) 60%)",
                    boxShadow: "0 3px 4px rgb(0 0 0 / .35)",
                  }}
                />
                <p className="m-0 flex items-baseline gap-2.5">
                  <span
                    style={{ fontFamily: "var(--t-display)", fontStyle: "italic", fontSize: 30, lineHeight: 1, color: "var(--t-orange)" }}
                  >
                    {c.n}
                  </span>
                  <span className="text-[19px] font-bold leading-tight -tracking-[.01em]">{c.head}</span>
                </p>
                <p className="m-0 mt-3 text-[15px] leading-[26.5px]" style={{ color: "oklch(0.32 0.01 50)" }}>
                  {c.body}
                </p>
                {c.chip && (
                  <p
                    className="m-0 mt-3 inline-block px-2 py-1 text-[13px] font-bold"
                    style={{ background: "oklch(0.92 0.18 100 / .7)", fontFamily: "var(--t-direction)", overflowWrap: "anywhere" }}
                  >
                    {c.chip}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
