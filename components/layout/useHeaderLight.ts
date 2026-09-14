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

    /* A single re-measure on a timer is not enough, and this is how the lamp
       ended up stranded at the left of the bar on /practice with the active
       tab rendering ink-on-ink — unreadable, because the tab's colour assumes
       the light is behind it.

       The nav is `flex: 1` between the logo and the utilities, so ANYTHING
       that changes the utilities' width moves every tab: the account button
       swapping "Account" for a real name and tier badge when the user loads,
       the callboard lamp swapping an icon for a count, a web font landing.
       Those happen at times no timeout can predict. An observer on the nav
       catches all of them, including the font. */
    const nav = navRef.current;
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => place())
        : null;
    if (ro && nav) {
      ro.observe(nav);
      /* Tabs can change width without the nav box changing at all. */
      for (const tab of nav.querySelectorAll("[data-nav]")) ro.observe(tab);
    }

    /* Belt and braces for the font, which can land before the observer is
       attached on a warm cache. */
    document.fonts?.ready.then(place).catch(() => {});

    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
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
