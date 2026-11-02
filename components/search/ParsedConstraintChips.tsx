"use client";

import { IconX } from "@tabler/icons-react";
import { useLocale, useT, type MessageKey, type Vars } from "@/lib/i18n";
import { useValueLabel } from "@/components/search/searchI18n";

/**
 * Echoes back the constraints the search understood from the free-text query
 * ("contemporary monologue for a woman in her 20s" -> Contemporary, Female, 20s)
 * as removable chips. Dismissing one re-runs the search without that constraint,
 * so a wrong parse is a one-tap fix instead of a dead end.
 *
 * These are DISTINCT from the explicit filter chips (ActiveFilterChips): those
 * are what the user picked in the UI; these are what the sentence was read to mean.
 */

const cap = (s: string, locale: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);

type Translate = (key: MessageKey, vars?: Vars) => string;

function durationLabel(t: Translate, locale: string, prefix: string, seconds: number): string {
  if (seconds >= 60) {
    const mins = seconds / 60;
    const rounded = Number.isInteger(mins)
      ? String(mins)
      : mins.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${prefix} ${t("appSearchChips.minutes", { n: rounded })}`;
  }
  return `${prefix} ${t("appSearchChips.seconds", { n: Math.round(seconds) })}`;
}

/** Human label for one parsed constraint, or null to hide it. */
function chipLabel(
  t: Translate,
  valueLabel: (field: string, value: string) => string,
  locale: string,
  key: string,
  value: unknown,
): string | null {
  switch (key) {
    case "category":
    case "gender":
    case "tone":
    case "emotion":
    case "theme":
    case "difficulty":
    case "source_type":
      return cap(valueLabel(key, String(value)), locale);
    case "age_range":
      return valueLabel(key, String(value));
    case "author":
      return String(value);
    case "min_duration":
      return durationLabel(t, locale, "≥", Number(value));
    case "max_duration":
      return durationLabel(t, locale, "≤", Number(value));
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
  const t = useT();
  const valueLabel = useValueLabel();
  const locale = useLocale() === "tr" ? "tr-TR" : "en-US";
  if (!constraints) return null;
  const chips = Object.entries(constraints)
    .map(([key, value]) => ({ key, label: chipLabel(t, valueLabel, locale, key, value) }))
    .filter((c): c is { key: string; label: string } => Boolean(c.label));
  if (chips.length === 0) return null;

  return (
    /* The "Understood:" label moved to the toolbar that owns this row, so it
       is not repeated when active filter chips sit alongside. */
    <>
      {chips.map(({ key, label }, i) => (
        <span key={key} className="t-understood" style={{ ["--pop-d" as string]: `${0.1 + i * 0.08}s` }}>
          {label}
          <button
            type="button"
            aria-label={t("appSearchChips.remove", { label })}
            onClick={() => onRemove(key)}
            className="t-understood__x"
          >
            <IconX className="size-2.5" />
          </button>
        </span>
      ))}
    </>
  );
}
