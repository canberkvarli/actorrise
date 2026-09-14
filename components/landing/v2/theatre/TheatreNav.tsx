"use client";

import Image from "next/image";
import { TheatreCta } from "./TheatreCta";

const LINKS = [
  { href: "#stage", label: "Search" },
  { href: "#house", label: "Actors" },
  { href: "#curtain", label: "iOS" },
];

/**
 * One floating pill, the same on the dark acts and the cream one. It does not
 * switch theme at the boundary: the nav is a thing hanging in the room, not
 * part of the set.
 */
export function TheatreNav() {
  return (
    <nav className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
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
        <a href="#top" aria-label="ActorRise home" className="flex items-center">
          <Image
            src="/transparent_textlogo.png"
            alt="ActorRise"
            width={140}
            height={34}
            priority
            className="block h-[34px] w-auto"
          />
        </a>
        <span
          aria-hidden
          className="h-5 w-px"
          style={{ background: "oklch(0.35 0.03 55)" }}
        />
        {/* The section links are a convenience on a page you can also just
            scroll; below 640px the pill has room for the logo and the CTA
            only, and the CTA is the one that matters. */}
        <div className="hidden items-center sm:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-2.5 py-1.5 text-[13px] font-medium transition-colors hover:!text-[var(--t-gel)]"
              style={{ color: "var(--t-muted-light-2)" }}
            >
              {l.label}
            </a>
          ))}
        </div>
        <TheatreCta size="nav" />
      </div>
    </nav>
  );
}
