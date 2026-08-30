"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useShareActivity } from "@/hooks/useCommunityFeed";

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

  return (
    <Card className="mt-6">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold text-foreground">Privacy</h2>

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Label
              htmlFor="share-activity"
              className="text-sm font-medium text-foreground"
            >
              Show my activity on the callboard
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Other actors can see your first name, city, and photo next to
              pieces you read, save, or rehearse. What you type into search is
              never shown to anyone.
            </p>
            {!isLoading && !on && (
              <p className="mt-2 text-xs text-muted-foreground/70">
                You&rsquo;re hidden. Nothing you&rsquo;ve done shows on the
                callboard, including before you turned this off.
              </p>
            )}
          </div>

          <Switch
            id="share-activity"
            checked={on}
            disabled={isLoading}
            onCheckedChange={(next) => setShareActivity(next)}
            aria-label="Show my activity on the callboard"
          />
        </div>
      </CardContent>
    </Card>
  );
}
