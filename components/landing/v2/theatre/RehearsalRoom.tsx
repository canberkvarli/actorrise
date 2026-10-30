"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Act II, continued — the rehearsal room. What ScenePartner does past the
 * Hedda demo above it: the three ways to hold the book (lib/rehearsal/book.ts),
 * "Line!" when the words will not come, your own sides brought in, and the
 * house shelf of classic scenes.
 *
 * The book is the one live thing on the landing page: the tabs and the Line!
 * button work. Left alone it runs itself (script, cues, then off book with a
 * line called for halfway); a visitor's first tap stops the loop and hands
 * them the controls. Nothing calls the API.
 *
 * Every fact here was checked against the app on 2026-10-30: the three modes
 * and their names, Line! by button or said aloud, .pdf/.docx/.txt uploads, 271
 * live public-domain scenes, and the plays named on the spines are all on that
 * shelf. The Community library is not mentioned: nothing on it is live yet.
 */

type Mode = "script" | "cues" | "off";

const MODES: { id: Mode; label: string }[] = [
  { id: "script", label: "Script" },
  { id: "cues", label: "Cues" },
  { id: "off", label: "Off book" },
];

const CUE = "Before all else, you are a wife and a mother.";
const LINE =
  "I don't believe that any longer. I believe that before all else I am a reasonable human being, just as you are.";
const WORDS = LINE.split(" ");
/** Where the demo actor dries, and how many words a Line! hands them. */
const DRY_AT = 9;
const GIVEN = 3;
const CUE_WORDS = 2;

const SPINES = [
  { t: "A Doll's House", a: "Ibsen", h: 92, c: "oklch(0.70 0.18 48)" },
  { t: "Hamlet", a: "Shakespeare", h: 100, c: "oklch(0.30 0.03 40)" },
  { t: "Hedda Gabler", a: "Ibsen", h: 84, c: "oklch(0.92 0.18 100)" },
  { t: "Twelfth Night", a: "Shakespeare", h: 96, c: "oklch(0.55 0.12 30)" },
  { t: "Earnest", a: "Wilde", h: 100, c: "oklch(0.88 0.04 85)" },
  { t: "Uncle Vanya", a: "Chekhov", h: 88, c: "oklch(0.42 0.08 150)" },
  { t: "Tartuffe", a: "Molière", h: 80, c: "oklch(0.62 0.15 60)" },
  { t: "Othello", a: "Shakespeare", h: 94, c: "oklch(0.25 0.02 50)" },
  { t: "Much Ado", a: "Shakespeare", h: 98, c: "oklch(0.80 0.10 80)" },
];

const dir = {
  fontFamily: "var(--t-direction)",
  fontStyle: "italic" as const,
  letterSpacing: ".06em",
};

export function RehearsalRoom() {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>("cues");
  /** Words the actor has said so far (off book fills them as they come). */
  const [said, setSaid] = useState(WORDS.length);
  /** Indexes handed over by a Line!, shown as given rather than remembered. */
  const [given, setGiven] = useState<Set<number>>(new Set());
  const [auto, setAuto] = useState(true);
  const [calling, setCalling] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reduced || !auto) return;
    const after = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const run = () => {
      setGiven(new Set());
      setCalling(false);
      setMode("script");
      setSaid(WORDS.length);
      after(3200, () => setMode("cues"));
      after(6400, () => {
        setMode("off");
        setSaid(0);
        let n = 0;
        const speak = () => {
          n += 1;
          setSaid(n);
          if (n === DRY_AT) {
            // The actor dries. A beat, then "Line!", then the words come back.
            after(1100, () => setCalling(true));
            after(1700, () => {
              setCalling(false);
              setGiven(new Set(Array.from({ length: GIVEN }, (_, i) => DRY_AT + i)));
              n += GIVEN;
              setSaid(n);
              after(700, speak);
            });
          } else if (n < WORDS.length) {
            after(230 + Math.random() * 120, speak);
          }
        };
        after(700, speak);
      });
      after(17500, run);
    };
    run();
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.length = 0;
    };
  }, [reduced, auto]);

  function take(next: Mode) {
    setAuto(false);
    setCalling(false);
    setMode(next);
    setGiven(new Set());
    setSaid(next === "off" ? 0 : WORDS.length);
  }

  function line() {
    setAuto(false);
    const from = mode === "cues" && said === WORDS.length ? CUE_WORDS : said;
    if (mode === "cues" && said === WORDS.length) setSaid(CUE_WORDS);
    const add = Array.from({ length: GIVEN }, (_, i) => from + i).filter((i) => i < WORDS.length);
    setGiven((g) => new Set([...g, ...add]));
    setSaid(Math.min(WORDS.length, from + add.length));
  }

  return (
    <section
      id="rehearsal-room"
      className="relative overflow-hidden px-6 pb-[140px] pt-6"
      style={{ background: "var(--t-stage)", color: "var(--t-cream)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 40% at 20% 40%, oklch(0.72 0.17 55 / .14), transparent 70%), radial-gradient(40% 40% at 85% 25%, oklch(0.92 0.18 100 / .10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-[1240px]">
        <p className="t-dir" style={{ color: "var(--t-muted-light)" }}>
          (act ii, continued. the rehearsal room.)
        </p>
        <h2 className="t-h2 mt-4 max-w-[960px]">
          Bring your sides.{" "}
          <em className="t-em" style={{ color: "var(--t-orange)" }}>
            Leave off book.
          </em>
        </h2>

        <div className="mt-16 grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* --- The book ------------------------------------------------- */}
          <div
            className="relative rounded-[28px] p-6 sm:p-8"
            style={{
              background: "var(--t-paper-2)",
              color: "var(--t-text-soft)",
              boxShadow:
                "0 0 0 1px oklch(0.72 0.17 55 / .45), 0 40px 120px -30px oklch(0.72 0.17 55 / .4)",
              transform: "rotate(-.6deg)",
            }}
          >
            <div
              className="absolute -top-[18px] left-7 rounded-full px-3.5 py-1.5"
              style={{
                ...dir,
                background: "var(--t-cta-bg)",
                color: "var(--t-cta-fg)",
                fontSize: 12,
                transform: "rotate(-2deg)",
              }}
            >
              (hold the book how you need it.)
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div
                role="tablist"
                aria-label="How much of your line to show"
                className="inline-flex rounded-full p-1"
                style={{ background: "var(--t-paper)", border: "1.5px solid var(--t-line-light-2)" }}
              >
                {MODES.map((m) => {
                  const on = m.id === mode;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => take(m.id)}
                      className="rounded-full px-4 py-2 text-[14px] font-semibold transition-[background,color] duration-300"
                      style={{
                        background: on ? "var(--t-text-soft)" : "transparent",
                        color: on ? "var(--t-cream)" : "var(--t-muted-dark-2)",
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="m-0" style={{ ...dir, fontSize: 13, color: "var(--t-muted-dark-2)" }}>
                A Doll&rsquo;s House · act iii
              </p>
            </div>

            <div className="mt-7 flex flex-col gap-5">
              <div>
                <p
                  className="m-0"
                  style={{ ...dir, fontStyle: "normal", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--t-gel-ink)" }}
                >
                  Helmer
                </p>
                <p
                  className="m-0 mt-1.5"
                  style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.15rem,2.2vw,1.45rem)", lineHeight: 1.35 }}
                >
                  {CUE}
                </p>
              </div>

              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--t-paper)", border: "1.5px solid var(--t-line-light-2)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p
                    className="m-0"
                    style={{ ...dir, fontStyle: "normal", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--t-orange)" }}
                  >
                    You · Nora
                  </p>
                  {mode !== "script" && (
                    <button
                      type="button"
                      onClick={line}
                      className="rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-transform duration-300 hover:-rotate-2 hover:scale-105"
                      style={{
                        background: calling ? "var(--t-orange)" : "var(--t-text-soft)",
                        color: calling ? "var(--t-cta-fg)" : "var(--t-cream)",
                        transform: calling ? "scale(1.12) rotate(-3deg)" : undefined,
                        transitionTimingFunction: "var(--t-spring)",
                      }}
                    >
                      Line!
                    </button>
                  )}
                </div>
                <p
                  className="m-0 mt-2.5"
                  aria-label={LINE}
                  style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.15rem,2.2vw,1.45rem)", lineHeight: 1.6 }}
                >
                  {WORDS.map((w, i) => (
                    <Word key={i} word={w} state={wordState(mode, i, said, given)} />
                  ))}
                </p>
              </div>
            </div>

            <p className="m-0 mt-5 text-[15px] leading-relaxed" style={{ color: "var(--t-muted-dark-2)" }}>
              Read it, run it on cues, then take the book away. Dry up and say{" "}
              <strong style={{ color: "var(--t-text-soft)" }}>&ldquo;line&rdquo;</strong> out loud, the way you would in
              a rehearsal room. The next words come back, marked as given, so you know where you went off.
            </p>
          </div>

          {/* --- Your sides + the shelf ------------------------------------- */}
          <div className="flex flex-col gap-8">
            <div
              className="group relative overflow-hidden rounded-[28px] p-7"
              style={{ border: "1.5px solid var(--t-line-dark-2)", background: "var(--t-stage-card)" }}
            >
              <div className="flex items-start gap-5">
                <div className="relative h-[118px] w-[92px] shrink-0" aria-hidden>
                  {[2, 1, 0].map((k) => (
                    <div
                      key={k}
                      className="absolute inset-0 rounded-[6px] transition-transform duration-500"
                      style={{
                        background: k === 0 ? "var(--t-cream)" : "oklch(0.88 0.03 80)",
                        transform: `rotate(${(k - 1) * 6}deg) translate(${k * 4}px, ${k * -3}px)`,
                        boxShadow: "0 10px 24px -10px rgb(0 0 0 / .6)",
                        transitionTimingFunction: "var(--t-spring)",
                      }}
                    >
                      {k === 0 && (
                        <div className="flex flex-col gap-[5px] p-2.5">
                          <span style={{ ...dir, fontStyle: "normal", fontSize: 7, letterSpacing: ".1em", color: "oklch(0.45 0.16 45)" }}>
                            NORA
                          </span>
                          {[90, 70, 84].map((w) => (
                            <span key={w} className="h-[3px] rounded" style={{ width: `${w}%`, background: "oklch(0.75 0.02 70)" }} />
                          ))}
                          <span style={{ ...dir, fontStyle: "normal", fontSize: 7, letterSpacing: ".1em", color: "oklch(0.40 0.03 50)" }}>
                            HELMER
                          </span>
                          {[80, 60].map((w) => (
                            <span key={w} className="h-[3px] rounded" style={{ width: `${w}%`, background: "oklch(0.75 0.02 70)" }} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="m-0" style={{ fontFamily: "var(--t-display)", fontSize: 28, lineHeight: 1.05 }}>
                    Your sides,{" "}
                    <em className="t-em" style={{ color: "var(--t-gel)" }}>
                      read back.
                    </em>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[".pdf", ".docx", ".txt"].map((x) => (
                      <span
                        key={x}
                        className="rounded-full px-2.5 py-[3px] text-xs font-semibold"
                        style={{ border: "1px solid var(--t-line-dark-3)", color: "var(--t-muted-light-2)" }}
                      >
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="m-0 mt-5 text-[15px] leading-relaxed" style={{ color: "var(--t-muted-light-3)" }}>
                Drop in the file your sides came in. It finds the scenes and who&rsquo;s in them. You pick your part, and
                your partner reads every other line, out loud, waiting on your cue.
              </p>
            </div>

            <div
              className="relative overflow-hidden rounded-[28px] p-7"
              style={{ border: "1.5px solid var(--t-line-dark-2)" }}
            >
              <p className="m-0" style={{ fontFamily: "var(--t-display)", fontSize: 28, lineHeight: 1.05 }}>
                271 scenes,{" "}
                <em className="t-em" style={{ color: "var(--t-orange)" }}>
                  already cut.
                </em>
              </p>
              <div className="mt-5 flex h-[112px] items-end gap-[5px] overflow-hidden" aria-hidden>
                {SPINES.map((s) => (
                  <div
                    key={s.t}
                    title={`${s.t} · ${s.a}`}
                    className="flex min-w-[24px] max-w-[46px] flex-1 items-center justify-center rounded-[3px] transition-transform duration-500 hover:-translate-y-3 hover:-rotate-3"
                    style={{
                      height: `${s.h}%`,
                      background: s.c,
                      boxShadow: "inset -3px 0 0 rgb(0 0 0 / .18), inset 2px 0 0 rgb(255 255 255 / .12)",
                      transitionTimingFunction: "var(--t-spring)",
                    }}
                  >
                    <span
                      className="truncate"
                      style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                        maxHeight: "92%",
                        fontFamily: "var(--t-display)",
                        fontStyle: "italic",
                        fontSize: 12,
                        color: lightSpine(s.c) ? "oklch(0.2 0.02 50)" : "oklch(0.95 0.02 85)",
                      }}
                    >
                      {s.t}
                    </span>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-5 text-[15px] leading-relaxed" style={{ color: "var(--t-muted-light-3)" }}>
                Two-person scenes from Ibsen, Shakespeare, Chekhov, Wilde and Molière, on the shelf and ready to run
                tonight. No script to find first.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type WordState = "plain" | "said" | "given" | "hidden";

function wordState(mode: Mode, i: number, said: number, given: Set<number>): WordState {
  if (given.has(i)) return "given";
  if (mode === "script") return "plain";
  if (mode === "cues" && i < CUE_WORDS) return "plain";
  if (mode === "cues" && said === WORDS.length) return "hidden";
  return i < said ? "said" : "hidden";
}

function Word({ word, state }: { word: string; state: WordState }) {
  if (state === "hidden") {
    return (
      <>
        <span
          aria-hidden
          className="inline-block rounded-[3px] align-middle"
          style={{
            width: `${Math.max(1.2, word.length * 0.42)}em`,
            height: ".5em",
            background: "oklch(0.86 0.02 80)",
          }}
        />{" "}
      </>
    );
  }
  return (
    <>
      <span
        style={
          state === "given"
            ? {
                color: "var(--t-gel-ink)",
                textDecoration: "underline dotted",
                textUnderlineOffset: 5,
                animation: "t-pop .5s var(--t-spring) both",
              }
            : state === "said"
              ? { animation: "t-pop .35s var(--t-spring) both" }
              : undefined
        }
      >
        {word}
      </span>{" "}
    </>
  );
}

function lightSpine(c: string): boolean {
  return Number(c.match(/oklch\(([\d.]+)/)?.[1] ?? 0) > 0.6;
}
