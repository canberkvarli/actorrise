"use client";

/**
 * The app's i18n: a dictionary per language and a hook.
 *
 * Deliberately not next-intl. Its value is server-side locale resolution and
 * /tr/ routes, and the server side is exactly what this app cannot afford
 * (see lib/i18n/locale.ts). What is left is a lookup and a store, which is
 * this file.
 *
 *   const t = useT();
 *   t("nav.search")                       -> "Search" | "Ara"
 *   t("auth.continueWith", { provider })  -> interpolates {provider}
 *   tList("search.examplesPlays")         -> string[]
 *
 * Server components that cannot call a hook render <T k="..." /> instead.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  detectLocale,
  localeCookieString,
  type Locale,
} from "./locale";
import { en, type Messages } from "./messages/en";
import { tr } from "./messages/tr";

export type { Locale } from "./locale";
export { LOCALES } from "./locale";

const DICTIONARIES: Record<Locale, Messages> = { en, tr };

/* ---- key types ---------------------------------------------------------- */

type StringPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly string[]
      ? never
      : StringPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

type ListPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends readonly string[]
      ? `${P}${K}`
      : ListPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = StringPaths<Messages>;
export type ListKey = ListPaths<Messages>;
export type Vars = Record<string, string | number>;

/* ---- pure lookup (tested) ----------------------------------------------- */

function lookup(dict: Messages, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Falls back to English, then to the key itself, so a gap never renders blank. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const value = lookup(DICTIONARIES[locale], key) ?? lookup(en, key);
  return typeof value === "string" ? interpolate(value, vars) : key;
}

export function translateList(locale: Locale, key: ListKey): readonly string[] {
  const value = lookup(DICTIONARIES[locale], key) ?? lookup(en, key);
  return Array.isArray(value) ? value : [];
}

/* ---- the store ---------------------------------------------------------- */

/*
 * Module state, not a context provider: every component that calls useT()
 * subscribes on its own, so nothing needs wrapping and a server component can
 * still hold client islands that translate.
 *
 * The server snapshot is always English. That is what keeps the static HTML
 * cacheable; on hydration useSyncExternalStore re-renders with the browser's
 * answer, without a hydration mismatch.
 */
let current: Locale | null = null;
const listeners = new Set<() => void>();

function resolveInBrowser(): Locale {
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* very old engines: no timezone signal */
  }
  return detectLocale({
    cookie: document.cookie,
    languages: navigator.languages?.length ? navigator.languages : [navigator.language],
    timeZone,
  });
}

function getSnapshot(): Locale {
  if (current === null) current = resolveInBrowser();
  return current;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The explicit choice. Remembered for a year; beats every detected signal. */
export function setLocale(locale: Locale): void {
  document.cookie = localeCookieString(locale);
  current = locale;
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: MessageKey, vars?: Vars) => translate(locale, key, vars),
    [locale],
  );
}

export function useTList() {
  const locale = useLocale();
  return useCallback((key: ListKey) => translateList(locale, key), [locale]);
}

/** For server components: a client island that renders one string. */
export function T({ k, vars }: { k: MessageKey; vars?: Vars }) {
  const t = useT();
  return <>{t(k, vars)}</>;
}

/** Keeps <html lang> honest for screen readers and the browser's translate prompt. */
export function HtmlLang() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
