"use client";

import { useState } from "react";
import Link from "next/link";

import { ClassRoute } from "@/components/billing/ClassRoute";
import { EarnSecondWeek } from "@/components/billing/EarnSecondWeek";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialWords } from "@/hooks/useTrialWords";
import { trackPaywallCtaClicked } from "@/lib/analytics";
import { plusGains, plusOffer, type WallKind } from "@/lib/paywall/offer";

interface PlusOfferProps {
  /** The gate, for ?from= and analytics. */
  feature: string;
  /** What they ran into: the list leads with it. */
  lead: WallKind;
  /** The quiet way out. Left off on an inline wall, which has nothing to close. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * The offer every hard wall makes, one block shared by the inline read wall,
 * the read gate card and the two dialogs. It is the stub of the /checkout
 * ticket: the same printed rows, label, dotted leader, figure, so the actor
 * who taps it lands on the same account set larger.
 *
 * One plan, by the year, priced by the month. The day the card is charged is
 * printed, because no email goes out before it (lib/paywall/offer.ts).
 *
 * Carries no theatre tokens of its own: every host already binds them.
 */
export function PlusOffer({ feature, lead, onDismiss, dismissLabel = "not now" }: PlusOfferProps) {
  const { subscription } = useSubscription();
  const tier = subscription?.tier_name ?? "free";
  const words = useTrialWords();
  // The date is read once per mount, so the printed day does not move under
  // a wall left open past midnight.
  const [now] = useState(() => new Date());
  const offer = plusOffer(feature, words, now);

  return (
    <div className="t-plus">
      <ul className="t-modal__list">
        {plusGains(lead).map((gain) => (
          <li key={gain} className="t-modal__item">
            {gain}
          </li>
        ))}
      </ul>

      <p className="t-plus__price">
        <span className="t-plus__figure">{offer.perMonth}</span>
        <span className="t-plus__per">{offer.perMonthNote}</span>
      </p>

      <div className="t-plus__rows">
        {offer.rows.map(([label, figure]) => (
          <div key={label} className="t-ticket__row">
            <span className="t-ticket__label" suppressHydrationWarning>
              {label}
            </span>
            <span className="t-ticket__lead" aria-hidden />
            <span className="t-ticket__val">{figure}</span>
          </div>
        ))}
      </div>

      <div className="t-plus__foot">
        {/* begin_checkout is NOT fired here: the checkout page sends it,
            reading entry_point from ?from=. Both would double every count. */}
        <Link
          href={offer.href}
          className="t-wall__cta"
          onClick={() => trackPaywallCtaClicked(feature, "wall", tier, "annual")}
        >
          {offer.cta}
        </Link>
        <Link
          href={offer.monthlyHref}
          className="t-wall__quiet"
          onClick={() => trackPaywallCtaClicked(feature, "wall", tier, "monthly")}
        >
          {offer.monthlyLabel}
        </Link>
      </div>

      <p className="t-plus__fine" suppressHydrationWarning>
        {offer.fine} <EarnSecondWeek />
      </p>
      <ClassRoute className="t-plus__fine" />

      {onDismiss && (
        <button type="button" onClick={onDismiss} className="t-plus__dismiss">
          {dismissLabel}
        </button>
      )}
    </div>
  );
}
