"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The followspot behind the primary nav, and the bar's scroll behaviour: how
 * far you have scrolled (it compresses) and which way you are going (it gets
 * out of the way, and comes back when you scroll up).
 *
 * None of it is React state. The light's position is a measurement of the active
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
export function useHeaderLight(routeKey: string, locked = false) {
  const navRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  /* Read inside the scroll handler rather than closed over, so the listener is
     attached once for the life of the page instead of on every open/close. */
  const lockedRef = useRef(locked);
  const hiddenRef = useRef(false);

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

  /* Something is open under the bar — the account playbill, the phone sheet.
     Bring it back and keep it back until that closes. Sliding an open menu off
     the top of the screen is how you lose a tap. */
  useEffect(() => {
    lockedRef.current = locked;
    if (locked) {
      hiddenRef.current = false;
      if (shellRef.current) shellRef.current.dataset.hidden = "false";
    }
  }, [locked]);

  useEffect(() => {
    const bar = barRef.current;
    const shell = shellRef.current;
    let lastY = window.scrollY;

    const onScroll = () => {
      const y = window.scrollY;
      if (bar) bar.dataset.scrolled = y > 24 ? "true" : "false";

      /* Compressing was never enough on its own: a pill pinned to the top of
         the page still sits over the first line of whatever you scrolled down
         to read. Going down, it leaves; the moment you scroll up — which is
         the moment you wanted the nav — it comes back.

         The 4px deltas are deadzone, not decoration: without them momentum
         scrolling on a phone flips the bar in and out every frame. The 120/80
         thresholds keep it present at the top of the page, where there is
         nothing to get out of the way of yet. */
      const down = y > lastY + 4;
      const up = y < lastY - 4;
      lastY = y;

      let next = hiddenRef.current;
      if (lockedRef.current) next = false;
      else if (down && y > 120) next = true;
      else if (up || y < 80) next = false;

      if (next !== hiddenRef.current) {
        hiddenRef.current = next;
        if (shell) shell.dataset.hidden = next ? "true" : "false";
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { navRef, lightRef, barRef, shellRef };
}
