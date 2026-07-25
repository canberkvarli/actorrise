"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GhostLight } from "@/components/brand/GhostLight";

/**
 * Ghost-light entrance for the Green Room. Uses the same brand GhostLight as the
 * landing (warm --glow, its signature flicker), fading in and out IN PLACE, then
 * the room is revealed. Plays on every visit. Skipped for reduced motion.
 */
export function GhostLightIntro() {
  const reduce = useReducedMotion();
  // Client-only: SSR and first client render both produce null (no hydration
  // mismatch); the intro only begins after mount.
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reduce) return;
    setShow(true);
    const t = setTimeout(() => setDone(true), 1400);
    return () => clearTimeout(t);
  }, [reduce]);

  if (!show) return null;

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b0806]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeInOut" }}
        >
          {/* fades in, holds, fades out — no movement */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, times: [0, 0.3, 0.72, 1], ease: "easeInOut" }}
          >
            <GhostLight size="lg" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
