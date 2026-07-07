/**
 * Marketing layout for public pages (pricing, landing, etc.)
 *
 * Simple layout with header and footer, no authentication required.
 */

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MarketingFooter } from "@/components/contact/MarketingFooter";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PageTransitionWithKey } from "@/components/transition/PageTransition";
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="dark sticky top-0 z-20 border-b border-[var(--stage-line)] bg-[color-mix(in_oklab,var(--stage)_84%,transparent)] backdrop-blur-md text-[var(--stage-fg)]">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center hover:opacity-85 transition-opacity">
                <BrandLogo size="header" onDark />
              </Link>
            </div>
            <nav className="hidden md:flex items-center gap-1 rounded-full border border-[var(--stage-line)] bg-[var(--stage-raised)]/70 px-2 py-1">
              <Link
                href="/"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                Home
              </Link>
              <span className="h-4 w-px bg-[var(--stage-line)]" />
              <Link
                href="/about"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                About
              </Link>
              <span className="h-4 w-px bg-[var(--stage-line)]" />
              <Link
                href="/pricing"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                Pricing
              </Link>
              <span className="h-4 w-px bg-[var(--stage-line)]" />
              <Link
                href="/guides"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                Guides
              </Link>
              <span className="h-4 w-px bg-[var(--stage-line)]" />
              <Link
                href="/for-students"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                Students & educators
              </Link>
              <span className="h-4 w-px bg-[var(--stage-line)]" />
              <Link
                href="/changelog"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                What&apos;s New
              </Link>
              <span className="h-4 w-px bg-[var(--stage-line)]" />
              <Link
                href="/contact"
                className="px-3 py-1.5 text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors"
              >
                Contact
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LandingHeaderActions />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <PageTransitionWithKey>{children}</PageTransitionWithKey>
      </main>

      {/* Footer */}
      <MarketingFooter />
    </div>
  );
}
