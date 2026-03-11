"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

/**
 * Sticky CTA button that appears at bottom of screen on mobile after scrolling past hero.
 * Provides persistent conversion opportunity for mobile users (83% of traffic).
 */
export function LandingStickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 600px (past hero section)
      setVisible(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Check initial position
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        >
          <div className="bg-background/95 backdrop-blur-sm border-t border-border shadow-lg p-4">
            <div className="flex gap-2">
              <Button asChild size="lg" className="flex-1 h-14 text-base font-semibold">
                <Link href="/my-scripts">Start rehearsing</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="flex-1 h-14 text-base">
                <Link href="/search">Find a piece</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
