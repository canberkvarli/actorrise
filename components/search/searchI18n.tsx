"use client";

import { Fragment, useCallback, type ReactNode } from "react";
import { useT, type MessageKey } from "@/lib/i18n";
import { appSearch as enAppSearch } from "@/lib/i18n/messages/en/appSearch";

/**
 * Small helpers the search area shares for translated copy.
 *
 * - `withSlots`: drop nodes (a bold title, a link) into a translated sentence
 *   where it says {name}, so Turkish can put them where its word order wants.
 * - `useValueLabel`: the display label for a filter VALUE. The value sent to
 *   the API never changes; unknown values (free text, data) come back as-is.
 * - `useJoinList`: "a, b and c" in the reader's language.
 */
export function withSlots(text: string, slots: Record<string, ReactNode>): ReactNode {
  // Unknown {names} survive interpolation, so what is left in braces is a slot.
  const parts = text.split(/\{(\w+)\}/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 && part in slots ? (
          <Fragment key={i}>{slots[part]}</Fragment>
        ) : i % 2 === 1 ? (
          `{${part}}`
        ) : (
          part
        ),
      )}
    </>
  );
}

const VALUES = enAppSearch.appSearchValues as Record<string, Record<string, string>>;

export function useValueLabel() {
  const t = useT();
  return useCallback(
    (field: string, value: string): string => {
      const group = VALUES[field];
      if (!group || !(value in group)) {
        // Data can arrive capitalised ("Classical"); try the lowercase form.
        const lower = value.toLowerCase();
        if (group && lower in group) {
          const label = t(`appSearchValues.${field}.${lower}` as MessageKey);
          // English labels mirror the value, so keep the data's own casing there.
          return label === lower ? value : label;
        }
        return value;
      }
      return t(`appSearchValues.${field}.${value}` as MessageKey);
    },
    [t],
  );
}

export function useJoinList() {
  const t = useT();
  return useCallback(
    (words: string[]): string => {
      if (words.length <= 1) return words[0] ?? "";
      return words.slice(0, -1).join(t("appSearchList.comma")) + t("appSearchList.and") + words[words.length - 1];
    },
    [t],
  );
}
