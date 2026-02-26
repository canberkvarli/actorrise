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
    description: "Perfect for exploring ActorRise",
    monthly_price_cents: 0,
    annual_price_cents: 0,
    features: {
      ai_searches_per_month: 10,
      bookmarks_limit: 5,
      recommendations: false,
      download_formats: ["txt"],
      priority_support: false,
      scene_partner_scripts: 3,
      scene_partner_sessions: 1,
      scene_partner_trial_only: true,
    },
    sort_order: 0,
  },
  {
    id: 2,
    name: "plus",
    display_name: "Plus",
    description: "For working actors and students",
    monthly_price_cents: 1200,
    annual_price_cents: 9900,
    features: {
      ai_searches_per_month: 150,
      bookmarks_limit: -1,
      recommendations: true,
      download_formats: ["txt", "pdf"],
      priority_support: true,
      scene_partner_scripts: 10,
      scene_partner_sessions: 30,
    },
    sort_order: 1,
  },
  {
    id: 3,
    name: "unlimited",
    display_name: "Unlimited",
    description: "For professionals, coaches, and serious actors",
    monthly_price_cents: 3900,
    annual_price_cents: 32400,
    features: {
      ai_searches_per_month: -1,
      bookmarks_limit: -1,
      recommendations: true,
      download_formats: ["txt", "pdf"],
      priority_support: true,
      scene_partner_scripts: -1,
      scene_partner_sessions: 100,
      advanced_analytics: true,
      collections: true,
      collaboration: true,
      white_label_export: true,
    },
    sort_order: 2,
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
  });
}
