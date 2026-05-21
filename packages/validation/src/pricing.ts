import { z } from "zod";

/**
 * Subscription tiers. Mirrors the four-tier structure used on both web
 * (Stripe products) and mobile (Apple IAP via RevenueCat). The `free`
 * tier is the signed-in-no-subscription state — no IAP product attached.
 */
export const SubscriptionTier = z.enum(["free", "solo", "plus", "pro"]);
export type SubscriptionTier = z.infer<typeof SubscriptionTier>;

export const PAID_TIERS = ["solo", "plus", "pro"] as const satisfies readonly Exclude<
  SubscriptionTier,
  "free"
>[];

export const TIER_PRICE_USD: Record<SubscriptionTier, number> = {
  free: 0,
  solo: 7,
  plus: 12,
  pro: 24,
};

/**
 * RevenueCat product IDs (iOS Apple IAP). Must match the products created
 * in App Store Connect and registered in the RevenueCat dashboard.
 */
export const IOS_PRODUCT_IDS: Record<Exclude<SubscriptionTier, "free">, string> = {
  solo: "com.actorrise.app.solo_monthly",
  plus: "com.actorrise.app.plus_monthly",
  pro: "com.actorrise.app.pro_monthly",
};
