"use client";

import { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { PlusOffer } from "@/components/billing/PlusOffer";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { trackUpgradeModalViewed } from "@/lib/analytics";
import type { WallKind } from "@/lib/paywall/offer";

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
  /** The small direction line above the title. */
  dir?: string;
  /** The quiet way out. */
  quietLabel?: string;
  /** What they ran into, so the list of what Plus buys leads with it. */
  lead?: WallKind;
}

// No counts. The free cap moved three times in two months and copy that names
// a number goes stale silently.
const DEFAULT_TITLE = "Those were your free runs.";
const DEFAULT_DESCRIPTION =
  "Plus lets you run this piece, and every other, as many times as it takes.";

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
  dir = "(the house is still open.)",
  quietLabel = "not now",
  lead = "rehearse",
}: MonologuePaywallModalProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";
  const words = useTrialWords();

  useEffect(() => {
    if (!open) return;
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [open, feature, currentTier]);

  // After a taste (or the reverse trial) the first thing to say is what they
  // had. A caller's own title is about a feature; the taste outranks it only
  // on the default rehearsal wall and the walls that pass none.
  const heading = title ?? (words.tasted ? words.overTitle : DEFAULT_TITLE);
  const body = description ?? (words.tasted ? words.overBody : DEFAULT_DESCRIPTION);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* theatre-tokens and the faces ride on the dialog itself: Radix portals
          to document.body, so it lands outside every scoped wrapper and the
          --t-* vars would resolve to nothing. */}
      <DialogContent
        className={`t-modal theatre-tokens ${theatreFontVars} max-h-[92dvh] max-w-[26rem] overflow-y-auto border-0 p-7`}
      >
        <p className="t-modal__dir">{dir}</p>
        <DialogTitle className="t-modal__title">{heading}</DialogTitle>
        <DialogDescription className="t-modal__body">{body}</DialogDescription>

        <PlusOffer
          feature={feature}
          lead={lead}
          onDismiss={() => onOpenChange(false)}
          dismissLabel={quietLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
