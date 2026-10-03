"use client";

import { SIGNUP_PENDING_KEY } from "@/lib/firstRun";

/**
 * The curtain, before React exists.
 *
 * `FirstRunCurtain` reads sessionStorage through `useSyncExternalStore`, whose
 * server snapshot must be `false` — the server cannot see a browser's storage.
 * So the HTML that arrives contains no curtain, the browser paints the page
 * underneath it, and only once hydration runs does the curtain drop. On a fast
 * phone that is the flash of the dashboard an actor sees a beat after signing
 * up, and no amount of work inside React can remove it: by the time React runs,
 * the paint has happened.
 *
 * This is the same trick a theme toggle uses to avoid a flash of the wrong
 * theme. A tiny script runs BEFORE first paint, reads the flag synchronously,
 * and marks the document. CSS keyed off that attribute covers the app with the
 * page colour. React then mounts, `FirstRunCurtain` takes over as the real
 * element with the real exit animation, and the attribute is removed.
 *
 * The attribute is removed by the curtain rather than by this script, because
 * only the curtain knows when onboarding is actually finished. The script's one
 * job is to make sure something is already covering the app in the first frame.
 *
 * `beforeInteractive` is deliberate: `afterInteractive` runs after hydration,
 * which is exactly the moment this exists to get in front of.
 */
export function FirstRunPaint() {
  // Inlined rather than a <Script>: Next's Script component cannot guarantee
  // placement before the first paint of a client-navigated route, and this has
  // to be in the markup itself.
  //
  // dangerouslySetInnerHTML is safe here and only here: every byte of this
  // string is a compile-time constant. The one interpolation is a module
  // constant passed through JSON.stringify, and nothing from a user, a URL, a
  // header or the database reaches it. Keep it that way — if this ever needs a
  // runtime value, it needs a different mechanism, not an escape.
  const js = `(function(){try{if(sessionStorage.getItem(${JSON.stringify(
    SIGNUP_PENDING_KEY,
  )})==="1"){document.documentElement.setAttribute("data-firstrun","1")}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
