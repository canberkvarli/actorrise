"use client";

interface FreshnessToggleProps {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS = [
  { label: "Fresh picks", value: 0.3 },
  { label: "Popular too", value: 0.7 },
  { label: "Show all", value: 1.0 },
] as const;

export function FreshnessToggle({ value, onChange }: FreshnessToggleProps) {
  const activeValue = value <= 0.3 ? 0.3 : value <= 0.7 ? 0.7 : 1.0;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">Originality</p>
        <p className="text-xs text-muted-foreground mt-0.5">Filter out commonly used audition pieces</p>
      </div>
      <div className="inline-flex rounded-lg border border-border/60 overflow-hidden">
        {OPTIONS.map((opt) => {
          const isActive = activeValue === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-4 py-2 text-xs font-medium transition-colors cursor-pointer border-r border-border/60 last:border-r-0 ${
                isActive
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
