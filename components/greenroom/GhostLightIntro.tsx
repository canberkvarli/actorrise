"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GhostLight } from "@/components/brand/GhostLight";

/**
 * Ghost-light entrance for the Green Room. An opaque cover holds from mount so
 * the page loads UNSEEN behind it; once the page is `ready`, the brand GhostLight
 * (warm --glow, landing's flicker) fades in and out IN PLACE, then the cover
 * lifts to reveal the settled room. Skipped for reduced motion.
 */
export function GhostLightIntro({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(false); // opaque cover, client-only
  const [lit, setLit] = useState(false); // light sequence started
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!reduce) setShow(true);
  }, [reduce]);

  // Only start the light once the page behind is ready, so it never plays over a
  // still-loading (shifting) layout.
  useEffect(() => {
    if (show && ready && !lit) {
      setLit(true);
      const t = setTimeout(() => setDone(true), 1400);
      return () => clearTimeout(t);
    }
  }, [show, ready, lit]);

  if (reduce || !show || done) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b0806]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          {lit && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.4, times: [0, 0.3, 0.72, 1], ease: "easeInOut" }}
            >
              <GhostLight size="lg" />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
