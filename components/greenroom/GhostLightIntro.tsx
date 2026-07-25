"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Ghost-light entrance for the Green Room. A theatre's ghost light is the bare
 * bulb left burning on an empty stage — here it stutters to life, then the
 * lights come up on the room. Plays on every visit. Skipped for reduced motion.
 */
export function GhostLightIntro() {
  const reduce = useReducedMotion();
  // Client-only: SSR and the first client render both produce null (no hydration
  // mismatch); the intro only begins after mount.
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reduce) return;
    setShow(true);
    // Cinematic: the light fades up, holds, fades out, then the room is revealed.
    // Long enough for the page behind the (opaque) cover to finish loading, so it
    // never reads as content popping in top-down.
    const t = setTimeout(() => setDone(true), 1300);
    return () => clearTimeout(t);
  }, [reduce]);

  if (!show) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[#0b0806]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* the ghost light — a warm-white glow that fades in, holds, and fades
              out, in place (no movement) */}
          <motion.div
            className="h-5 w-5 rounded-full bg-[#fff2e6]"
            style={{ boxShadow: "0 0 48px 18px rgba(255,178,128,0.8)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.25, times: [0, 0.28, 0.72, 1], ease: "easeInOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
