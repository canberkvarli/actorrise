"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

import { useT } from "@/lib/i18n";
import { SLIDES } from "./AuditionsIntro";
import { IntroStage } from "./intro/IntroScenes";
import s from "./intro/intro.module.css";

// One full loop of each scene (intro.module.css: .s1 9s, .s2 8s, .s3 9s).
const LOOP_MS = [9000, 8000, 9000];

/**
 * How it works, running on the empty page under the paste box: the intro's
 * three scenes in turn, each for one loop, with its line beside it. It pauses
 * off screen and in a hidden tab, and with reduced motion it holds the first
 * finished picture until a dot is picked.
 */
export function IntroLoop({ onExpand }: { onExpand: (step: number) => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const paused = !visible;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    const sync = () => setVisible(onScreen && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    }, { threshold: 0.25 });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // A paused loop restarts its card on resume, so the dot and the scene stay together.
  useEffect(() => {
    if (paused || reduced) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % SLIDES.length), LOOP_MS[i]);
    return () => window.clearTimeout(t);
  }, [i, paused, reduced]);

  const slide = SLIDES[i];
  const Scene = slide.scene;

  return (
    <section
      ref={ref}
      aria-label={t("appAuditionsIntro.howItWorks")}
      className={s.inline}
      data-paused={paused ? "true" : undefined}
    >
      <div className="relative min-w-0">
        <IntroStage key={`${i}-${paused}`}>
          <Scene />
        </IntroStage>
        <button
          type="button"
          className={s.inlineExpand}
          aria-label={t("appAuditionsIntro.watchBigger")}
          title={t("appAuditionsIntro.watchBigger")}
          onClick={() => onExpand(i)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
      <div className={s.inlineCopy}>
        <p key={`t${i}`} className={s.inlineTitle}>{t(slide.title)}</p>
        <p key={`b${i}`} className={s.inlineBody}>{t(slide.body)}</p>
        <p className="sr-only">{t(slide.picture)}</p>
        <div className={s.inlineDots} role="group" aria-label={t("appAuditionsIntro.pickStep")}>
          {SLIDES.map((x, n) => (
            <button
              key={n}
              type="button"
              className={s.inlineDot}
              aria-label={t("appAuditionsIntro.stepLabel", { n: n + 1, title: t(x.title) })}
              aria-current={n === i ? "step" : undefined}
              data-state={n < i || (n === i && (reduced || paused)) ? "done" : n === i ? "now" : undefined}
              style={{ "--dot-ms": `${LOOP_MS[n]}ms` } as CSSProperties}
              onClick={() => setI(n)}
            >
              <span key={n === i ? `${i}-${paused}` : n} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
