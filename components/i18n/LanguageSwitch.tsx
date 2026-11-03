"use client";

import { LOCALES, TURKISH_ON_WEB, setLocale, useLocale, useT, type Locale } from "@/lib/i18n";
import { trackEvent } from "@/lib/events";

/**
 * EN / TR. Two short labels rather than a dropdown: there are two languages,
 * and a dropdown in a 40px pill is one tap more for nothing.
 *
 * `tone` follows the surface: "dark" for the landing/marketing pill, which is
 * dark in either theme, "auto" for the app chrome, which follows the theme.
 */
export function LanguageSwitch({ tone = "auto", className = "" }: { tone?: "dark" | "auto"; className?: string }) {
  const locale = useLocale();
  const t = useT();

  const pick = (next: Locale) => {
    if (!TURKISH_ON_WEB) return;
    if (next === locale) return;
    setLocale(next);
    trackEvent("language_switched", { from: locale, to: next });
  };

  // The web is English only (lib/i18n/locale.ts); the switch is not drawn.
  if (!TURKISH_ON_WEB) return null;

  const idle = tone === "dark" ? "var(--t-muted-light-2)" : undefined;
  const active = tone === "dark" ? "var(--t-gel)" : undefined;

  return (
    <div role="group" aria-label={t("language.label")} className={`flex items-center ${className}`.trim()}>
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && (
            <span aria-hidden className="px-0.5 text-[11px] opacity-40" style={{ color: idle }}>
              /
            </span>
          )}
          <button
            type="button"
            lang={l}
            aria-pressed={locale === l}
            aria-label={t(`language.${l}`)}
            title={t(`language.${l}`)}
            onClick={() => pick(l)}
            className={`min-h-8 px-1.5 text-[12px] font-semibold uppercase tracking-wide transition-colors ${
              tone === "auto" ? (locale === l ? "text-foreground" : "text-muted-foreground hover:text-foreground") : ""
            }`}
            style={tone === "dark" ? { color: locale === l ? active : idle } : undefined}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  );
}
