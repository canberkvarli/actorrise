"use client";

import { useEffect, useRef } from "react";

/**
 * The house curtain. Rendered in the server HTML and flown out by pure CSS,
 * so it is on screen from the very first paint with no hydration gap and
 * nothing behind it ever waits on JavaScript: the H1 is in the DOM the whole
 * time, the curtain is only an overlay.
 *
 * Plays once per session. The inline script below runs before this element
 * paints and, for a repeat visit (or reduced motion), stamps
 * data-curtain="skip" on <html>: that hides the curtain and zeroes
 * --curtain-delay so the hero opens immediately. It has to be a blocking
 * inline script rather than an effect, or the curtain would flash for one
 * frame on every page you come back to.
 *
 * Any input skips it: a click, a key, a wheel. Nobody is made to wait for
 * a curtain they have already seen or do not care about.
 */
const PRE_PAINT = `(function(){try{var r=document.documentElement;var m=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;var s=sessionStorage.getItem("ar_curtain");if(m||s){r.dataset.curtain="skip"}else{sessionStorage.setItem("ar_curtain","1")}}catch(e){}})()`;

export function HouseCurtain() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const finish = () => {
      el.dataset.done = "";
    };
    // Skip on any intent to interact. Zeroing the delay lets the hero cues
    // that were still waiting fire now instead of after the full lift.
    const skip = () => {
      document.documentElement.style.setProperty("--curtain-delay", "0s");
      finish();
    };
    const opts = { once: true, passive: true } as const;
    window.addEventListener("pointerdown", skip, opts);
    window.addEventListener("keydown", skip, opts);
    window.addEventListener("wheel", skip, opts);
    window.addEventListener("touchstart", skip, opts);
    el.addEventListener("animationend", finish, { once: true });
    return () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      <div ref={ref} aria-hidden className="house-curtain">
        <div className="house-curtain__velvet" />
        <div className="house-curtain__hem" />
        <div className="house-curtain__shadow" />
      </div>
    </>
  );
}
