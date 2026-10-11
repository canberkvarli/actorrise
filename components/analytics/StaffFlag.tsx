"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { setStaff } from "@/lib/gtag";

/**
 * Tells GA4 whether this browser belongs to staff, as the `staff` user
 * property, so reports can leave Canberk and the test accounts out the way
 * the admin dashboards already do (users.exclude_from_stats). Runs on every
 * change of the signed-in user, including sign-out, which sets it back to
 * "no". Renders nothing. Sits inside AuthProviderWrapper because it needs
 * the user; GoogleAnalytics itself sits outside it and only sends page views.
 */
export function StaffFlag() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    setStaff(!!(user?.exclude_from_stats || user?.is_moderator));
  }, [user?.id, user?.exclude_from_stats, user?.is_moderator, loading]);
  return null;
}
