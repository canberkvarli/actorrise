"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconSparkles } from "@tabler/icons-react";
import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";
import { trackUpgradeModalViewed } from "@/lib/analytics";

interface MonologuePaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the copy so the same modal fits any wall (rehearsals, search, ...). */
  title?: string;
  description?: string;
  /**
   * Which wall opened this. Required for analytics: the same modal serves the
   * monthly rehearsal cap and the search cap, and those are different problems
   * with different answers.
   */
  feature?: string;
}

const PLUS_BENEFITS = [
  "Unlimited monologue rehearsals",
  "Unlimited AI searches",
  "30 ScenePartner scenes/month",
  "AI voice with expressive delivery",
];

// No counts. The free cap moved twice in one week and copy that names a number
// goes stale silently.
const DEFAULT_TITLE = "Keep going";
const DEFAULT_DESCRIPTION =
  "That's your free rehearsals for this month. Plus takes the cap off, and lets you bring your own sides in too. Two weeks free, card on file, cancel before it renews.";

/**
 * Shown when a free user hits a monologue-side wall. Leads with continuing
 * rather than with what was taken away, because the actor is mid-piece and the
 * only thing they wanted was one more run.
 *
 * This modal was invisible until 2026-08-16: it fired no analytics at all, while
 * upgrade_modal_viewed (which only UpgradeModal sends) read zero. Meanwhile the
 * database showed 6 to 10 free users a month pinned at exactly the session cap.
 * The most-hit wall in the product was the one nobody could see.
 */
export function MonologuePaywallModal({
  open,
  onOpenChange,
  title,
  description,
  feature = "monologue_rehearsal",
}: MonologuePaywallModalProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";

  useEffect(() => {
    if (!open) return;
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [open, feature, currentTier]);

  // ?from= so begin_checkout can attribute the conversion to THIS wall. Without
  // it entry_point falls back to document.referrer and every wall looks alike.
  const href = `/checkout?tier=plus&period=monthly&trial=1&from=${feature}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? DEFAULT_TITLE}</DialogTitle>
          <DialogDescription>{description ?? DEFAULT_DESCRIPTION}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <ul className="space-y-1.5">
            {PLUS_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconSparkles className="h-3 w-3 flex-shrink-0 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Maybe later
          </Button>
          <Button asChild className="flex-1">
            {/* begin_checkout is deliberately NOT fired here. The checkout page
                already sends it, reading entry_point from ?from=, and firing in
                both places would double every conversion in the funnel. */}
            <Link href={href}>Start 2 weeks free</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
