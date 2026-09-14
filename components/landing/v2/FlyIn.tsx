"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type FlyVariant = "drop" | "wing-left" | "wing-right";

/**
 * Scenery cue. The section arrives the way a set piece does: flown in from
 * above on its batten, or tracked in from the wings on a carriage. Same
 * shape as RevealSection (one IntersectionObserver, one class, compositor
 * animation) so it costs nothing extra; only the choreography differs.
 *
 * Offsets are fixed pixels, never a share of width, so a section coming in
 * from the wings can never widen the document.
 */
export function FlyIn({
  children,
  variant = "drop",
  className = "",
  as: Tag = "section",
  id,
}: {
  children: ReactNode;
  variant?: FlyVariant;
  className?: string;
  as?: "section" | "div";
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-flown");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} id={id} data-fly={variant} className={`fly-in ${className}`}>
      {children}
    </Tag>
  );
}
