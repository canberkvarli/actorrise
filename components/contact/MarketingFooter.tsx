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
          <p className="text-xs text-muted-foreground/90 mb-2 max-w-xl">
            All text from public domain and licensed sources (e.g.{" "}
            <Link href="/sources" className="underline hover:no-underline text-foreground/80">
              Project Gutenberg
            </Link>
            ); we don&apos;t distribute copyrighted play text.
          </p>
          <p className="text-xs text-muted-foreground/90 mb-4 max-w-xl">
            We don&apos;t sell your data. Your searches are private.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ActorRise</p>
            <div className="flex items-center gap-4">
              <Link href="/about" className="hover:text-foreground transition-colors">
                About
              </Link>
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
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://www.producthunt.com/products/actorrise?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-actorrise"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block opacity-80 hover:opacity-100 transition-opacity"
              aria-label="ActorRise on Product Hunt"
            >
              <img
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1078076&theme=neutral&t=1771519524232"
                alt="ActorRise on Product Hunt"
                width={200}
                height={43}
                className="h-[43px] w-auto"
              />
            </a>
          </div>
        </div>
      </footer>
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
}
