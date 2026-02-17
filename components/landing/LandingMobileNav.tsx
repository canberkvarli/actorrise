"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconMenu, IconX } from "@tabler/icons-react";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";

const MOBILE_LINKS = [
  { href: "#suite", label: "Search" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "/for-teachers", label: "For teachers" },
] as const;

export function LandingMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="min-h-[44px] min-w-[44px]"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <IconX className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 top-[57px]"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <nav
            className="fixed left-0 right-0 top-[57px] z-50 border-b border-border/40 bg-background/95 backdrop-blur py-3 shadow-lg animate-in slide-in-from-top-2 duration-200"
            role="dialog"
            aria-label="Mobile navigation"
          >
            <div className="container mx-auto px-4 flex flex-col gap-0">
              {MOBILE_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="min-h-[48px] flex items-center px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
                >
                  {label}
                </Link>
              ))}
              <div
                className="min-h-[48px] flex items-center px-4 py-3"
                onClick={() => setOpen(false)}
              >
                <ContactModalTrigger className="text-sm font-medium text-foreground hover:bg-muted/60 transition-colors w-full text-left min-h-[44px] flex items-center">
                  Contact
                </ContactModalTrigger>
              </div>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
