"use client";

import { useCallback, useRef } from "react";
import { TheatreCta } from "./TheatreCta";
import { useScrollProgress } from "./useScrollProgress";

/**
 * Act IV — the curtain, run backwards. It starts closed on the word
 * "(curtain.)" and parts as you scroll to show the last call to action.
 *
 * The ease is `1 - (1-p)^3`: the panels break apart quickly and then glide
 * the last of the way, which is how a real traveler behaves on a winch.
 *
 * This is not `HouseCurtain`. That one is a house curtain that flies out once
 * at page load, over the hero. This is a traveler, driven by scroll, at the
 * end. They are opposite ends of the same evening.
 */
export function CurtainAct() {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((p: number) => {
    /* Offset by a tenth of a screen so the curtain is still shut for a beat
       after the section arrives, instead of already opening on entry.

       Smoothstep, not an ease-out. An ease-out is fastest at the start, so
       `1-(1-p)^n` had the panels a third open in the first inch of scroll and
       then crawling — the snap was at the top, where it is most visible. This
       eases both ends: the curtain takes weight before it moves, pulls
       steadily through the middle, and settles instead of stopping. */
    const shifted = Math.min(1, Math.max(0, (p * 1.1 - 0.1) / 1));
    const eased = shifted * shifted * (3 - 2 * shifted);
    for (const r of [leftRef, rightRef, labelRef]) {
      r.current?.style.setProperty("--co", String(eased));
    }
  }, []);
  const sectionRef = useScrollProgress(apply);

  return (
    <section
      id="curtain"
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="relative"
      style={{ height: "250vh", background: "var(--t-ink)" }}
    >
      <div
        className="sticky top-0 h-screen overflow-hidden"
        style={{ color: "var(--t-cream)" }}
      >
        {/* Behind the curtain. */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center px-6 pb-10 pt-[100px] text-center"
          style={{
            background:
              "radial-gradient(70% 60% at 50% 30%, oklch(0.72 0.17 55 / .22), transparent 70%), var(--t-ink)",
          }}
        >
          <p className="t-dir" style={{ color: "var(--t-muted-light)" }}>
            (the ghost light stays on. the stage is never empty.)
          </p>
          <h2 className="t-h2 t-h2--big mt-5 max-w-[1100px]">
            Your{" "}
            <em className="t-em" style={{ color: "var(--t-orange)" }}>
              scene partner
            </em>{" "}
            is already waiting.
          </h2>
          <div className="mt-10">
            <TheatreCta />
          </div>
        </div>

        {/* The traveler. */}
        <div
          ref={leftRef}
          aria-hidden
          className="t-traveler t-traveler--l"
          style={{ transform: "translateX(calc(var(--co,0) * -105%))" }}
        />
        <div
          ref={rightRef}
          aria-hidden
          className="t-traveler t-traveler--r"
          style={{ transform: "translateX(calc(var(--co,0) * 105%))" }}
        />
        <div
          ref={labelRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-center"
          style={{ opacity: "calc(1 - var(--co,0) * 4)" }}
        >
          <p
            className="m-0"
            style={{
              fontFamily: "var(--t-display)",
              fontStyle: "italic",
              fontSize: "clamp(2.4rem,8vw,7rem)",
              lineHeight: 1,
              color: "var(--t-cream)",
              textShadow: "0 10px 40px rgb(0 0 0/.5)",
            }}
          >
            (curtain.)
          </p>
        </div>
      </div>
    </section>
  );
}
