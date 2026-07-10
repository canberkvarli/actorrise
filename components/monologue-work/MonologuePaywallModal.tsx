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
import { IconSparkles } from "@tabler/icons-react";
import Link from "next/link";

interface MonologuePaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLUS_BENEFITS = [
  "30 monologue-work sessions/month",
  "30 ScenePartner sessions/month",
  "Unlimited AI searches",
  "AI Voice with expressive delivery",
];

/**
 * Shown when a free user hits their monthly monologue-work cap. Leads with the
 * founder offer (FOUNDER3 = 3 months of Plus free, card on file) rather than a
 * plain upsell. Deep-links to checkout with the promo pre-applied.
 */
export function MonologuePaywallModal({ open, onOpenChange }: MonologuePaywallModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>You&apos;ve used your free runs this month</DialogTitle>
          <DialogDescription>
            Keep working your monologues with 3 months of Plus, free. No charge now,
            card on file, cancel anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <ul className="space-y-1.5">
            {PLUS_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconSparkles className="h-3 w-3 flex-shrink-0 text-[#CB4B00]" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Maybe later
          </Button>
          <Button asChild className="flex-1">
            <Link href="/checkout?tier=plus&period=monthly&promo=FOUNDER3">
              Get 3 months free
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
