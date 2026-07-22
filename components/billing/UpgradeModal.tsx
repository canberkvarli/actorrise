"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconRocket, IconSparkles } from "@tabler/icons-react";
import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  message?: string;
}

const PLUS_BENEFITS = [
  "Unlimited AI searches",
  "Up to 5 script uploads",
  "30 ScenePartner sessions/month",
  "AI Voice with expressive delivery",
];

const PRO_BENEFITS = [
  "Unlimited AI searches",
  "Unlimited script uploads",
  "Unlimited ScenePartner sessions",
  "AI Voice with expressive delivery",
  "Priority support",
];

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  message,
}: UpgradeModalProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";

  // If already on Plus, suggest Pro. Otherwise suggest Plus.
  const isPlus = currentTier === "plus";
  const targetTier = isPlus ? "pro" : "plus";
  const targetLabel = isPlus ? "Pro" : "Plus";
  const price = isPlus ? "$24" : "$12";
  const yearlyNote = isPlus ? "or $199/year (save 31%)" : "or $99/year (save 31%)";
  const benefits = isPlus ? PRO_BENEFITS : PLUS_BENEFITS;
  // Free users can start a 14-day Plus trial ($0 today). Pro upsell stays paid.
  const canTrial = !isPlus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <IconRocket className="h-5 w-5 text-primary" />
            <DialogTitle>Upgrade to {targetLabel}</DialogTitle>
          </div>
          <DialogDescription>
            {message || `${feature} is not available on your current plan.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {canTrial ? (
            <div>
              <span className="text-2xl font-bold">2 weeks free</span>
              <p className="text-xs text-muted-foreground mt-1">
                $0 today. Then $12/month, cancel anytime before it renews.
              </p>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{price}</span>
              <span className="text-sm text-muted-foreground">/month</span>
              <span className="text-xs text-muted-foreground ml-1">
                {yearlyNote}
              </span>
            </div>
          )}
          <ul className="space-y-1.5">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="text-sm text-muted-foreground flex items-center gap-2"
              >
                <IconSparkles className="h-3 w-3 text-primary flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Maybe Later
          </Button>
          <Button asChild className="flex-1">
            <Link
              href={
                canTrial
                  ? `/checkout?tier=plus&period=monthly&trial=1`
                  : `/checkout?tier=${targetTier}&period=monthly`
              }
            >
              {canTrial ? "Start 2 weeks free" : "Upgrade Now"}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
