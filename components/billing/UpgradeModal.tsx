"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import Link from "next/link";
import { useEffect } from "react";
import { PlusOffer } from "@/components/billing/PlusOffer";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { trackPaywallCtaClicked, trackUpgradeModalViewed } from "@/lib/analytics";
import type { WallKind } from "@/lib/paywall/offer";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  message?: string;
  /** What they ran into, so the list of what Plus buys leads with it. */
  lead?: WallKind;
}

const PRO_BENEFITS = [
  "Unlimited script uploads",
  "Everything in Plus, with no monthly cap on sides",
];

/**
 * The wall for the ScenePartner side: script uploads, the community shelf,
 * hosting a Green Room. A free actor gets the same offer as every other hard
 * wall (components/billing/PlusOffer.tsx). Someone already on Plus who hits
 * the upload cap is shown Pro, which has no trial.
 */
export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  message,
  lead = "sides",
}: UpgradeModalProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";
  const words = useTrialWords();

  // Fires once per open, keyed on the gate that triggered it. `feature` is the
  // whole point: it answers which wall actually makes an actor reach for a card,
  // which is what decides where the next gate goes.
  useEffect(() => {
    if (!open) return;
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [open, feature, currentTier]);

  const isPlus = currentTier === "plus";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* theatre-tokens and the faces on the dialog itself — Radix portals to
          document.body, outside every scoped wrapper. */}
      <DialogContent
        className={`t-modal theatre-tokens ${theatreFontVars} max-h-[92dvh] max-w-[26rem] overflow-y-auto border-0 p-7`}
      >
        <p className="t-modal__dir">(one more seat in the house.)</p>
        {isPlus ? (
          <>
            <DialogTitle className="t-modal__title">That&rsquo;s a Pro thing.</DialogTitle>
            <DialogDescription className="t-modal__body">
              {message || "Pro takes the cap off your sides."}
            </DialogDescription>
            <p className="t-modal__price">
              $24
              <span className="t-modal__price-note">a month, or $199 a year</span>
            </p>
            <ul className="t-modal__list">
              {PRO_BENEFITS.map((benefit) => (
                <li key={benefit} className="t-modal__item">
                  {benefit}
                </li>
              ))}
            </ul>
            <div className="t-modal__foot">
              <Link
                className="t-modal__cta"
                onClick={() => trackPaywallCtaClicked(feature, "wall", currentTier)}
                href={`/checkout?tier=pro&period=monthly&from=${encodeURIComponent(feature)}`}
              >
                Move to Pro
              </Link>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className="t-plus__dismiss">
              not now
            </button>
          </>
        ) : (
          <>
            <DialogTitle className="t-modal__title">
              {words.tasted ? words.overTitle : "That one's on Plus."}
            </DialogTitle>
            <DialogDescription className="t-modal__body">
              {message || words.overBody || "Plus opens it, and the rest of the house with it."}
            </DialogDescription>
            <PlusOffer feature={feature} lead={lead} onDismiss={() => onOpenChange(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
