import { en } from "@/lib/i18n/messages/en";
import type { MessageKey, Vars } from "@/lib/i18n";

/**
 * The English string for a key, on the server. The SEO pages build their FAQ
 * JSON-LD from the same dictionary the visible copy reads, so the schema and
 * the page cannot drift apart. Structured data stays English, like the HTML.
 */
export function english(key: MessageKey, vars?: Vars): string {
  let node: unknown = en;
  for (const part of key.split(".")) node = (node as Record<string, unknown>)?.[part];
  const text = typeof node === "string" ? node : key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? String(vars[n]) : m)) : text;
}
