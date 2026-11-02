"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import Link from "next/link";
import { useEffect } from "react";
import { PlusOffer } from "@/components/billing/PlusOffer";
import { useSubscription } from "@/hooks/useSubscription";
import { useT } from "@/lib/i18n";
import { useTrialText } from "@/components/billing/trialText";
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

/** Pro's price, as the pricing page quotes it. Figures, not words. */
const PRO_MONTHLY = "$24";
const PRO_ANNUAL = "$199";

const PRO_BENEFITS = ["appAccountUpgrade.proBenefit1", "appAccountUpgrade.proBenefit2"] as const;

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
  const words = useTrialText();
  const t = useT();

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
        <p className="t-modal__dir">{t("appAccountUpgrade.direction")}</p>
        {isPlus ? (
          <>
            <DialogTitle className="t-modal__title">{t("appAccountUpgrade.proTitle")}</DialogTitle>
            <DialogDescription className="t-modal__body">
              {message || t("appAccountUpgrade.proBody")}
            </DialogDescription>
            <p className="t-modal__price">
              {PRO_MONTHLY}
              <span className="t-modal__price-note">
                {t("appAccountUpgrade.proPriceNote", { annual: PRO_ANNUAL })}
              </span>
            </p>
            <ul className="t-modal__list">
              {PRO_BENEFITS.map((benefit) => (
                <li key={benefit} className="t-modal__item">
                  {t(benefit)}
                </li>
              ))}
            </ul>
            <div className="t-modal__foot">
              <Link
                className="t-modal__cta"
                onClick={() => trackPaywallCtaClicked(feature, "wall", currentTier)}
                href={`/checkout?tier=pro&period=monthly&from=${encodeURIComponent(feature)}`}
              >
                {t("appAccountUpgrade.moveToPro")}
              </Link>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} className="t-plus__dismiss">
              {t("appAccountUpgrade.notNow")}
            </button>
          </>
        ) : (
          <>
            <DialogTitle className="t-modal__title">
              {words.tasted ? words.overTitle : t("appAccountUpgrade.plusTitle")}
            </DialogTitle>
            <DialogDescription className="t-modal__body">
              {message || words.overBody || t("appAccountUpgrade.plusBody")}
            </DialogDescription>
            <PlusOffer
              feature={feature}
              lead={lead}
              onDismiss={() => onOpenChange(false)}
              dismissLabel={t("appAccountUpgrade.notNow")}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
