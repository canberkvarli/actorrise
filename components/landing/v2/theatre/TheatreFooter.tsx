"use client";

import Image from "next/image";
import Link from "next/link";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-students", label: "Students" },
  { href: "/for-teachers", label: "Teachers" },
  { href: "/sources", label: "Sources & copyright" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function TheatreFooter() {
  return (
    <footer
      className="px-6 py-10"
      style={{
        background: "var(--t-ink)",
        color: "var(--t-cream)",
        borderTop: "1px solid var(--t-line-dark)",
      }}
    >
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-3.5">
          <Link href="/" aria-label="ActorRise home">
            <Image
              src="/transparent_textlogo.png"
              alt="ActorRise"
              width={150}
              height={36}
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
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm"
          style={{ color: "var(--t-muted-light-2)" }}
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:!text-[var(--t-gel)]"
            >
              {l.label}
            </Link>
          ))}
          <ContactModalTrigger className="!text-[var(--t-muted-light-2)] hover:!text-[var(--t-gel)]" />
          <LandingFooterAuthLink />
        </div>
      </div>
    </footer>
  );
}
