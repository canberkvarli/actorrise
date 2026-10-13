"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";
const DURATION_MS = 260;

/**
 * A soft entrance when the route changes, and nothing else.
 *
 * It used to be a framer `motion.div` keyed by pathname, starting at opacity 0.
 * Two costs, both visible:
 *  - The key remounted the entire page subtree on every navigation, so each
 *    page threw away its state and replayed its own loading branch on top of
 *    the route's loading.tsx. That was the second skeleton.
 *  - `initial={{ opacity: 0 }}` is rendered into the server HTML, so every hard
 *    load painted the header over an empty page until hydration, then faded
 *    the body in. That was the blank beat and the "pop".
 *
 * Now the element is stable and the animation is played on it with the Web
 * Animations API when the pathname changes. The first render is never
 * animated, so server HTML paints as it arrives, and nothing is remounted.
 */
export function PageTransition({
  children,
  transitionKey,
}: {
  children: React.ReactNode;
  /** When this changes, the entrance plays again (e.g. pathname). */
  transitionKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastKey = useRef(transitionKey);

  useLayoutEffect(() => {
    if (lastKey.current === transitionKey) return;
    lastKey.current = transitionKey;
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // No transform at rest: a transformed ancestor would capture every
    // position:fixed descendant (sheets, docks, toasts) for the duration.
    const anim = el.animate(
      [
        { opacity: 0.001, transform: "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: DURATION_MS, easing: EASE },
    );
    return () => anim.cancel();
  }, [transitionKey]);

  return <div ref={ref}>{children}</div>;
}

/** PageTransition keyed by pathname, for layouts that are server components. */
export function PageTransitionWithKey({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <PageTransition transitionKey={pathname}>{children}</PageTransition>;
}
