"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lightweight scroll-reveal wrapper.
 * Uses a single CSS animation (compositor thread) instead of
 * framer-motion's per-element JS IntersectionObserver + React state.
 */
export function RevealSection({
  children,
  className = "",
  as: Tag = "section",
  id,
}: {
  children: ReactNode;
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
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref as any} id={id} className={`section-reveal ${className}`}>
      {children}
    </Tag>
  );
}
