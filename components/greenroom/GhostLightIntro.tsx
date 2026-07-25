"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GhostLight } from "@/components/brand/GhostLight";

/**
 * Ghost-light entrance for the Green Room. Rendered in a PORTAL to document.body
 * so its fixed overlay is truly viewport-fixed (a `fixed` element inside the page
 * transition's transformed container would otherwise gain a second scrollbar and
 * mis-position). An opaque cover holds while the page loads unseen; once `ready`
 * (or a fallback timeout) the brand GhostLight fades in/out in place, then lifts.
 */
export function GhostLightIntro({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [lit, setLit] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => setMounted(true), []);

  // Light the bulb when the page is ready — or after a fallback so a slow load
  // can never leave the cover stuck up.
  useEffect(() => {
    if (reduce || lit) return;
    if (ready) {
      setLit(true);
      return;
    }
    const t = setTimeout(() => setLit(true), 1200);
    return () => clearTimeout(t);
  }, [ready, lit, reduce]);

  useEffect(() => {
    if (!lit) return;
    const t = setTimeout(() => setDone(true), 1400);
    return () => clearTimeout(t);
  }, [lit]);

  if (reduce || !mounted) return null;

  return createPortal(
    <AnimatePresence>
      {!done && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#0b0806]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
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
    </AnimatePresence>,
    document.body
  );
}
