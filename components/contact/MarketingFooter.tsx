"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ContactModal } from "./ContactModal";
import { APPROVED_PARTNERS } from "@/data/partners";

const linkCls = "shrink-0 transition-colors hover:!text-[var(--t-gel)]";

const LINKS = [
  { href: "/monologue-finder", label: "Monologue finder" },
  { href: "/audition-monologues", label: "Audition monologues" },
  { href: "/audition-ai", label: "Audition AI" },
  { href: "/guides", label: "Guides" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/actors", label: "Actors" },
  { href: "/for-students", label: "Students & educators" },
  { href: "/for-teachers", label: "For teachers" },
  { href: "/pricing", label: "Pricing" },
  { href: "/sources", label: "Sources & copyright" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

/* The shelves, on every marketing page. Until 2026-10-10 nothing on the home
   page linked the database or a single collection, so Google reached them
   only through the sitemap. Eight is enough to say what is here; the
   database page lists the rest. */
const BROWSE = [
  { href: "/monologue-database", label: "The monologue database" },
  { href: "/monologues/hamlet-monologues", label: "Hamlet" },
  { href: "/monologues/romeo-and-juliet-monologues", label: "Romeo and Juliet" },
  { href: "/monologues/macbeth-monologues", label: "Macbeth" },
  { href: "/monologues/monologues-about-love", label: "About love" },
  { href: "/monologues/comedic-monologues-for-teens", label: "Comedic, for teens" },
  { href: "/monologues/monologues-for-women-over-40", label: "Women over 40" },
  { href: "/monologues/one-minute-monologues-for-men", label: "One minute, for men" },
];

/**
 * The footer on every marketing page, in the landing's voice.
 *
 * Ink in both themes, like the nav pill — the chrome is the building, not the
 * set. Every link and both legal notices are carried over unchanged; only the
 * surface changed.
 */
export function MarketingFooter() {
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
              <Link prefetch={false} href="/" aria-label="ActorRise home">
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
                (built by an actor, for actors. © {new Date().getFullYear()})
              </p>
            </div>

            <nav
              className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm"
              style={{ color: "var(--t-muted-light-2)" }}
              aria-label="Footer links"
            >
              {LINKS.map((l) => (
                <Link prefetch={false} key={l.href} href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              ))}
              {/* Hidden until an organization has approved a listing, so this
                  never points at an empty page. */}
              {APPROVED_PARTNERS.length > 0 && (
                <Link prefetch={false} href="/thanks" className={linkCls}>
                  With thanks
                </Link>
              )}
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className={`${linkCls} text-left`}
              >
                Contact
              </button>
            </nav>
          </div>

          <nav
            className="mt-5 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm"
            style={{ color: "var(--t-muted-light-2)" }}
            aria-label="Browse monologues"
          >
            <span style={{ color: "var(--t-faint)" }}>Browse</span>
            {BROWSE.map((l) => (
              <Link prefetch={false} key={l.href} href={l.href} className={linkCls}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div
            className="mt-8 max-w-2xl space-y-2 border-t pt-6 text-xs"
            style={{ borderColor: "var(--t-line-dark)", color: "var(--t-faint)" }}
          >
            <p>
              Every piece links back to its source (see{" "}
              <Link prefetch={false} href="/sources" className="underline hover:no-underline">
                Sources
              </Link>
              ); I never host full scripts of copyrighted works. Rights holders can
              request removal anytime via{" "}
              <a href="mailto:canberk@actorrise.com" className="underline hover:no-underline">
                canberk@actorrise.com
              </a>
              .
            </p>
            <p>I don&apos;t sell your data. Your searches are private.</p>
          </div>
        </div>
      </footer>
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
