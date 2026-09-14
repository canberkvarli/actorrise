"use client";

import { useEffect, useRef } from "react";

/**
 * The act change. A traveler curtain runs across the full width between the
 * dark stage and the daylight product. When it scrolls into view the two
 * halves draw off into the wings and the footlights behind them come up.
 *
 * It is a band in normal flow, not an overlay, so it never covers content
 * and there is nothing to get wrong on a phone. The footlights are the same
 * strip the page already used as its act boundary; the traveler just gives
 * them an entrance.
 */
export function Traveler() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-open");
          observer.unobserve(el);
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className="traveler">
      <div className="traveler__lights stage-footlights" />
      <div className="traveler__half traveler__half--left" />
      <div className="traveler__half traveler__half--right" />
    </div>
  );
}
