"use client";

import Image from "next/image";
import Link from "next/link";
import { LanguageSwitch } from "@/components/i18n/LanguageSwitch";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";
import { useT, type MessageKey } from "@/lib/i18n";
import { SOCIALS, externalProps } from "@/lib/socials";

const LINKS: { href: string; label: MessageKey }[] = [
  { href: "/about", label: "nav.about" },
  { href: "/pricing", label: "nav.pricing" },
  { href: "/for-students", label: "nav.students" },
  { href: "/for-teachers", label: "landingFooter.teachers" },
  { href: "/sources", label: "landingFooter.sources" },
  { href: "/privacy", label: "landingFooter.privacy" },
  { href: "/terms", label: "landingFooter.terms" },
];

export function TheatreFooter() {
  const t = useT();
  return (
    <footer
      className="px-6 py-10"
      style={{
        background: "var(--t-ink)",
        color: "var(--t-cream)",
        borderTop: "1px solid var(--t-line-dark)",
      }}
    >
      {/* Phone: brand, then the links as a two-column grid with real tap
          height, then a utility row (language + socials) under a rule.
          From sm up it collapses back into the single flowing row. */}
      <div className="mx-auto flex max-w-[1240px] flex-col gap-7 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-8 sm:gap-y-4">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3.5">
          {/* -ml-6: the PNG carries ~24px of transparent padding on its left
              at h-9 (413 of 2000px), so pull it back onto the link column. */}
          <Link prefetch={false} href="/" aria-label={t("nav.home")} className="-ml-6">
            <Image
              src="/transparent_textlogo.png"
              alt="ActorRise"
              width={2000}
              height={600}
              className="block h-9 w-auto"
            />
          </Link>
          <p
            className="m-0"
            style={{
              fontFamily: "var(--t-direction)",
              fontStyle: "italic",
              fontSize: 12,
              letterSpacing: ".06em",
              color: "var(--t-faint)",
            }}
          >
            {t("landingFooter.builtBy", { year: new Date().getFullYear() })}
          </p>
        </div>
        <div
          className="flex flex-col gap-5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1.5"
          style={{ color: "var(--t-muted-light-2)" }}
        >
          <div className="grid grid-cols-2 gap-x-6 text-left [&>*]:py-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1.5 sm:[&>*]:py-0">
            {LINKS.map((l) => (
              <Link prefetch={false}
                key={l.href}
                href={l.href}
                className="transition-colors hover:!text-[var(--t-gel)]"
              >
                {t(l.label)}
              </Link>
            ))}
            <ContactModalTrigger className="text-left !text-[var(--t-muted-light-2)] hover:!text-[var(--t-gel)]">
              {t("landingFooter.contact")}
            </ContactModalTrigger>
            <LandingFooterAuthLink />
          </div>

          <div
            className="flex items-center gap-5 border-t pt-4 sm:border-0 sm:pt-0"
            style={{ borderColor: "var(--t-line-dark)" }}
          >
          {/* Footer and Settings only, never the nav (Canberk, 2026-11-02). */}
          <LanguageSwitch tone="dark" className="-ml-1.5 sm:ml-0" />

          {/* Icons only here. The founder note spells the handles out, because
              someone who has just read it wants something to type; this row is
              already carrying nine links and three more words each would turn
              it into a paragraph.

              Pale tokens, not the note's dark ones: this footer is ink ground.
              --t-muted-dark on it would be near-black on near-black, which is
              exactly how the muted tokens have gone invisible here before. */}
          <span
            aria-hidden
            className="h-4 w-px"
            style={{ background: "var(--t-line-dark)" }}
          />
          {SOCIALS.map(({ name, href, Icon }) => {
            // Brand names stay as they are; only "Email" is a word to translate.
            const label = name === "Email" ? t("landingFooter.email") : name;
            return (
            <a
              key={name}
              href={href}
              {...externalProps(href)}
              aria-label={label}
              title={label}
              className="-m-1.5 inline-flex p-1.5 transition-colors hover:!text-[var(--t-gel)]"
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </a>
            );
          })}
          </div>
        </div>
      </div>
    </footer>
  );
}
