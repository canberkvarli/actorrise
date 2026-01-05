/**
 * SWR hooks for subscription and billing data with automatic caching.
 *
 * These hooks cache API responses in memory and automatically revalidate
 * when the user refocuses the tab or navigates between pages.
 */

import useSWR from "swr";
import api from "@/lib/api";

// Cache configuration
const SWR_CONFIG = {
  revalidateOnFocus: false, // Don't refetch when window regains focus
  revalidateOnReconnect: true, // Refetch when reconnecting to internet
  dedupingInterval: 60000, // 1 minute - prevent duplicate requests
  focusThrottleInterval: 120000, // 2 minutes - throttle focus revalidation
};

// Subscription data types
export interface SubscriptionData {
  tier_name: string;
  tier_display_name: string;
  status: string;
  billing_period: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface UsageLimits {
  ai_searches_used: number;
  ai_searches_limit: number;
  scene_partner_used: number;
  scene_partner_limit: number;
  craft_coach_used: number;
  craft_coach_limit: number;
}

export interface BillingHistoryItem {
  id: number;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  invoice_url: string | null;
  created_at: string;
}

/**
 * Fetch current user's subscription details.
 * Cached for 1 minute, automatically revalidates on reconnect.
 */
export function useSubscription() {
  const { data, error, isLoading, mutate } = useSWR<SubscriptionData>(
    "/api/subscriptions/me",
    async (url) => {
      const response = await api.get<SubscriptionData>(url);
      return response.data;
    },
    SWR_CONFIG
  );

  return {
    subscription: data,
    isLoading,
    isError: error,
    mutate, // Allows manual cache refresh
  };
}

/**
 * Fetch current usage and limits for the user.
 * Cached for 1 minute.
 */
export function useUsageLimits() {
  const { data, error, isLoading, mutate } = useSWR<UsageLimits>(
    "/api/subscriptions/usage",
    async (url) => {
      const response = await api.get<UsageLimits>(url);
      return response.data;
    },
    SWR_CONFIG
  );

  return {
    usage: data,
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Fetch billing history.
 * Cached for 1 minute.
 */
export function useBillingHistory() {
  const { data, error, isLoading, mutate } = useSWR<BillingHistoryItem[]>(
    "/api/subscriptions/billing-history",
    async (url) => {
      const response = await api.get<BillingHistoryItem[]>(url);
      return response.data;
    },
    SWR_CONFIG
  );

  return {
    history: data || [],
    isLoading,
    isError: error,
    mutate,
  };
}
