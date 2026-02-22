/**
 * Marketing layout for public pages (pricing, landing, etc.)
 *
 * Simple layout with header and footer, no authentication required.
 */

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { MarketingFooter } from "@/components/contact/MarketingFooter";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { PageTransitionWithKey } from "@/components/transition/PageTransition";
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center text-foreground hover:opacity-80 transition-opacity">
                <BrandLogo size="header" />
              </Link>
            </div>
            <nav className="hidden md:flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-1">
              <Link
                href="/"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="/about"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                About
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="/pricing"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="/for-students"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                Students & educators
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="/changelog"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                What&apos;s New
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <Link
                href="/contact"
                className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors"
              >
                Contact
              </Link>
            </nav>
            <div className="flex items-center gap-2">
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
