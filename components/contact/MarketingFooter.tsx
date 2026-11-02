"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ContactModal } from "./ContactModal";
import { APPROVED_PARTNERS } from "@/data/partners";
import { useT, type MessageKey } from "@/lib/i18n";

const linkCls = "shrink-0 transition-colors hover:!text-[var(--t-gel)]";

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
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
            <div className="flex items-center gap-3.5">
              <Link prefetch={false} href="/" aria-label={t("nav.home")}>
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
              className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm"
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
            className="mt-5 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm"
            style={{ color: "var(--t-muted-light-2)" }}
            aria-label={t("marketingFooter.browseLabel")}
          >
            <span style={{ color: "var(--t-faint)" }}>{t("marketingFooter.browse")}</span>
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
        </div>
      </footer>
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
