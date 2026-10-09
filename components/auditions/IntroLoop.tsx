"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

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
export function IntroLoop() {
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
      aria-label="How it works"
      className={s.inline}
      data-paused={paused ? "true" : undefined}
    >
      <IntroStage key={`${i}-${paused}`}>
        <Scene />
      </IntroStage>
      <div className={s.inlineCopy}>
        <p className="aud-eyebrow">How it works</p>
        <p key={`t${i}`} className={s.inlineTitle}>{slide.title}</p>
        <p key={`b${i}`} className={s.inlineBody}>{slide.body}</p>
        <p className="sr-only">{slide.picture}</p>
        <div className={s.inlineDots} role="group" aria-label="Pick a step">
          {SLIDES.map((x, n) => (
            <button
              key={n}
              type="button"
              className={s.inlineDot}
              aria-label={`Step ${n + 1}: ${x.title}`}
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
