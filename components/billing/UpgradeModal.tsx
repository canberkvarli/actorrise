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
  "150 AI searches/month",
  "Up to 10 script uploads",
  "30 ScenePartner AI sessions/month",
  "AI Voice with expressive delivery",
];

const UNLIMITED_BENEFITS = [
  "Unlimited AI searches",
  "Unlimited script uploads",
  "100 ScenePartner AI sessions/month",
  "AI Voice with expressive delivery",
  "Advanced analytics & collections",
];

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  message,
}: UpgradeModalProps) {
  const { subscription } = useSubscription();
  const currentTier = subscription?.tier_name ?? "free";

  // If already on Plus, suggest Unlimited. Otherwise suggest Plus.
  const isPlus = currentTier === "plus";
  const targetTier = isPlus ? "unlimited" : "plus";
  const targetLabel = isPlus ? "Unlimited" : "Plus";
  const price = isPlus ? "$39" : "$12";
  const yearlyNote = isPlus ? "or $324/year (save 31%)" : "or $99/year (save 31%)";
  const benefits = isPlus ? UNLIMITED_BENEFITS : PLUS_BENEFITS;

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
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{price}</span>
            <span className="text-sm text-muted-foreground">/month</span>
            <span className="text-xs text-muted-foreground ml-1">
              {yearlyNote}
            </span>
          </div>
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
            <Link href={`/checkout?tier=${targetTier}&period=monthly`}>Upgrade Now</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
