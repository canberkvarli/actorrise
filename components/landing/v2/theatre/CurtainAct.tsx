"use client";

import Image from "next/image";
import { useCallback, useRef } from "react";
import { appStoreUrl } from "@/lib/appStore";
import { TheatreCta } from "./TheatreCta";
import { useScrollProgress } from "./useScrollProgress";

const SHOTS = [
  { src: "/ghostlight/read.png", alt: "Ghost Light reading view", w: "clamp(80px,10vw,120px)", rot: -8 },
  { src: "/ghostlight/search.png", alt: "Ghost Light search", w: "clamp(100px,12vw,150px)", rot: 0 },
  { src: "/ghostlight/saves.png", alt: "Ghost Light saved pieces", w: "clamp(80px,10vw,120px)", rot: 8 },
];

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

          {/* Ghost Light, for iOS. */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            <div className="flex items-end gap-3" style={{ perspective: 900 }}>
              {SHOTS.map((s, i) => (
                <div
                  key={s.src}
                  className="overflow-hidden transition-transform duration-500"
                  style={{
                    width: s.w,
                    transform: s.rot ? `rotate(${s.rot}deg) translateY(10px)` : undefined,
                    borderRadius: s.rot ? 20 : 24,
                    border: `1px solid ${s.rot ? "var(--t-line-dark-3)" : "var(--t-cta-bd)"}`,
                    opacity: s.rot ? 0.85 : 1,
                    boxShadow: s.rot ? undefined : "0 30px 80px -20px oklch(0.72 0.17 55 / .5)",
                    transitionTimingFunction: "var(--t-spring)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = s.rot
                      ? `rotate(${s.rot / 2}deg) translateY(-10px)`
                      : "translateY(-14px) scale(1.04)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = s.rot
                      ? `rotate(${s.rot}deg) translateY(10px)`
                      : "";
                  }}
                >
                  <Image
                    src={s.src}
                    alt={s.alt}
                    width={i === 1 ? 300 : 240}
                    height={i === 1 ? 650 : 520}
                    className="block h-auto w-full"
                  />
                </div>
              ))}
            </div>
            <div className="max-w-[300px] text-left">
              <p
                className="m-0 -tracking-[.01em]"
                style={{ fontFamily: "var(--t-display)", fontSize: 28, lineHeight: 1.05 }}
              >
                Ghost Light,{" "}
                <em className="t-em" style={{ color: "var(--t-gel)" }}>
                  for iOS.
                </em>
              </p>
              <p
                className="m-0 mt-2 text-[15px]"
                style={{ color: "var(--t-muted-light-2)", lineHeight: 1.45 }}
              >
                The whole library, offline saves, and a reading light for dark wings.
              </p>
              <a
                href={appStoreUrl("landing_teaser")}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3.5 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors hover:!border-[var(--t-gel)] hover:!text-[var(--t-gel)]"
                style={{ border: "1.5px solid var(--t-cta-bd)", color: "var(--t-cream)" }}
              >
                <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden>
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                </svg>
                Download on the App Store
              </a>
            </div>
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
