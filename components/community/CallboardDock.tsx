"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CallboardMarquee } from "./CallboardMarquee";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * The marquee, hung at the foot of the window instead of at the foot of the
 * page.
 *
 * It is the one thing in the rehearsal room that is about other people, and
 * parked at the end of the document it was only ever seen by somebody who had
 * already scrolled past their whole library — which, on a library of three
 * scripts, is nobody. A marquee is a fixture of the building: it hangs where it
 * hangs and you catch it on the way past.
 *
 * PORTALLED, and that is the whole reason this file exists rather than a
 * `fixed` div on the page. Every platform route is rendered inside
 * PageTransition's motion wrapper, which carries a transform — and a
 * transformed ancestor becomes the containing block for its fixed
 * descendants, so a strip docked "to the bottom of the screen" from inside the
 * page docks to the bottom of the transition instead and hangs ~100px below
 * the fold. Measured, not guessed: that ancestor computes to
 * matrix(1,0,0,1,0,10) mid-transition. document.body is the only parent in
 * this app guaranteed to be untransformed.
 *
 * Because it leaves the page's subtree it also leaves the page's tokens
 * behind, so it carries `theatre-tokens` and the faces itself — same trap the
 * toaster and the help panel fell into.
 */
/** The same hydration guard the marquee itself uses: false on the server, true
 *  once the client has taken over, with no state set inside an effect. There is
 *  no document.body to portal into until then. */
const NEVER_CHANGES = () => () => {};

export function CallboardDock() {
  const mounted = useSyncExternalStore(NEVER_CHANGES, () => true, () => false);
  if (!mounted) return null;

  return createPortal(
    <div className={`t-marquee-dock theatre-tokens ${theatreFontVars}`}>
      <CallboardMarquee />
    </div>,
    document.body,
  );
}
