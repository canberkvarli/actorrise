import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * The frame around /login and /signup, matching the auth modal.
 *
 * Both routes render the same card on the same ink ground, so a visitor who
 * arrives from a deep link sees what a visitor who tapped the CTA sees. The
 * ghost light glow behind it is the hero's, dimmed — enough that the page is
 * lit from somewhere rather than a flat black rectangle.
 */
export function TheatreAuthShell({
  direction,
  title,
  children,
  footer,
}: {
  /** Courier eyebrow, parentheses included by the caller. */
  direction: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={`theatre-tokens theatre-auth ${theatreFontVars} relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10`}
      style={{ background: "var(--t-ink)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.72 0.17 55 / .18), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-[13px] font-medium"
          style={{ color: "var(--t-muted-light-2)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Back
        </Link>

        <div
          className="p-7 sm:p-8"
          style={{
            background: "oklch(0.16 0.018 52)",
            borderRadius: 28,
            boxShadow:
              "0 0 0 1.5px oklch(0.35 0.03 55 / .5), 0 40px 120px -30px oklch(0.72 0.17 55 / .4)",
          }}
        >
          <div className="flex justify-center">
            <Image
              src="/transparent_textlogo.png"
              alt="ActorRise"
              width={2000}
              height={600}
              priority
              className="h-9 w-auto"
            />
          </div>
          <p className="t-dir pt-4 text-center" style={{ color: "var(--t-muted-light)" }}>
            {direction}
          </p>
          <h1
            className="pt-2 text-center"
            style={{
              fontFamily: "var(--t-display)",
              fontWeight: 400,
              fontSize: "clamp(1.9rem, 7vw, 2.4rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--t-cream)",
            }}
          >
            {title}
          </h1>

          <div className="mt-7">{children}</div>

          {footer ? (
            <div
              className="mt-7 text-center text-sm"
              style={{ color: "var(--t-muted-light-2)" }}
            >
              {footer}
            </div>
          ) : null}
        </div>

        <p
          className="mt-6 text-center"
          style={{
            fontFamily: "var(--t-direction)",
            fontStyle: "italic",
            fontSize: 12,
            letterSpacing: ".06em",
            color: "var(--t-faint)",
          }}
        >
          (by continuing you agree to the{" "}
          <Link href="/terms" className="underline hover:no-underline">
            terms
          </Link>
          .)
        </p>
      </div>
    </div>
  );
}
