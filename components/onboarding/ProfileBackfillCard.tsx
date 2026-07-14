"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconX, IconSparkles } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import ProfileOnboardingFlow from "@/components/onboarding/ProfileOnboardingFlow";

const DISMISS_KEY = "arc.profileBackfillDismissed";

/**
 * Soft, dismissible invite for users who finished the legacy onboarding (which
 * captured nothing) to run the 5-tap profile flow. Not a gate — a corner card
 * that persists until they personalize or dismiss it. New users never see it
 * (they still have has_completed_onboarding === false).
 */
export default function ProfileBackfillCard() {
  const { user, loading } = useAuth();
  // Rendered with ssr:false, so localStorage is available at mount — read it via
  // lazy initial state (no effect, no flash).
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [flowOpen, setFlowOpen] = useState(false);

  const eligible =
    !loading &&
    !!user &&
    user.has_completed_onboarding === true &&
    user.has_completed_profile_onboarding === false;

  if (!eligible) return null;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <>
      <AnimatePresence>
        {!dismissed && !flowOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed bottom-4 right-4 z-40 w-[min(20rem,calc(100vw-2rem))] border border-border bg-card p-4 shadow-xl shadow-black/30"
          >
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4"
            >
              <IconX />
            </button>
            <div className="flex items-center gap-2 text-primary [&_svg]:size-4">
              <IconSparkles />
              <span className="text-xs font-medium uppercase tracking-wide">Make it yours</span>
            </div>
            <p className="mt-2 font-brand text-lg leading-tight text-foreground">
              Tune your results in 5 taps
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Tell me how you&apos;re cast and I&apos;ll surface monologues that actually fit you.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={() => setFlowOpen(true)} size="sm" className="rounded-full">
                Personalize
              </Button>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Not now
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {flowOpen && <ProfileOnboardingFlow variant="backfill" onClose={() => setFlowOpen(false)} />}
    </>
  );
}
