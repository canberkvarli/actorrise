"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SCRIPTS_FEATURE_ENABLED } from "@/lib/featureFlags";
import UnderConstructionScripts from "@/components/UnderConstructionScripts";

/**
 * Settings are now in a modal on the My Scripts page.
 * Redirect so old /my-scripts/settings links land on the list.
 */
export default function MyScriptsSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (SCRIPTS_FEATURE_ENABLED) {
      router.replace("/my-scripts");
    }
  }, [router]);

  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <p className="text-muted-foreground">Redirecting to My Scripts…</p>
    </div>
  );
}
