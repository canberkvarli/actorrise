"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import Link from "next/link";
import { useEffect } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { trackUpgradeModalViewed } from "@/lib/analytics";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  message?: string;
}

const PLUS_BENEFITS = [
  "Unlimited AI searches",
  "Up to 5 script uploads",
  "30 ScenePartner sessions/month",
  "AI Voice with expressive delivery",
];

const PRO_BENEFITS = [
  "Unlimited AI searches",
  "Unlimited script uploads",
  "Unlimited ScenePartner sessions",
  "AI Voice with expressive delivery",
  "Priority support",
];

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  message,
}: UpgradeModalProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";

  // Fires once per open, keyed on the gate that triggered it. `feature` is the
  // whole point: it answers which wall actually makes an actor reach for a card,
  // which is what decides where the next gate goes.
  useEffect(() => {
    if (!open) return;
    trackUpgradeModalViewed({ feature, tier_current: currentTier });
  }, [open, feature, currentTier]);

  // If already on Plus, suggest Pro. Otherwise suggest Plus.
  const isPlus = currentTier === "plus";
  const targetTier = isPlus ? "pro" : "plus";
  const targetLabel = isPlus ? "Pro" : "Plus";
  const price = isPlus ? "$24" : "$12";
  const yearlyNote = isPlus ? "or $199/year (save 31%)" : "or $99/year (save 31%)";
  const benefits = isPlus ? PRO_BENEFITS : PLUS_BENEFITS;
  // Free users can start a 14-day Plus trial ($0 today). Pro upsell stays paid.
  const canTrial = !isPlus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* theatre-tokens and the faces on the dialog itself — Radix portals to
          document.body, outside every scoped wrapper. */}
      <DialogContent
        className={`t-modal theatre-tokens ${theatreFontVars} max-w-[26rem] border-0 p-7`}
      >
        <p className="t-modal__dir">(one more seat in the house.)</p>
        <DialogTitle className="t-modal__title">Upgrade to {targetLabel}</DialogTitle>
        <DialogDescription className="t-modal__body">
          {message || `${feature} is not available on your current plan.`}
        </DialogDescription>

        <p className="t-modal__price">
          {canTrial ? (
            <>
              2 weeks free
              <span className="t-modal__price-note">
                $0 today. Then $12/month, cancel anytime before it renews.
              </span>
            </>
          ) : (
            <>
              {price}
              <span className="t-modal__price-note">per month · {yearlyNote}</span>
            </>
          )}
        </p>

        <ul className="t-modal__list">
          {benefits.map((benefit) => (
            <li key={benefit} className="t-modal__item">
              {benefit}
            </li>
          ))}
        </ul>

        <div className="t-modal__foot">
          <Link
            className="t-modal__cta"
            href={
              // ?from= carries the gate through to begin_checkout. Without it
              // entry_point falls back to document.referrer and every wall in
              // the app reports as the same undifferentiated "direct".
              canTrial
                ? `/checkout?tier=plus&period=monthly&trial=1&from=${encodeURIComponent(feature)}`
                : `/checkout?tier=${targetTier}&period=monthly&from=${encodeURIComponent(feature)}`
            }
          >
            {canTrial ? "Start 2 weeks free" : "Upgrade now"}
          </Link>
          <button type="button" onClick={() => onOpenChange(false)} className="t-modal__quiet">
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
