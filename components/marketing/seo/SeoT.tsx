"use client";

import { Fragment, type ReactNode } from "react";
import { useLocale, useT, type MessageKey, type Vars } from "@/lib/i18n";

/**
 * The SEO pages' one client island: <T> plus the two things those pages need
 * that <T> does not do.
 *
 * - `slots`: server-rendered nodes (a <Link>, a <strong>) dropped into the
 *   sentence where the template says {name}, so Turkish can put the link
 *   wherever its word order wants it instead of where English had it.
 * - `nums` / `approx` / `dates`: raw values formatted in the reader's locale,
 *   so 19,700+ reads 19.700+ in Turkish. `approx` floors to the hundred and
 *   adds "+", the database page's "stays true all week" count.
 *
 * The server snapshot is English, so the static HTML Google gets is exactly
 * what these pages printed before they were translated.
 */
export function SeoT({
  k,
  vars,
  nums,
  approx,
  dates,
  slots,
}: {
  k: MessageKey;
  vars?: Vars;
  nums?: Record<string, number>;
  approx?: Record<string, number>;
  dates?: Record<string, string>;
  slots?: Record<string, ReactNode>;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "tr" ? "tr-TR" : "en-US";

  const all: Vars = { ...vars };
  for (const [name, n] of Object.entries(nums ?? {})) all[name] = n.toLocaleString(tag);
  for (const [name, n] of Object.entries(approx ?? {})) {
    all[name] = `${(Math.floor(n / 100) * 100).toLocaleString(tag)}+`;
  }
  for (const [name, iso] of Object.entries(dates ?? {})) {
    all[name] = new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const text = t(k, all);
  if (!slots) return <>{text}</>;

  // Unknown {names} survive interpolation, so what is left in braces is a slot.
  const parts = text.split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <Fragment key={i}>{slots[part] ?? `{${part}}`}</Fragment> : part,
      )}
    </>
  );
}
