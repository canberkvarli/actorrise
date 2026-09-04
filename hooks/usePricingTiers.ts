"use client";

import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/api";

export interface PricingTier {
  id: number;
  name: string;
  display_name: string;
  description: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  features: {
    ai_searches_per_month: number;
    monologue_sessions?: number;
    bookmarks_limit: number;
    recommendations: boolean;
    scene_partner_scripts?: number;
    scene_partner_sessions?: number;
    scene_partner_trial_only?: boolean;
    craft_coach_sessions?: number;
    download_formats: string[];
    priority_support: boolean;
    advanced_analytics?: boolean;
    collections?: boolean;
    collaboration?: boolean;
    white_label_export?: boolean;
  };
  sort_order: number;
}

/** Fallback when API is unreachable */
export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  {
    id: 1,
    name: "free",
    display_name: "Free",
    description: "Explore and try it out",
    monthly_price_cents: 0,
    annual_price_cents: 0,
    features: {
      ai_searches_per_month: 10,
      monologue_sessions: 3,
      bookmarks_limit: 10,
      recommendations: true,
      download_formats: ["pdf", "docx"],
      priority_support: false,
      scene_partner_scripts: 1,
      scene_partner_sessions: 3,
      scene_partner_trial_only: true,
    },
    sort_order: 0,
  },
  /* Solo, $7, is retired as of 2026-09-04 and deliberately not listed here.
     It sat on the pricing page with working Stripe prices from 2026-03-15 and
     sold nothing in six months, which the feature row explains on its own: its
     ScenePartner allowance was identical to Free, so seven dollars bought
     nothing for the part of the product people come for. Nobody was subscribed,
     so retiring it moved no one's plan.
     This array is the fallback the pricing page renders when the API is slow or
     down, so leaving Solo in it would keep selling a tier that no longer exists
     at exactly the moments we are least able to notice. */
  {
    id: 3,
    name: "plus",
    display_name: "Plus",
    description: "For working actors and students",
    monthly_price_cents: 1200,
    annual_price_cents: 9900,
    features: {
      ai_searches_per_month: -1,
      monologue_sessions: -1,
      bookmarks_limit: -1,
      recommendations: true,
      download_formats: ["pdf", "docx"],
      priority_support: false,
      scene_partner_scripts: 5,
      /* Plus rehearses without a ceiling as of 2026-09-04. The cap was 30 in the
         database and 10 here — a third number for the same limit, which is how
         you know neither was measured. The heaviest Plus account across the
         whole base has run 11 sessions, so the only person the cap could ever
         stop is the one rehearsing hardest, which is the customer you least want
         to stop. */
      scene_partner_sessions: -1,
    },
    sort_order: 2,
  },
  {
    id: 4,
    name: "pro",
    display_name: "Pro",
    description: "For professionals and coaches",
    monthly_price_cents: 2400,
    annual_price_cents: 19900,
    features: {
      ai_searches_per_month: -1,
      monologue_sessions: -1,
      bookmarks_limit: -1,
      recommendations: true,
      download_formats: ["pdf", "docx"],
      priority_support: false,
      scene_partner_scripts: -1,
      scene_partner_sessions: -1,
    },
    sort_order: 3,
  },
];

const QUERY_KEY = ["pricing", "tiers"] as const;
const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes – pricing rarely changes

async function fetchPricingTiers(): Promise<PricingTier[]> {
  const apiUrl = typeof window !== "undefined" ? API_URL : "";
  const url = apiUrl ? `${apiUrl}/api/pricing/tiers` : "";
  if (!url) return DEFAULT_PRICING_TIERS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: PricingTier[] = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : DEFAULT_PRICING_TIERS;
  } catch {
    return DEFAULT_PRICING_TIERS;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Pricing tiers with React Query cache. Cached for 10 minutes and persisted
 * in sessionStorage, so /pricing and landing pricing section load instantly
 * on revisit or refresh.
 */
export function usePricingTiers() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPricingTiers,
    staleTime: STALE_TIME_MS,
    initialData: DEFAULT_PRICING_TIERS,
  });
}
