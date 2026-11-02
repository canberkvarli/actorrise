"use client";

import { Fragment, type ReactNode } from "react";
import { translate, useLocale, type MessageKey } from "@/lib/i18n";

/**
 * <T> for copy whose English lives outside the dictionary: the collection
 * shelves in lib/monologueCollections.ts (metadata, the sitemap and tests read
 * that English, so it stays put) and the guide videos. The dictionary only
 * holds the Turkish, keyed by slug or id.
 *
 * English, and any Turkish key that is missing, renders `fallback` exactly as
 * the server handed it, so the static HTML is unchanged. `slots` fills {name}
 * in a Turkish template (the italic word in a collection H1, say). `short`
 * drops a ": subtitle" and `lower` lowercases in the reader's locale, the two
 * things the related links and shelf chips do to a title.
 */
export function ContentT({
  k,
  fallback,
  slots,
  short,
  lower,
}: {
  k: MessageKey;
  fallback: ReactNode;
  slots?: Record<string, ReactNode>;
  short?: boolean;
  lower?: boolean;
}) {
  const locale = useLocale();

  let node: ReactNode = fallback;
  if (locale !== "en") {
    const found = translate(locale, k);
    if (found !== k) node = found;
  }

  if (typeof node === "string") {
    let text: string = node;
    if (short) text = text.replace(/:.*$/, "");
    if (lower) text = locale === "tr" ? text.toLocaleLowerCase("tr-TR") : text.toLowerCase();
    if (slots) {
      const parts = text.split(/\{(\w+)\}/);
      return (
        <>
          {parts.map((part, i) =>
            i % 2 === 1 ? <Fragment key={i}>{slots[part] ?? `{${part}}`}</Fragment> : part,
          )}
        </>
      );
    }
    return <>{text}</>;
  }
  return <>{node}</>;
}

/** Renders its children for Turkish readers only (the legal pages' translation notice). */
export function TrOnly({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return locale === "tr" ? <>{children}</> : null;
}
