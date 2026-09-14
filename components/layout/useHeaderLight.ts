"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The followspot behind the primary nav, and the bar's scroll state.
 *
 * Neither is React state. The light's position is a measurement of the active
 * tab, and "have you scrolled past 24px" is a fact about the window — both are
 * presentation, and putting them in state would re-render the whole header
 * shell on every scroll frame and every resize to move one span four pixels.
 * They are written straight to the DOM instead: the light gets left/width, the
 * bar gets a data attribute, and CSS animates both.
 *
 * The light re-measures on route change, on resize, and once more a beat after
 * mount — the nav's web font lands after first paint and changes every tab's
 * width, so a single measurement on mount leaves the lamp in the wrong place
 * for the life of the page.
 */
export function useHeaderLight(routeKey: string) {
  const navRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const nav = navRef.current;
    const light = lightRef.current;
    if (!nav || !light) return;
    const active = nav.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) {
      light.style.opacity = "0";
      return;
    }
    light.style.opacity = "1";
    light.style.left = `${active.offsetLeft}px`;
    light.style.width = `${active.offsetWidth}px`;
  }, []);

  useEffect(() => {
    place();
    /* Fonts land after first paint and change every tab's width. */
    const settle = setTimeout(place, 600);
    window.addEventListener("resize", place);
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [place, routeKey]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const onScroll = () => {
      bar.dataset.scrolled = window.scrollY > 24 ? "true" : "false";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { navRef, lightRef, barRef };
}
