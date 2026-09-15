"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
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
      {/* theatre-tokens and the faces ride on the dialog itself: Radix portals
          to document.body, so it lands outside every scoped wrapper and the
          --t-* vars would resolve to nothing. */}
      <DialogContent
        className={`t-modal theatre-tokens ${theatreFontVars} max-w-[26rem] border-0 p-7`}
      >
        <p className="t-modal__dir">(the house is still open.)</p>
        <DialogTitle className="t-modal__title">{title ?? DEFAULT_TITLE}</DialogTitle>
        <DialogDescription className="t-modal__body">
          {description ?? DEFAULT_DESCRIPTION}
        </DialogDescription>

        <ul className="t-modal__list">
          {PLUS_BENEFITS.map((benefit) => (
            <li key={benefit} className="t-modal__item">
              {benefit}
            </li>
          ))}
        </ul>

        <div className="t-modal__foot">
          {/* begin_checkout is deliberately NOT fired here. The checkout page
              already sends it, reading entry_point from ?from=, and firing in
              both places would double every conversion in the funnel. */}
          <Link href={href} className="t-modal__cta">
            Start 2 weeks free
          </Link>
          <button type="button" onClick={() => onOpenChange(false)} className="t-modal__quiet">
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
