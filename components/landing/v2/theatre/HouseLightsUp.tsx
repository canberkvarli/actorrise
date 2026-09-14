"use client";

import { useCallback, useRef } from "react";
import { useScrollProgress } from "./useScrollProgress";

/**
 * The act change: blackout to house lights, as a growing circle.
 *
 * Two identical layers, the cream one clipped to `circle(var(--hr))`. Scrolling
 * grows the circle from nothing to past the corners, so the room lights come up
 * on you rather than cross-fading. The 1.4 exponent keeps it dark for the first
 * third of the scroll — a linear ramp lights the house almost immediately and
 * the moment is gone.
 */
export function HouseLightsUp() {
  const creamRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((p: number) => {
    creamRef.current?.style.setProperty("--hr", `${Math.pow(p, 1.4) * 120}%`);
  }, []);
  const sectionRef = useScrollProgress(apply);

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      aria-label="House lights up"
      className="relative"
      style={{ height: "220vh", background: "var(--t-stage)" }}
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        <div
          className="absolute inset-0 flex items-center justify-center p-6 text-center"
          style={{ color: "var(--t-cream)" }}
        >
          <div className="max-w-[1000px]">
            <p className="t-dir" style={{ color: "var(--t-muted-light)" }}>
              (keep scrolling.)
            </p>
            <p className="t-h2 t-h2--big mt-5">
              House lights{" "}
              <em className="t-em" style={{ color: "var(--t-line-dark-3)" }}>
                up.
              </em>
            </p>
          </div>
        </div>

        <div
          ref={creamRef}
          aria-hidden
          className="absolute inset-0 flex items-center justify-center p-6 text-center"
          style={{
            background: "var(--t-cream)",
            color: "var(--t-text)",
            clipPath: "circle(var(--hr,0%) at 50% 50%)",
          }}
        >
          <div className="max-w-[1000px]">
            <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
              (and there they are. the actors.)
            </p>
            <p className="t-h2 t-h2--big mt-5">
              House lights{" "}
              <em className="t-em" style={{ color: "var(--t-orange-deep)" }}>
                up.
              </em>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
