/**
 * Marketing layout for public pages (pricing, landing, etc.)
 *
 * Simple layout with header and footer, no authentication required.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold">ACTORRISE</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-4">
              <Link href="/pricing" className="text-sm font-medium hover:underline">
                Pricing
              </Link>
              <Button asChild variant="outline">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ActorRise. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
              <Link href="/contact" className="hover:underline">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
