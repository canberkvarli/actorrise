"use client";

import { useState } from "react";
import Link from "next/link";
import { ContactModal } from "./ContactModal";

export function MarketingFooter() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <footer className="border-t border-border/60 bg-background py-8">
        <div className="container mx-auto px-4 sm:px-6">
          <p className="text-xs text-muted-foreground/90 mb-4 max-w-xl">
            Monologues are from public domain and licensed sources (e.g.{" "}
            <Link href="/sources" className="underline hover:no-underline text-foreground/80">
              Project Gutenberg
            </Link>
            ). We do not distribute copyrighted play text.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ActorRise</p>
            <div className="flex items-center gap-4">
              <Link href="/for-teachers" className="hover:text-foreground transition-colors">
                For teachers
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/sources" className="hover:text-foreground transition-colors">
                Sources & copyright
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="hover:text-foreground transition-colors"
              >
                Contact
              </button>
            </div>
          </div>
        </div>
      </footer>
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
