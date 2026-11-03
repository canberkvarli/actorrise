"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LanguageSwitch } from "@/components/i18n/LanguageSwitch";
import { ContactModal } from "./ContactModal";
import { APPROVED_PARTNERS } from "@/data/partners";
import { useT, type MessageKey } from "@/lib/i18n";

const linkCls = "transition-colors hover:!text-[var(--t-gel)] sm:shrink-0";

/* Two columns with tap height on a phone, one flowing row from sm up. */
const gridCls =
  "grid min-w-0 grid-cols-2 gap-x-6 text-sm leading-snug [&>*]:py-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2 sm:[&>*]:py-0";

/* Labels are dictionary keys; play titles in BROWSE stay as written in every language. */
const LINKS: { href: string; label: MessageKey }[] = [
  { href: "/monologue-finder", label: "marketingFooter.monologueFinder" },
  { href: "/audition-monologues", label: "marketingFooter.auditionMonologues" },
  { href: "/audition-ai", label: "marketingFooter.auditionAi" },
  { href: "/guides", label: "nav.guides" },
  { href: "/blog", label: "marketingFooter.blog" },
  { href: "/about", label: "nav.about" },
  { href: "/actors", label: "nav.actors" },
  { href: "/for-students", label: "marketingFooter.studentsEducators" },
  { href: "/for-teachers", label: "marketingFooter.forTeachers" },
  { href: "/pricing", label: "nav.pricing" },
  { href: "/sources", label: "marketingFooter.sources" },
  { href: "/terms", label: "marketingFooter.terms" },
  { href: "/privacy", label: "marketingFooter.privacy" },
];

/* The shelves, on every marketing page. Until 2026-10-10 nothing on the home
   page linked the database or a single collection, so Google reached them
   only through the sitemap. Eight is enough to say what is here; the
   database page lists the rest. */
const BROWSE: ({ href: string; key: MessageKey } | { href: string; title: string })[] = [
  { href: "/monologue-database", key: "marketingFooter.database" },
  { href: "/monologues/hamlet-monologues", title: "Hamlet" },
  { href: "/monologues/romeo-and-juliet-monologues", title: "Romeo and Juliet" },
  { href: "/monologues/macbeth-monologues", title: "Macbeth" },
  { href: "/monologues/monologues-about-love", key: "marketingFooter.aboutLove" },
  { href: "/monologues/comedic-monologues-for-teens", key: "marketingFooter.comedicTeens" },
  { href: "/monologues/monologues-for-women-over-40", key: "marketingFooter.womenOver40" },
  { href: "/monologues/one-minute-monologues-for-men", key: "marketingFooter.oneMinuteMen" },
];

/**
 * The footer on every marketing page, in the landing's voice.
 *
 * Ink in both themes, like the nav pill — the chrome is the building, not the
 * set. Every link and both legal notices are carried over unchanged; only the
 * surface changed.
 */
export function MarketingFooter() {
  const t = useT();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      {/* overflow-x-clip contains the same overflow without turning this into a
          scroll container (which `hidden` does, breaking sticky descendants). */}
      <footer
        className="overflow-x-clip px-6 py-10"
        style={{
          background: "var(--t-ink)",
          color: "var(--t-cream)",
          borderTop: "1px solid var(--t-line-dark)",
        }}
      >
        <div className="mx-auto max-w-[1240px]">
          {/* Phone: brand stacked, link lists as two-column grids with real
              tap height. From sm up, the flowing rows come back. */}
          <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-8 sm:gap-y-4">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3.5">
              {/* -ml-6: the PNG carries ~24px of transparent padding on its
                  left at h-9 (413 of 2000px); this lines it up with the links. */}
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
                {t("marketingFooter.tagline", { year: new Date().getFullYear() })}
              </p>
            </div>

            <nav
              className={gridCls}
              style={{ color: "var(--t-muted-light-2)" }}
              aria-label={t("marketingFooter.linksLabel")}
            >
              {LINKS.map((l) => (
                <Link prefetch={false} key={l.href} href={l.href} className={linkCls}>
                  {t(l.label)}
                </Link>
              ))}
              {/* Hidden until an organization has approved a listing, so this
                  never points at an empty page. */}
              {APPROVED_PARTNERS.length > 0 && (
                <Link prefetch={false} href="/thanks" className={linkCls}>
                  {t("marketingFooter.withThanks")}
                </Link>
              )}
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className={`${linkCls} text-left`}
              >
                {t("marketingFooter.contact")}
              </button>
            </nav>
          </div>

          <nav
            className={`mt-6 border-t pt-4 sm:mt-5 sm:border-0 sm:pt-0 ${gridCls}`}
            style={{ color: "var(--t-muted-light-2)", borderColor: "var(--t-line-dark)" }}
            aria-label={t("marketingFooter.browseLabel")}
          >
            <span
              className="col-span-2 text-xs uppercase tracking-wide sm:text-sm sm:normal-case sm:tracking-normal"
              style={{ color: "var(--t-faint)" }}
            >
              {t("marketingFooter.browse")}
            </span>
            {BROWSE.map((l) => (
              <Link prefetch={false} key={l.href} href={l.href} className={linkCls}>
                {"key" in l ? t(l.key) : l.title}
              </Link>
            ))}
          </nav>

          <div
            className="mt-8 max-w-2xl space-y-2 border-t pt-6 text-xs"
            style={{ borderColor: "var(--t-line-dark)", color: "var(--t-faint)" }}
          >
            <p>
              {t("marketingFooter.legalA")}
              <Link prefetch={false} href="/sources" className="underline hover:no-underline">
                {t("marketingFooter.legalSources")}
              </Link>
              {t("marketingFooter.legalB")}
              <a href="mailto:canberk@actorrise.com" className="underline hover:no-underline">
                canberk@actorrise.com
              </a>
              {t("marketingFooter.legalC")}
            </p>
            <p>{t("marketingFooter.privacyNote")}</p>
          </div>

          {/* The language lives down here and in Settings, not in the nav
              (Canberk, 2026-11-02). Most visitors are already right. */}
          <LanguageSwitch tone="dark" className="mt-4 -ml-1.5" />
        </div>
      </footer>
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
