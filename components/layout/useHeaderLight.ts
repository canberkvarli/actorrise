"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The followspot behind the primary nav, and the bar's scroll state.
 *
 * The light is measured from whichever tab is currently active rather than
 * animated per item: one absolutely-positioned span is told where to be, and
 * CSS moves it. That means adding or removing a nav item needs no new state,
 * and the movement reads as one lamp finding the next actor instead of two
 * pills swapping colour.
 *
 * It re-measures on route change, on resize, and once more a beat after mount —
 * the nav's web font lands after first paint and shifts every tab's width, so a
 * single measurement on mount puts the light in the wrong place for as long as
 * the page is open.
 */
export function useHeaderLight(routeKey: string) {
  const navRef = useRef<HTMLElement>(null);
  const [light, setLight] = useState<{ left: number; width: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const measure = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) {
      setLight(null);
      return;
    }
    setLight({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  useEffect(() => {
    measure();
    /* Fonts land after first paint and change every tab's width. */
    const settle = setTimeout(measure, 600);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", onResize);
    };
  }, [measure, routeKey]);

  useEffect(() => {
    const onScroll = () => {
      /* Compared before setting, so a scroll only re-renders the header on the
         one frame the answer actually changes. */
      setScrolled((was) => {
        const now = window.scrollY > 24;
        return now === was ? was : now;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const lightStyle: React.CSSProperties = light
    ? { left: light.left, width: light.width, opacity: 1 }
    : { opacity: 0 };

  return { navRef, lightStyle, scrolled };
}
