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
    // Snappy: a quick flicker-to-light, then out. Long enough to feel like the
    // lights coming up, short enough to never read as a wait.
    const t = setTimeout(() => setDone(true), 850);
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
          {/* warm wash that grows as the bulb powers up */}
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.2, 0.08, 0.4, 0.7] }}
            transition={{ duration: 0.65, times: [0, 0.2, 0.4, 0.7, 1] }}
            style={{
              background:
                "radial-gradient(60% 50% at 50% 45%, rgba(203,75,0,0.35), transparent 70%)",
            }}
          />

          {/* the bulb flickering to life */}
          <motion.div
            className="h-4 w-4 rounded-full bg-[#ffdca8]"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.8, 0.15, 1, 0.4, 1],
              boxShadow: [
                "0 0 6px 2px rgba(255,200,120,0.4)",
                "0 0 44px 16px rgba(255,190,110,0.9)",
              ],
            }}
            transition={{ duration: 0.6, times: [0, 0.12, 0.24, 0.45, 0.6, 1], ease: "easeIn" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
