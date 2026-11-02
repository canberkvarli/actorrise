"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useShareActivity } from "@/hooks/useCommunityFeed";
import { useT } from "@/lib/i18n";

/**
 * Callboard visibility, surfaced on the profile.
 *
 * The opt-out already existed, but only as a small text link inside the
 * callboard itself, so an actor who never opened that page had no way to know
 * their activity was public or to turn it off. Settings that affect what other
 * people can see belong where people look for settings.
 *
 * Reads and writes the same `users.share_activity` flag as the in-feed control
 * (shared hook, shared query key), so the two stay in sync automatically.
 */
export function ProfilePrivacyCard() {
  const { shareActivity, isLoading, setShareActivity } = useShareActivity();
  const on = shareActivity !== false;
  const t = useT();

  return (
    /* The last card on the page, and the only box left once the form became a
       document. It is a headed block like the rest now. */
    <section className="t-build mt-12">
      <h2 className="t-build__head">
        <span>{t("appAccountPrivacy.head")}</span>
      </h2>

      <div className="mt-4 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Label
              htmlFor="share-activity"
              className="text-sm font-medium text-foreground"
            >
              {t("appAccountPrivacy.label")}
            </Label>
            <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-muted-foreground">
              {t("appAccountPrivacy.body")}
            </p>
            {!isLoading && !on && (
              <p className="mt-2 text-xs text-muted-foreground/70">
                {t("appAccountPrivacy.hidden")}
              </p>
            )}
          </div>

          <Switch
            id="share-activity"
            checked={on}
            disabled={isLoading}
            onCheckedChange={(next) => setShareActivity(next)}
            aria-label={t("appAccountPrivacy.label")}
          />
      </div>
    </section>
  );
}
