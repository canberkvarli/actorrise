"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { useProfileStats } from "@/hooks/useDashboardData";
import { useAuth } from "@/lib/auth";
import { IconX, IconArrowRight } from "@tabler/icons-react";

const DISMISS_KEY = "actorrise.practice.profileCardDismissed.v1";

/**
 * Small dismissible inline card. Renders only when:
 *   - profile stats have loaded
 *   - completion < 100%
 *   - user has NOT dismissed it (localStorage)
 *
 * Mirrors the percentage calculation pattern from the dashboard's profile
 * progress row by consuming `useProfileStats().completion_percentage`.
 */
export function ProfileCompletionCard() {
  const { isDemoUser } = useAuth();
  const { data: stats } = useProfileStats(isDemoUser);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    // useEffect only runs on the client; safe to read localStorage directly.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage after hydration only
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "true");
  }, []);

  // Don't render until we know the dismissed state to avoid a flicker.
  if (dismissed === null) return null;
  if (dismissed) return null;
  if (!stats) return null;
  if (stats.completion_percentage >= 100) return null;

  const percent = Math.max(0, Math.min(100, stats.completion_percentage));

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "true");
    }
    setDismissed(true);
  };

  return (
    <div className="relative rounded-lg border border-border/70 bg-card/60 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 pr-7">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            Your profile is {percent}% complete.
          </p>
          <div className="mt-2">
            <Progress value={percent} className="h-1.5 bg-border" />
          </div>
        </div>
        <Link
          href="/profile"
          className="group inline-flex items-center gap-1 text-sm font-medium text-[#CB4B00] hover:text-[#B03000] transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          Complete your profile
          <IconArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss profile completion card"
        className="absolute top-2 right-2 inline-flex items-center justify-center rounded-md h-7 w-7 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}

export default ProfileCompletionCard;
