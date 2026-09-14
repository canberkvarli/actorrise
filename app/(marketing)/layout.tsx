/**
 * Marketing layout for the public pages.
 *
 * The chrome is the landing's: the same floating pill and the same footer, so
 * / and /pricing read as one site. The body between them stays theme-aware —
 * these are pages people read, sometimes at length, and the light/dark choice
 * is theirs. `.theatre-tokens` mounts the palette and the three faces without
 * the landing's ink ground, which is what makes that split possible.
 */

import { MarketingFooter } from "@/components/contact/MarketingFooter";
import { AppLaunchBar } from "@/components/landing/AppLaunchBar";
import { TheatreNav, type TheatreNavLink } from "@/components/landing/v2/theatre/TheatreNav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PageTransitionWithKey } from "@/components/transition/PageTransition";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * Four, not eight. The old bar carried every destination and wrapped
 * "Students & educators" and "What's New" onto second lines at 1440px. These
 * are the ones worth a permanent slot; the rest live in the footer, which
 * already lists all of them.
 */
const MARKETING_LINKS: TheatreNavLink[] = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-students", label: "Students" },
  { href: "/guides", label: "Guides" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theatre-tokens ${theatreFontVars} flex min-h-screen flex-col bg-background`}>
      <AppLaunchBar />

      <TheatreNav sticky showAuthLink links={MARKETING_LINKS}>
        {/* The pill is dark whatever the page theme is, so the toggle's ghost
            button — which paints itself from the semantic foreground — has to
            be told the pill's colours or it goes dark-on-dark in light mode. */}
        <span className="[&_button:hover]:!bg-white/10 [&_button:hover]:!text-[var(--t-gel)] [&_button]:!text-[var(--t-muted-light-2)]">
          <ThemeToggle />
        </span>
      </TheatreNav>

      {/* The pill floats, so pull the page back up under it rather than
          leaving the band of background it would otherwise reserve. */}
      <main className="-mt-[68px] flex-1">
        <PageTransitionWithKey>{children}</PageTransitionWithKey>
      </main>

      <MarketingFooter />
    </div>
  );
}
