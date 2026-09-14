"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Act II — the stage. Two cards running side by side: a search that types
 * itself, and a rehearsal that waits for a cue that never comes.
 *
 * Both are scripted. Nothing here is typeable and nothing calls the API: the
 * point is to show the shape of the thing in the first screen, to the nine in
 * ten visitors who never scroll and the handful a month who ever touched the
 * old live demo.
 */

const QUERY = "angry woman in her twenties, under two minutes, not shakespeare";

type Result = {
  n: string;
  who: string;
  play: string;
  line: string;
  len: string;
  tone: string;
  overdone: string;
  /** 1 = a warhorse, styled in orange rather than gel. */
  od: 0 | 1;
};

const RESULTS: Result[] = [
  {
    n: "i",
    who: "Hedda",
    play: "Hedda Gabler · Ibsen",
    line: "Oh, if you could only understand how poor I am. And fate has made you so rich.",
    len: "1:40",
    tone: "cold fury",
    overdone: "fresh",
    od: 0,
  },
  {
    n: "ii",
    who: "Julie",
    play: "Miss Julie · Strindberg",
    line: "Do you think I'm afraid of you? Then you don't know what I am.",
    len: "1:55",
    tone: "wounded pride",
    overdone: "rarely done",
    od: 0,
  },
  {
    n: "iii",
    who: "Nina",
    play: "The Seagull · Chekhov",
    line: "I'm a seagull. No, that's not it. I'm an actress. Yes.",
    len: "1:50",
    tone: "unraveling",
    overdone: "often seen",
    od: 1,
  },
];

type Line = { who: string; text: string; you: boolean };

const SCRIPT: Line[] = [
  { who: "Tesman", text: "Aunt Julle sends her love, Hedda. She'll come by this evening.", you: false },
  { who: "You · Hedda", text: "(your line. it waits.)", you: true },
  { who: "Tesman", text: "Hedda? Aren't you going to say anything?", you: false },
  { who: "You · Hedda", text: "(you take your time. it still waits.)", you: true },
  { who: "Brack", text: "Good afternoon, Mrs. Tesman. May I come in for a moment?", you: false },
];

const FEATURES = [
  {
    head: "Meaning,",
    body: 'not keywords. "Something funny that isn\'t Shakespeare" works.',
    accent: "var(--t-gel)",
    tilt: "-1deg",
  },
  {
    head: "Overdone",
    body: "scores on every piece, from fresh to warhorse. Know what you're walking in with.",
    accent: "var(--t-orange)",
    tilt: "1deg",
  },
  {
    head: "Real text.",
    body: "Every monologue is the published words. The AI finds; it never writes a line.",
    accent: "var(--t-gel)",
    tilt: "-1deg",
  },
];

export function StageAct() {
  const reduced = useReducedMotion();
  const [playedTyped, setTyped] = useState("");
  const [playedThinking, setThinking] = useState(false);
  const [playedResults, setResults] = useState<Result[]>([]);
  const [playedLines, setLines] = useState<Line[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* Reduced motion gets the finished scene rather than a frozen empty one.
     It is derived, not stored: the demo simply never runs, so there is no
     state to seed and nothing to keep in sync. */
  const typed = reduced ? QUERY : playedTyped;
  const thinking = reduced ? false : playedThinking;
  const results = reduced ? RESULTS : playedResults;
  const lines = reduced ? SCRIPT : playedLines;

  useEffect(() => {
    if (reduced) return;

    const after = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    const run = () => {
      setTyped("");
      setThinking(false);
      setResults([]);
      setLines([]);

      let i = 0;
      const type = () => {
        i += 1;
        setTyped(QUERY.slice(0, i));
        if (i < QUERY.length) {
          after(28 + Math.random() * 40, type);
        } else {
          setThinking(true);
          after(900, () => {
            setThinking(false);
            setResults(RESULTS);
          });
        }
      };
      after(600, type);

      let l = 0;
      const say = () => {
        if (l >= SCRIPT.length) return;
        const next = SCRIPT[l];
        l += 1;
        setLines((prev) => prev.concat(next));
        after(next.you ? 2600 : 1800, say);
      };
      after(1800, say);

      after(16000, run);
    };
    run();

    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.length = 0;
    };
  }, [reduced]);

  return (
    <section
      id="stage"
      className="relative overflow-hidden px-6 pb-[140px] pt-[120px]"
      style={{ background: "var(--t-stage)", color: "var(--t-cream)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 30% 30%, oklch(0.92 0.18 100 / .14), transparent 70%), radial-gradient(50% 50% at 75% 70%, oklch(0.72 0.17 55 / .16), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1240px]">
        <p className="t-dir" style={{ color: "var(--t-muted-light)" }}>
          (places. lights to half. the search.)
        </p>
        <h2 className="t-h2 mt-4 max-w-[900px]">
          Describe it like you&rsquo;d{" "}
          <em className="t-em" style={{ color: "var(--t-gel)" }}>
            say it out loud.
          </em>
        </h2>

        <div
          className="mt-16 grid items-start gap-8"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))" }}
        >
          {/* --- The search ------------------------------------------------ */}
          <div
            className="relative rounded-[28px] p-7"
            style={{
              background: "var(--t-paper-2)",
              color: "var(--t-text-soft)",
              boxShadow:
                "0 0 0 1px oklch(0.92 0.18 100 / .4), 0 40px 120px -30px oklch(0.92 0.18 100 / .35)",
              transform: "rotate(-1deg)",
            }}
          >
            <div
              className="absolute -top-[18px] left-7 rounded-full px-3.5 py-1.5"
              style={{
                background: "var(--t-gel)",
                color: "var(--t-text-soft)",
                fontFamily: "var(--t-direction)",
                fontStyle: "italic",
                fontSize: 12,
                letterSpacing: ".06em",
                transform: "rotate(2deg)",
              }}
            >
              (act i · the search)
            </div>

            <div
              className="flex min-h-[60px] items-center gap-3 px-5 py-3"
              style={{
                borderRadius: 32,
                background: "var(--t-paper)",
                border: "2px solid var(--t-text-soft)",
                fontSize: 17,
                fontWeight: 500,
                lineHeight: 1.3,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="shrink-0"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              {/* The query wraps rather than scrolling: at 340px it is four
                  lines long, and a one-line ellipsis would hide the whole
                  point, which is how conversational the query is. */}
              <span className="min-w-0" style={{ overflowWrap: "anywhere" }}>
                {typed}
                <span
                  aria-hidden
                  className="ml-px inline-block w-0.5 align-[-3px]"
                  style={{
                    height: "1.1em",
                    background: "var(--t-orange)",
                    animation: "t-blink 1s steps(2) infinite",
                  }}
                />
              </span>
            </div>

            <div className="mt-[18px] flex min-h-[340px] flex-col gap-3">
              {thinking && (
                <p
                  className="m-0 ml-5 mt-1.5 flex items-center gap-2"
                  style={{
                    fontFamily: "var(--t-direction)",
                    fontStyle: "italic",
                    fontSize: 13,
                    letterSpacing: ".06em",
                    color: "var(--t-muted-dark-2)",
                  }}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{
                      background: "var(--t-orange)",
                      animation: "t-pulse 1s ease-in-out infinite",
                    }}
                  />
                  (reading 19,000 pieces&hellip;)
                </p>
              )}
              {results.map((r, k) => (
                <article
                  key={r.n}
                  className="t-pop flex cursor-pointer items-start gap-4 px-[18px] py-4 transition-[transform,box-shadow] duration-[400ms] hover:translate-x-1.5 hover:-rotate-[.6deg] hover:shadow-[0_14px_30px_-14px_rgb(0_0_0/.35)]"
                  style={
                    {
                      "--t-d": `${k * 0.14}s`,
                      borderRadius: 18,
                      background: "var(--t-paper)",
                      border: "1.5px solid var(--t-line-light-2)",
                      transitionTimingFunction: "var(--t-spring)",
                    } as React.CSSProperties
                  }
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center"
                    style={{
                      borderRadius: 12,
                      fontFamily: "var(--t-display)",
                      fontStyle: "italic",
                      fontSize: 22,
                      background: k === 0 ? "var(--t-orange)" : "oklch(0.92 0.02 80)",
                      color: k === 0 ? "oklch(0.15 0.03 45)" : "oklch(0.30 0.01 50)",
                    }}
                  >
                    {r.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-base font-bold -tracking-[.01em]">
                      {r.who}{" "}
                      <span className="font-normal" style={{ color: "var(--t-muted-dark-2)" }}>
                        · {r.play}
                      </span>
                    </p>
                    <p
                      className="m-0 mt-1"
                      style={{
                        fontFamily: "var(--t-display)",
                        fontStyle: "italic",
                        fontSize: 17,
                        lineHeight: 1.3,
                        color: "oklch(0.30 0.01 50)",
                      }}
                    >
                      &ldquo;{r.line}&rdquo;
                    </p>
                    <p className="m-0 mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                      <span
                        className="rounded-full px-2.5 py-[3px]"
                        style={{ background: "oklch(0.92 0.02 80)" }}
                      >
                        {r.len}
                      </span>
                      <span
                        className="rounded-full px-2.5 py-[3px]"
                        style={{ background: "oklch(0.92 0.02 80)" }}
                      >
                        {r.tone}
                      </span>
                      <span
                        className="rounded-full px-2.5 py-[3px]"
                        style={{
                          background: r.od
                            ? "oklch(0.70 0.18 48 / .18)"
                            : "oklch(0.92 0.18 100 / .5)",
                          color: r.od ? "oklch(0.45 0.16 45)" : "oklch(0.30 0.05 100)",
                        }}
                      >
                        {r.overdone}
                      </span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* --- The rehearsal --------------------------------------------- */}
          <div
            className="relative rounded-[28px] p-7"
            style={{
              background: "var(--t-stage-card)",
              color: "var(--t-cream)",
              boxShadow:
                "0 0 0 1px oklch(0.72 0.17 55 / .5), 0 40px 120px -30px oklch(0.72 0.17 55 / .45)",
              transform: "rotate(1deg)",
              marginTop: "clamp(0px,4vw,56px)",
            }}
          >
            <div
              className="absolute -top-[18px] right-7 rounded-full px-3.5 py-1.5"
              style={{
                background: "var(--t-cta-bg)",
                color: "var(--t-cta-fg)",
                border: "1.5px solid var(--t-cta-bd)",
                fontFamily: "var(--t-direction)",
                fontStyle: "italic",
                fontSize: 12,
                letterSpacing: ".06em",
                transform: "rotate(-2deg)",
              }}
            >
              (act ii · 2am. the rehearsal.)
            </div>

            <div className="flex items-center justify-between gap-3">
              <p
                className="m-0 -tracking-[.01em]"
                style={{ fontFamily: "var(--t-display)", fontSize: 26 }}
              >
                ScenePartner{" "}
                <em className="t-em" style={{ color: "var(--t-gel)" }}>
                  · Hedda Gabler, act ii
                </em>
              </p>
              <span
                className="flex items-center gap-1.5"
                style={{
                  fontFamily: "var(--t-direction)",
                  fontSize: 12,
                  letterSpacing: ".06em",
                  color: "var(--t-muted-light-2)",
                }}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{
                    background: "var(--t-gel)",
                    animation: "t-pulse 1.4s ease-in-out infinite",
                  }}
                />
                listening
              </span>
            </div>

            <div className="mt-[22px] flex min-h-[340px] flex-col gap-3.5">
              {lines.map((l, k) => (
                <div
                  key={`${k}-${l.who}`}
                  className="flex max-w-[88%] flex-col gap-1"
                  style={{
                    alignSelf: l.you ? "flex-end" : "flex-start",
                    animation: "t-pop .6s var(--t-spring) both",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--t-direction)",
                      fontSize: 11,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: l.you ? "var(--t-gel)" : "var(--t-orange)",
                    }}
                  >
                    {l.who}
                  </span>
                  <p
                    className="m-0 px-4 py-3"
                    style={{
                      borderRadius: 16,
                      fontSize: 16,
                      lineHeight: 1.4,
                      background: l.you ? "oklch(0.92 0.18 100 / .14)" : "var(--t-cream)",
                      color: l.you ? "oklch(0.90 0.06 95)" : "var(--t-text)",
                      fontFamily: l.you ? "var(--t-direction)" : "var(--t-display)",
                      fontStyle: l.you ? "italic" : "normal",
                    }}
                  >
                    {l.text}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="mt-[18px] flex items-center gap-2.5"
              style={{
                fontFamily: "var(--t-direction)",
                fontStyle: "italic",
                fontSize: 13,
                letterSpacing: ".06em",
                color: "var(--t-muted-light)",
              }}
            >
              <span aria-hidden className="h-px flex-1" style={{ background: "var(--t-line-dark-3)" }} />
              (it waits for your cue. every time.)
              <span aria-hidden className="h-px flex-1" style={{ background: "var(--t-line-dark-3)" }} />
            </div>
          </div>
        </div>

        {/* --- Three plain claims ------------------------------------------ */}
        <div
          className="mt-24 grid gap-6"
          style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))" }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.head}
              className="group rounded-3xl p-7 transition-[transform,border-color] duration-[400ms]"
              style={
                {
                  border: "1.5px solid var(--t-line-dark-2)",
                  transitionTimingFunction: "var(--t-spring)",
                  "--tilt": f.tilt,
                  "--accent": f.accent,
                } as React.CSSProperties
              }
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = `translateY(-6px) rotate(${f.tilt})`;
                e.currentTarget.style.borderColor = f.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.borderColor = "var(--t-line-dark-2)";
              }}
            >
              <p
                className="m-0"
                style={{
                  fontFamily: "var(--t-display)",
                  fontSize: "clamp(2.4rem,4vw,3.6rem)",
                  lineHeight: 1,
                  letterSpacing: "-.02em",
                  color: f.accent,
                }}
              >
                {f.head}
              </p>
              <p
                className="m-0 mt-1.5 text-base leading-relaxed"
                style={{ color: "var(--t-muted-light-3)" }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
