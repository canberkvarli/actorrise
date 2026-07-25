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
          {/* the ghost light — simply fades in, holds, and fades out, in place */}
          <motion.div
            className="h-5 w-5 rounded-full bg-[#ffdca8]"
            style={{ boxShadow: "0 0 46px 16px rgba(255,190,110,0.85)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.85, times: [0, 0.35, 0.7, 1], ease: "easeInOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
