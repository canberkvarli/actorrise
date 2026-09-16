"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ContactModal } from "./ContactModal";
import changelogData from "@/public/changelog.json";
import { APPROVED_PARTNERS } from "@/data/partners";
import { getLatestModalEntry, getLastSeenId } from "@/lib/changelog";
import type { ChangelogEntry } from "@/lib/changelog";

const linkCls = "shrink-0 transition-colors hover:!text-[var(--t-gel)]";

/** Nothing republishes the changelog mid-session, so there is nothing to
    subscribe to; the store is read once on the client and never changes. */
const NO_UPDATES = () => () => {};

function readHasUnseen(): boolean {
  const updates = (changelogData as { updates?: ChangelogEntry[] }).updates;
  if (!updates?.length) return false;
  const latest = getLatestModalEntry(updates);
  return !!(latest && latest.id !== getLastSeenId());
}

function WhatsNewLink() {
  // Bundled at build time rather than fetched. The file is 1.5KB and it sits in
  // the footer of every marketing page, so the runtime fetch was buying 4.6k
  // edge requests a week to decide whether to draw one dot.
  //
  // Read through useSyncExternalStore rather than an effect: getLastSeenId
  // touches localStorage, which the server cannot, and the server snapshot of
  // `false` is also the honest pre-hydration answer — no dot until we know.
  const hasUnseen = useSyncExternalStore(NO_UPDATES, readHasUnseen, () => false);

  return (
    <Link href="/changelog" className={`${linkCls} inline-flex items-center gap-1.5`}>
      What&apos;s New
      {hasUnseen && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--t-orange)" }}
          aria-label="New updates"
        />
      )}
    </Link>
  );
}

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
              <Link href="/" aria-label="ActorRise home">
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
              <WhatsNewLink />
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              ))}
              {/* Hidden until an organization has approved a listing, so this
                  never points at an empty page. */}
              {APPROVED_PARTNERS.length > 0 && (
                <Link href="/thanks" className={linkCls}>
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

          <div
            className="mt-8 max-w-2xl space-y-2 border-t pt-6 text-xs"
            style={{ borderColor: "var(--t-line-dark)", color: "var(--t-faint)" }}
          >
            <p>
              Every piece links back to its source (see{" "}
              <Link href="/sources" className="underline hover:no-underline">
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
