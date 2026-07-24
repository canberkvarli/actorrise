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
    const t = setTimeout(() => setDone(true), 1650);
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
            animate={{ opacity: [0, 0.15, 0.05, 0.25, 0.4, 0.7] }}
            transition={{ duration: 1.2, times: [0, 0.15, 0.3, 0.5, 0.7, 1] }}
            style={{
              background:
                "radial-gradient(60% 50% at 50% 45%, rgba(203,75,0,0.35), transparent 70%)",
            }}
          />

          {/* the bulb */}
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0.12, 0.9, 0.35, 1, 0.7, 1] }}
            transition={{ duration: 1.15, times: [0, 0.08, 0.16, 0.3, 0.45, 0.62, 0.8, 1] }}
          >
            <motion.div
              className="h-4 w-4 rounded-full bg-[#ffdca8]"
              animate={{ boxShadow: [
                "0 0 6px 2px rgba(255,200,120,0.4)",
                "0 0 40px 14px rgba(255,190,110,0.85)",
              ] }}
              transition={{ duration: 1.15, ease: "easeIn" }}
            />
            <motion.p
              className="mt-8 font-brand text-2xl tracking-wide text-[#f3e7d2]"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 0.4, 0.9] }}
              transition={{ duration: 1.3, times: [0, 0.5, 0.75, 1] }}
            >
              The Green Room
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
