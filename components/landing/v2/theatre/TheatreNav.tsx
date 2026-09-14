"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useAuthModal } from "@/components/auth/AuthModalContext";
import { TheatreCta } from "./TheatreCta";

export type TheatreNavLink = { href: string; label: string };

/** The landing's own three. Marketing passes its own set. */
const LANDING_LINKS: TheatreNavLink[] = [
  { href: "#stage", label: "Search" },
  { href: "#house", label: "Actors" },
  { href: "#curtain", label: "iOS" },
];

/**
 * One floating pill, on the dark acts, the cream one, and every marketing
 * page. It does not switch theme at any boundary: the nav is a thing hanging
 * in the room, not part of the set — which is why it can sit unchanged over
 * the landing's ink hero and a light /pricing table alike.
 *
 * `sticky` is for pages that have something above them (the App Store bar);
 * the landing uses the default fixed position so the pill floats from the
 * very first pixel.
 */
export function TheatreNav({
  links = LANDING_LINKS,
  sticky = false,
  showAuthLink = false,
  children,
}: {
  links?: TheatreNavLink[];
  sticky?: boolean;
  /** Marketing pages carry a way back in; the landing's CTA already is one. */
  showAuthLink?: boolean;
  /** Extras that sit before the CTA, e.g. the theme toggle. */
  children?: React.ReactNode;
}) {
  const position = sticky
    ? "sticky top-4 z-50 flex justify-center px-4"
    : "pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4";

  return (
    <nav className={position}>
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pl-3.5 pr-1.5"
        style={{
          background: "oklch(0.13 0.015 50 / .82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "1px solid oklch(0.35 0.03 55 / .6)",
          boxShadow: "0 10px 40px -10px rgb(0 0 0/.6)",
        }}
      >
        <Link href="/" aria-label="ActorRise home" className="flex items-center">
          <Image
            src="/transparent_textlogo.png"
            alt="ActorRise"
            width={140}
            height={34}
            priority
            className="block h-[34px] w-auto"
          />
        </Link>
        <span
          aria-hidden
          className="h-5 w-px"
          style={{ background: "oklch(0.35 0.03 55)" }}
        />
        {/* Below the breakpoint the pill keeps the logo and the CTA only, and
            the CTA is the one that matters. Everything here is also in the
            footer, which is where the full map lives. */}
        <div className="hidden items-center lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:!text-[var(--t-gel)]"
              style={{ color: "var(--t-muted-light-2)" }}
            >
              {l.label}
            </Link>
          ))}
        </div>
        {children}
        {showAuthLink && <TheatreNavAuthLink />}
        <TheatreCta size="nav" />
      </div>
    </nav>
  );
}

/** "Practice" once you are in, "Sign in" before that. */
function TheatreNavAuthLink() {
  const { user, loading } = useAuth();
  const authModal = useAuthModal();

  if (loading) return null;

  const cls =
    "hidden whitespace-nowrap px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:!text-[var(--t-gel)] sm:block";

  if (user) {
    return (
      <Link href="/practice" className={cls} style={{ color: "var(--t-muted-light-2)" }}>
        Practice
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => authModal?.openAuthModal("login")}
      className={cls}
      style={{ color: "var(--t-muted-light-2)" }}
    >
      Sign in
    </button>
  );
}
