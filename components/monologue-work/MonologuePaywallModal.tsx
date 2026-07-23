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
  /** Override the copy so the same modal fits any wall (rehearsals, search, ...). */
  title?: string;
  description?: string;
}

const PLUS_BENEFITS = [
  "Unlimited monologue rehearsals",
  "Unlimited AI searches",
  "30 ScenePartner scenes/month",
  "AI voice with expressive delivery",
];

const DEFAULT_TITLE = "You've used your free runs";
const DEFAULT_DESCRIPTION =
  "Keep going with 2 weeks of Plus, free. No charge now, card on file, cancel anytime.";

/**
 * Shown when a free user hits their monthly monologue-work cap. Leads with the
 * free trial (2 weeks of Plus, card on file) rather than a plain upsell.
 * Deep-links to the trial checkout.
 */
export function MonologuePaywallModal({ open, onOpenChange, title, description }: MonologuePaywallModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? DEFAULT_TITLE}</DialogTitle>
          <DialogDescription>{description ?? DEFAULT_DESCRIPTION}</DialogDescription>
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
            <Link href="/checkout?tier=plus&period=monthly&trial=1">
              Start 2 weeks free
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
