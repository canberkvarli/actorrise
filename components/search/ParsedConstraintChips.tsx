"use client";

import { IconX } from "@tabler/icons-react";

/**
 * Echoes back the constraints the search understood from the free-text query
 * ("contemporary monologue for a woman in her 20s" -> Contemporary, Female, 20s)
 * as removable chips. Dismissing one re-runs the search without that constraint,
 * so a wrong parse is a one-tap fix instead of a dead end.
 *
 * These are DISTINCT from the explicit filter chips (ActiveFilterChips): those
 * are what the user picked in the UI; these are what the sentence was read to mean.
 */

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function durationLabel(prefix: string, seconds: number): string {
  if (seconds >= 60) {
    const mins = seconds / 60;
    const rounded = Number.isInteger(mins) ? String(mins) : mins.toFixed(1);
    return `${prefix} ${rounded} min`;
  }
  return `${prefix} ${Math.round(seconds)}s`;
}

/** Human label for one parsed constraint, or null to hide it. */
function chipLabel(key: string, value: unknown): string | null {
  switch (key) {
    case "category":
    case "gender":
    case "tone":
    case "emotion":
    case "theme":
    case "difficulty":
    case "source_type":
      return cap(String(value));
    case "age_range":
    case "author":
      return String(value);
    case "min_duration":
      return durationLabel("≥", Number(value));
    case "max_duration":
      return durationLabel("≤", Number(value));
    default:
      return null;
  }
}

export function ParsedConstraintChips({
  constraints,
  onRemove,
}: {
  constraints: Record<string, unknown> | null | undefined;
  onRemove: (key: string) => void;
}) {
  if (!constraints) return null;
  const chips = Object.entries(constraints)
    .map(([key, value]) => ({ key, label: chipLabel(key, value) }))
    .filter((c): c is { key: string; label: string } => Boolean(c.label));
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Understood:</span>
      {chips.map(({ key, label }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
        >
          {label}
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => onRemove(key)}
            className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
          >
            <IconX className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
