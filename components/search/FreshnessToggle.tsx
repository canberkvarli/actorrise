"use client";

import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";

interface FreshnessToggleProps {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS = [
  { label: "Fresh picks", value: 0.3, plus: true },
  { label: "Popular too", value: 0.7, plus: true },
  { label: "Show all", value: 1.0, plus: false },
] as const;

/** Originality is a Plus filter. Free accounts see the options with a Plus
 *  mark; tapping one opens the trial modal and leaves the filter alone. The
 *  server ignores the cap for free accounts either way. Locked only once the
 *  subscription has loaded and says free, so nothing flashes for Plus. */
export function FreshnessToggle({ value, onChange }: FreshnessToggleProps) {
  const { subscription } = useSubscription();
  const locked = subscription?.tier_name === "free";
  const [asking, setAsking] = useState(false);
  const activeValue = value <= 0.3 ? 0.3 : value <= 0.7 ? 0.7 : 1.0;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">Originality</p>
        <p className="text-xs text-muted-foreground mt-0.5">Hide commonly used pieces</p>
      </div>
      <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
        {OPTIONS.map((opt) => {
          const isActive = activeValue === opt.value;
          const gated = locked && opt.plus;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => (gated ? setAsking(true) : onChange(opt.value))}
              aria-disabled={gated || undefined}
              className={`px-4 py-2 text-xs font-medium transition-colors cursor-pointer border-r border-border/60 last:border-r-0 ${
                isActive
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
              {gated && (
                <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">Plus</span>
              )}
            </button>
          );
        })}
      </div>
      <MonologuePaywallModal
        open={asking}
        onOpenChange={setAsking}
        feature="filter_originality"
        title="Fresh picks are a Plus thing."
        description="Plus hides the pieces every panel has heard this season, so what you walk in with is yours. Free to start, card on file, cancel before it renews."
      />
    </div>
  );
}
