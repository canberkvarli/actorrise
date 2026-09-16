"use client";

import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { BrandLogo } from "@/components/brand/BrandLogo";
import changelogData from "@/public/changelog.json";
import { SpotlightSurface } from "@/components/brand/SpotlightSurface";
import { IconSearch, IconUser, IconLogout, IconLoader2, IconMenu, IconBookmark, IconChevronDown, IconCreditCard, IconMicrophone, IconFileText, IconMail, IconSettings, IconShieldCheck, IconRocket, IconHelpCircle } from "@tabler/icons-react";
import { useState, useEffect, useRef, Suspense } from "react";
import { useBookmarkCount } from "@/hooks/useBookmarks";
import { useFilmTvFavoriteCount } from "@/hooks/useFilmTvFavorites";
import { useProfile } from "@/hooks/useDashboardData";
import { SWRConfig } from "swr";
import { localStorageProvider } from "@/lib/swrCache";
import { useSubscription } from "@/hooks/useSubscription";
import { AnimatePresence, motion } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageTransition } from "@/components/transition/PageTransition";
import { UploadProvider } from "@/components/practice/UploadProvider";
import { theatreFontVars } from "@/lib/fonts/theatre";

// Lazy-load modals that only appear conditionally — keeps them out of the
// platform layout's initial JS bundle and shaves first-paint cost on /practice.
const ChangelogModal = dynamic(
  () => import("@/components/ChangelogModal").then((m) => ({ default: m.ChangelogModal })),
  { ssr: false },
);
const ContactModal = dynamic(
  () => import("@/components/contact/ContactModal").then((m) => ({ default: m.ContactModal })),
  { ssr: false },
);
// First-run onboarding wizard. Self-gates on user.has_completed_onboarding,
// so it's safe to mount unconditionally.
import { FirstRunCurtain } from "@/components/onboarding/FirstRunCurtain";

const OnboardingWizard = dynamic(
  () => import("@/components/onboarding/OnboardingWizard"),
  { ssr: false },
);
// Soft, dismissible invite for legacy-onboarded users to fill the 5-tap profile.
// Self-gates on the auth user; renders null for new users. Corner card.
const ProfileBackfillCard = dynamic(
  () => import("@/components/onboarding/ProfileBackfillCard"),
  { ssr: false },
);
// Zero-setup first rehearsal gate. Self-gates on the auth user (never rehearsed
// + finished onboarding) and redirects once to /first-scene. Renders null.
const FirstRehearsalGate = dynamic(
  () => import("@/components/onboarding/FirstRehearsalGate").then((m) => ({ default: m.FirstRehearsalGate })),
  { ssr: false },
);
// Fires signup_completed once per new account, for OAuth and password alike.
// Lives here because the OAuth callback is a server route and cannot call gtag.
// Renders null.
const SignupTracker = dynamic(
  () => import("@/components/analytics/SignupTracker").then((m) => ({ default: m.SignupTracker })),
  { ssr: false },
);
// Registers the PWA service worker in production (no-op in dev). Renders null.
const PWARegister = dynamic(
  () => import("@/components/system/PWARegister"),
  { ssr: false },
);
import {
  getLatestModalEntry,
  getLastSeenId,
  markAsSeen,
  type ChangelogEntry,
} from "@/lib/changelog";
import { LastAuthProviderSync } from "@/components/auth/LastAuthProviderSync";
import { AppLaunchBar } from "@/components/landing/AppLaunchBar";
import { CallboardLamp, CallboardSheetRow } from "@/components/community/CallboardLamp";
import { useHeaderLight } from "@/components/layout/useHeaderLight";
import { HouseLightsRow, HouseLightsSwitch } from "@/components/layout/HouseLightsSwitch";

function cleanImageUrl(url: string) {
  return url.trim().split("?")[0].split("#")[0];
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isLoggingOut, isDemoUser, logout, refreshUser } = useAuth();
  const pathname = usePathname();
  // Screens someone opened in order to work: rehearsing a scene, running a
  // monologue, taping. Nothing volunteers itself over the top of these.
  const IS_A_WORKING_SCREEN = /\/(rehearse|memorize|work|tape)(\/|$)/;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [changelogModalEntry, setChangelogModalEntry] = useState<ChangelogEntry | null>(null);
  const [mounted, setMounted] = useState(false);
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const [minLoadReady] = useState(true); // No artificial delay — auth resolves fast
  const { count: bookmarkCount, isLoading: isLoadingBookmarks } = useBookmarkCount();
  const { count: filmTvFavoriteCount, isLoading: isLoadingFilmTvFavorites } = useFilmTvFavoriteCount();
  const savedCount = bookmarkCount + filmTvFavoriteCount;
  const { data: profile } = useProfile(isDemoUser);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const displayName = (mounted ? profile?.name?.trim() : null) || user?.name?.trim() || "";
  const profileLabel = displayName || "Account";
  const profileInitial = displayName
    ? displayName.trim().split(/\s+/).length >= 2
      ? `${displayName.trim().split(/\s+/)[0][0]}${displayName.trim().split(/\s+/)[1][0]}`.toUpperCase()
      : displayName.trim().slice(0, 2).toUpperCase()
    : (user?.email || "?").charAt(0).toUpperCase();
  const rawHeadshotUrl = profile?.headshot_url || user?.headshot_url;
  const headshotUrl = mounted && rawHeadshotUrl && !headshotFailed ? cleanImageUrl(rawHeadshotUrl) : null;

  // Use SWR hook for cached subscription data - MUST be called before any early returns
  const { subscription } = useSubscription();
  const userTier = subscription?.tier_name || "free";
  /* The two notes in the playbill's margin. Both are real subscription data or
     they are not rendered at all — an invented price in the account menu is a
     support email, and this is the one screen where the number has to be the
     number Stripe will charge. */
  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const renewalNote =
    renewalDate && !Number.isNaN(renewalDate.getTime())
      ? `${subscription?.cancel_at_period_end ? "ends" : "renews"} ${renewalDate
          .toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          .toLowerCase()}`
      : null;
  const billingHint =
    userTier !== "free" && subscription?.billing_period
      ? `${userTier} · ${subscription.billing_period}`
      : null;

  useEffect(() => setMounted(true), []);

  // Reset headshot error when profile data changes (e.g., user uploads a new headshot)
  useEffect(() => {
    if (profile?.headshot_url) setHeadshotFailed(false);
  }, [profile?.headshot_url]);

  // Close profile dropdown when clicking/tapping outside (mobile + desktop)
  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener("pointerdown", handlePointerDownOutside);
      return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
    }
  }, [profileDropdownOpen]);

  // No outside-click handler for the sheet: its scrim covers the whole screen
  // and closes it on tap, and the menu button that opens it now sits OUTSIDE
  // the sheet — a pointerdown-outside listener would close on the press and
  // the button's own click would re-open it on release.

  // Escape closes the playbill and the phone sheet. Both are menus that sit
  // over the page; leaving Escape to the outside-click handler alone means a
  // keyboard user can open one and not get out of it.
  useEffect(() => {
    if (!profileDropdownOpen && !mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setProfileDropdownOpen(false);
      setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [profileDropdownOpen, mobileMenuOpen]);

  // The welcome flow used to sit here: three slides shown when
  // has_seen_welcome === false and onboarding was not pending. It is gone
  // (2026-09-15). Onboarding's persist() AND its skip both write
  // has_seen_welcome, so the only accounts that could still reach it were ones
  // that finished the old onboarding before that flag existed — it was three
  // slides of the app describing itself to people who had already been using
  // it. The onboarding card is the first run now, and it is the only one.
  //
  // has_seen_welcome itself STAYS: SignupTracker reads it as the marker of a
  // fresh account, and the column is still written and served.

  // Show changelog modal when the user has not seen the latest feature (1s delay).
  // Source of truth is user.last_seen_feature_id on the backend so it's once per actor,
  // not once per browser. localStorage is a fallback for dismisses written before the
  // server-side column existed.
  useEffect(() => {
    if (loading || !user) return;
    // Not on a working screen. Tapping Rehearse and being handed a note about
    // sign-in and Film & TV browsing is an interruption at the exact moment
    // someone came here to act. It keeps until they're back on the shelf.
    if (IS_A_WORKING_SCREEN.test(pathname ?? "")) return;

    let cancelled = false;
    // Bundled at build time, not fetched: 1.5KB of JSON is cheaper to ship in
    // the chunk than to request on every page view.
    const timeoutId = setTimeout(() => {
      const updates = (changelogData as { updates?: ChangelogEntry[] }).updates;
      if (cancelled || !updates?.length) return;
      const latest = getLatestModalEntry(updates);
      if (!latest) return;
      const seenServer = user.last_seen_feature_id ?? null;
      const seenLocal = getLastSeenId();
      if (latest.id === seenServer || latest.id === seenLocal) return;
      setChangelogModalEntry(latest);
      setShowChangelogModal(true);
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [loading, user, pathname]);


  // Green Room is deliberately not here. community_events records 2 "rehearsing"
  // events from 2 users, ever, last on 2026-08-05, and it has no tables or API of
  // its own. It was holding a third of the primary nav. The routes and components
  // are untouched, so restoring it is this line.
  // One nav config drives all three surfaces: the desktop bar, the mobile
  // bottom bar, and (for active state) nothing else. They used to be three
  // hand-written trees, which is how Collection ended up a phone-only tab and
  // Monologues ended up rendered three times on a phone.
  const navItems = [
    { href: "/monologues", label: "Monologues", icon: IconSearch, match: "exact" as const },
    // ScenePartner, not "My Scripts": the pricing page meters "ScenePartner
    // sessions" and /scene-partner-ai is the SEO surface, so the app was the one
    // place the product had no name. It also names the value (someone reads the
    // other lines) rather than the container (you have some PDFs).
    { href: "/practice", label: "ScenePartner", icon: IconMicrophone, match: "prefix" as const },
    // Collection was a bottom-bar-only tab. Mobile reached /rehearse at ~1.9x the
    // desktop rate over the 28 days to 2026-08-15 (20/113 vs 8/86 users), so the
    // fix was to give desktop the tab, not to take the tab off the phone.
    { href: "/rehearse", label: "Collection", icon: IconBookmark, match: "exact" as const },
  ];
  /* The followspot behind the nav, and whether the bar has been scrolled past.
     Keyed on pathname so it re-measures when the route changes. Both are
     written straight to the DOM — see the hook for why neither is state. */
  /* Locked open: the bar must not slide away while the playbill or the phone
     sheet is hanging off it. */
  const { navRef, lightRef, barRef, shellRef } = useHeaderLight(
    pathname,
    profileDropdownOpen || mobileMenuOpen,
  );

  const isNavActive = (item: (typeof navItems)[number]) =>
    item.match === "prefix" ? (pathname || "").startsWith(item.href) : pathname === item.href;
  const isImmersive = /^\/scenes\/[^/]+\/rehearse$|^\/practice\/[^/]+\/scenes\/[^/]+\/edit$|^\/audition$|^\/first-scene$|^\/monologue\/[^/]+\/work$/.test(pathname || "");

  return (
    <>
    <Suspense fallback={null}>
      <LastAuthProviderSync />
    </Suspense>
    <SWRConfig
      value={{
        provider: localStorageProvider,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 10000, // 10 seconds
      }}
    >
    <TooltipProvider>
    <UploadProvider>
    {/* overflow-x-clip, not -hidden: `hidden` forces overflow-y to auto, which
        makes this a scroll container and silently breaks `position: sticky` for
        everything inside it. `clip` contains the same overflow without that. */}
    <div className="min-h-screen bg-background overflow-x-clip relative">
      {/* Existing users never see the landing page, so without this the only way
          they learn the app shipped is an email. Above the sticky nav and in
          normal flow, so it scrolls away and the nav still pins at top-0 — the
          64/80px offsets the rest of the app measures against are unchanged.
          Shares one dismissal key with the marketing bar: dismiss it anywhere,
          it is gone everywhere. */}
      <AppLaunchBar />

      {/* Logout transition overlay.

          The faces have to be BOUND here, not merely asked for: the platform
          layout carries neither `theatre-tokens` nor `theatreFontVars`, so
          `var(--t-display)` resolved to nothing, which invalidates the whole
          font-family declaration and makes the element inherit — the goodbye
          has been rendering in the app's Montserrat since it shipped. Same
          omission as /monologues (a589aa3f). */}
      <AnimatePresence>
        {isLoggingOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`t-curtain-out theatre-tokens ${theatreFontVars}`}
            aria-live="polite"
            aria-label="Logging out"
          >
            {/* Leaving is the one moment the product gets to say goodbye in
                its own voice, and the gesture IS the goodbye — two travelers
                sweeping in to meet, then the line. No card, no bulb: the
                ghost light is the lamp left on an empty stage, which is an
                empty state, not a person going home. */}
            <span aria-hidden className="t-curtain-out__panel t-curtain-out__panel--l" />
            <span aria-hidden className="t-curtain-out__panel t-curtain-out__panel--r" />
            <div className="t-curtain-out__say">
              <p className="t-dir" style={{ color: "oklch(0.72 0.03 62)" }}>
                (curtain.)
              </p>
              <p className="t-curtain-out__line">See you at the next call.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Navigation */}
      {!isImmersive && (
      /* Dark theatrical shell: the chrome always lives on the warm stage and
         carries the cursor glow. wash/overflow off so it stays subtle and the
         profile dropdown + mobile menu aren't clipped. */
      <SpotlightSurface
        as="nav"
        wash={false}
        overflowHidden={false}
        ref={shellRef}
        data-hidden="false"
        className="t-appbar-shell z-[9998] flex justify-center border-0 bg-transparent px-4 pt-3.5 text-foreground"
        /* sticky, not relative: on a phone the hamburger, theme toggle and
           account menu all live up here, and a relative header scrolls them off
           screen entirely. The marketing header has always been sticky top-0.
           Set inline because SpotlightSurface hardcodes `relative` in its own
           className and class order in the attribute does not decide the winner.
           Its backdrop-blur makes this element the containing block for the
           fixed mobile menu below, so pinning it also pins that menu. */
        style={{ position: 'sticky', top: 0, pointerEvents: 'none', ['--primary']: 'oklch(0.76 0.15 52)' } as React.CSSProperties}
      >
        {/* The bar is a floating pill now, not a full-width band. It shrinks a
            touch once you scroll, so the page feels like it is passing under
            something rather than pushing it. */}
        <div ref={barRef} className="t-appbar" data-scrolled="false">
          {/* 64px on a phone, 80px from md up. A sticky 80px header plus the 64px
              bottom bar was eating ~20% of a 700px phone viewport permanently. */}
          <div className="flex h-[52px] items-center gap-2 md:h-[56px]">
            {/* Logo: left on all breakpoints */}
            <Link
              href="/practice"
              className="flex min-w-0 shrink-0 items-center transition-opacity hover:opacity-80"
              aria-label="ActorRise Home"
            >
              {/* Not onDark any more. The bar is paper in light and ink in dark, so the
                  wordmark has to follow it — hardcoding the light-on-dark asset
                  printed a cream logo onto cream paper. BrandLogo already picks
                  the right file from resolvedTheme when it is allowed to. */}
              <BrandLogo size="header" />
            </Link>
            <span aria-hidden className="t-appbar__rule" />

            {/* Desktop navigation.

                One light slides between the three tabs instead of each one
                painting its own pill. It is measured from the active link's
                box rather than animated per-item, so adding a nav item needs
                no new state — and it makes the move read as a followspot
                finding the next actor, which is the whole idea. */}
            <nav
              ref={navRef}
              aria-label="Primary"
              className="relative hidden min-w-0 flex-1 items-center justify-center gap-0.5 md:flex"
            >
              <span ref={lightRef} aria-hidden className="t-appbar__light" />
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isNavActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-nav={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className="t-appbar__tab"
                    data-active={isActive}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
              {user?.is_moderator && (
                <Link
                  href="/admin"
                  data-nav="/admin"
                  aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                  className="t-appbar__tab"
                  data-active={pathname.startsWith("/admin")}
                >
                  <IconShieldCheck className="size-4 shrink-0" />
                  Admin
                </Link>
              )}
            </nav>

            {/* Desktop Profile Dropdown - right aligned */}
            <div className="hidden md:flex items-center gap-1">
              {/* The Callboard sits with the utilities, not in the nav.

                  The nav holds the three things an actor came to do, and a
                  social page beside them either loses or wins by stealing
                  attention from the job. It was a bare dot in that row first,
                  which read as a nav item whose label had failed to render —
                  everything around it was icon + word. This cluster is
                  icon-only, so the identical control is legible here. */}
              <CallboardLamp active={pathname === "/callboard"} />
              <Link href="/help" aria-label="Help" title="Help" className="t-help">
                ?
              </Link>
              <HouseLightsSwitch />
              <span aria-hidden className="t-appbar__rule mx-1" />
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  aria-expanded={profileDropdownOpen}
                  aria-haspopup="menu"
                  className="t-account"
                  data-open={profileDropdownOpen}
                >
                  <span className="t-account__avatar flex shrink-0 items-center justify-center overflow-hidden text-xs font-medium">
                    {headshotUrl ? (
                      <Image
                        src={headshotUrl}
                        alt=""
                        width={28}
                        height={28}
                        className="rounded-full object-cover h-full w-full"
                        unoptimized
                        onError={() => setHeadshotFailed(true)}
                      />
                    ) : (
                      profileInitial
                    )}
                  </span>
                  <span className="hidden max-w-[8rem] truncate text-[13px] font-semibold lg:inline">
                    {displayName || "Account"}
                  </span>
                  {userTier && userTier !== "free" && (
                    <span className="t-account__tier">{userTier}</span>
                  )}
                  <IconChevronDown
                    className={`size-3 shrink-0 transition-transform ${
                      profileDropdownOpen ? "rotate-180" : ""
                    }`}
                    style={{ color: "oklch(0.65 0.02 62)" }}
                  />
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div className="t-playbill-menu" role="menu">
                    {/* The actor's initials, watching from behind the card. */}
                    <span aria-hidden className="t-playbill-menu__mark">
                      {profileInitial}
                    </span>
                    <div className="relative">
                      <div className="t-playbill-menu__head">
                        {headshotUrl ? (
                          <Image
                            src={headshotUrl}
                            alt=""
                            width={44}
                            height={44}
                            className="rounded-full object-cover h-11 w-11"
                            unoptimized
                            onError={() => setHeadshotFailed(true)}
                          />
                        ) : (
                          <div className="t-playbill-menu__avatar">{profileInitial}</div>
                        )}
                        <div className="min-w-0 flex flex-col gap-1.5">
                          <p className="t-playbill-menu__name truncate">
                            {displayName ? profileLabel : "Your account"}
                          </p>
                          {!displayName && (
                            <Link
                              href="/profile"
                              onClick={() => setProfileDropdownOpen(false)}
                              className="t-playbill-menu__link"
                            >
                              Add your name & photo →
                            </Link>
                          )}
                          {/* The plan and the date it turns over, on one
                              line. A badge on its own answered "what am I on"
                              and left "and when does it bill" to the billing
                              page — which is the question people actually open
                              this menu with. */}
                          <p className="t-playbill-menu__meta">
                            <span className="t-playbill-menu__plan">{userTier}</span>
                            {renewalNote}
                          </p>
                        </div>
                      </div>

                      <p className="t-playbill-menu__dir">(you.)</p>
                      <Link
                        href="/profile"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="t-playbill-menu__row"
                      >
                        <IconUser className="h-4 w-4 opacity-60" />
                        <span>Edit profile</span>
                      </Link>
                      <Link
                        href="/resume"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="t-playbill-menu__row"
                      >
                        <IconFileText className="h-4 w-4 opacity-60" />
                        <span>Résumé</span>
                      </Link>
                      {/* Collection is a tab in the bar this menu hangs from,
                          and a tab in the phone sheet. A third way in, one row
                          under the account name, was the same door listed twice
                          on one screen. */}

                      <p className="t-playbill-menu__dir">(the box office.)</p>
                      <Link
                        href="/billing"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="t-playbill-menu__row"
                      >
                        <IconCreditCard className="h-4 w-4 opacity-60" />
                        <span>Billing</span>
                        {billingHint && (
                          <span className="t-playbill-menu__hint">{billingHint}</span>
                        )}
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="t-playbill-menu__row"
                      >
                        <IconSettings className="h-4 w-4 opacity-60" />
                        <span>Account settings</span>
                      </Link>

                      {user?.is_moderator && (
                        <>
                          <p className="px-2 py-1.5 mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Admin
                          </p>
                          <Link
                            href="/admin"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="t-playbill-menu__row"
                          >
                            <IconShieldCheck className="h-4 w-4 opacity-60" />
                            <span>Admin</span>
                          </Link>
                        </>
                      )}

                    </div>

                    <div className="t-playbill-menu__foot">
                      <span className="t-playbill-menu__dir m-0 p-0">(curtain call.)</span>
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          void logout();
                        }}
                        disabled={isLoggingOut}
                        className="t-playbill-menu__out"
                      >
                        {isLoggingOut ? (
                          <IconLoader2 className="size-3.5 animate-spin shrink-0" />
                        ) : null}
                        {isLoggingOut ? "Logging out…" : "Log out"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* No mobile center action: Monologues is already a bottom-bar tab,
                and duplicating it here put the same destination on screen twice
                (three times, counting the hamburger). The header reads as empty
                on purpose now, the thumb-reachable bar is the primary nav. */}

            {/* Mobile: the lamp and the menu, nothing else.

                The theme toggle used to sit here, which spent one of the two
                spots a thumb can reach at the top of a phone on a control
                nobody touches twice a month. It is a row in the sheet now, and
                the Callboard — which has a live count and a reason to tap —
                has the spot instead. Until this, the board had no persistent
                handle on a phone at all. */}
            <div className="flex shrink-0 items-center gap-1 md:hidden">
              <CallboardLamp active={pathname === "/callboard"} />
              <button
                type="button"
                className="t-burger"
                data-open={mobileMenuOpen}
                aria-expanded={mobileMenuOpen}
                aria-haspopup="menu"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <IconMenu className="size-4" />
              </button>
            </div>
        </div>
        </div>
      </SpotlightSurface>
      )}

      {/* Main Content - extra padding on mobile so content scrolls above bottom nav */}
      <main className={isImmersive ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0"}>
        {isImmersive ? children : <PageTransition transitionKey={pathname}>{children}</PageTransition>}
      </main>

      {/* Mobile Bottom Navigation - one-thumb access to primary actions */}
      {!isImmersive && (
      <nav
        /* A floating pill under the thumb rather than a bar welded to the
           bottom edge, matching the header above it. safe-area-bottom keeps it
           clear of the home indicator. */
        className="t-tabbar safe-area-bottom md:hidden"
        style={{ ['--primary']: 'oklch(0.76 0.15 52)' } as React.CSSProperties}
      >
        <div className="flex items-stretch gap-1">
          {/* Same navItems, same order as the desktop bar, so the two navs can no
              longer drift apart. Account is appended here only, it lives in the
              avatar dropdown on desktop. */}
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="t-tabbar__tab"
                data-active={isNavActive(item)}
                aria-current={isNavActive(item) ? "page" : undefined}
              >
                <Icon className="size-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/profile"
            className="t-tabbar__tab"
            data-active={pathname === "/profile"}
            aria-current={pathname === "/profile" ? "page" : undefined}
          >
            {headshotUrl ? (
              <Image
                src={headshotUrl}
                alt=""
                width={24}
                height={24}
                className="size-[18px] shrink-0 rounded-full object-cover"
                unoptimized
                onError={() => setHeadshotFailed(true)}
              />
            ) : (
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-medium text-background">
                {profileInitial}
              </span>
            )}
            Account
          </Link>
        </div>
      </nav>
      )}

      {/* The menu, as a sheet up from the bottom.

          Outside the header in the DOM on purpose: the header carries a
          transform now (it slides away as you read), and a transform makes an
          element the containing block for anything `fixed` inside it — the old
          dropdown would have been welded to a bar that leaves the screen. Down
          here is also where the thumb already is.

          The primary nav is deliberately absent: all four destinations are
          tabs in the bar behind this sheet. */}
      {!isImmersive && mobileMenuOpen && (
        <>
          <div
            aria-hidden
            className="t-sheet-scrim md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div role="menu" aria-label="Menu" className="t-sheet md:hidden">
            <span aria-hidden className="t-sheet__handle" />

            {user?.is_moderator && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="t-sheet__row"
                data-active={pathname.startsWith("/admin")}
              >
                <IconShieldCheck className="size-[18px] shrink-0" />
                Admin
              </Link>
            )}

            <CallboardSheetRow
              active={pathname === "/callboard"}
              onNavigate={() => setMobileMenuOpen(false)}
            />

            <Link
              href="/monologues"
              onClick={() => setMobileMenuOpen(false)}
              className="t-sheet__row"
            >
              <IconBookmark className="size-[18px] shrink-0" />
              Saved
              {!isLoadingBookmarks && !isLoadingFilmTvFavorites && savedCount > 0 && (
                <span className="t-sheet__count">{savedCount}</span>
              )}
            </Link>

            <Link
              href="/billing"
              onClick={() => setMobileMenuOpen(false)}
              className="t-sheet__row"
              data-active={pathname === "/billing"}
            >
              <IconCreditCard className="size-[18px] shrink-0" />
              Billing
              {billingHint && <span className="t-sheet__count">{billingHint}</span>}
            </Link>

            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="t-sheet__row"
              data-active={pathname === "/settings"}
            >
              <IconSettings className="size-[18px] shrink-0" />
              Account settings
            </Link>

            <Link
              href="/help"
              onClick={() => setMobileMenuOpen(false)}
              className="t-sheet__row"
              data-active={pathname === "/help"}
            >
              <IconHelpCircle className="size-[18px] shrink-0" />
              Help
            </Link>

            <Link
              href="/changelog"
              onClick={() => setMobileMenuOpen(false)}
              className="t-sheet__row"
            >
              <IconRocket className="size-[18px] shrink-0" />
              What&apos;s new
            </Link>

            <button
              type="button"
              className="t-sheet__row"
              onClick={() => {
                setMobileMenuOpen(false);
                setContactOpen(true);
              }}
            >
              <IconMail className="size-[18px] shrink-0" />
              Contact &amp; feedback
            </button>

            {/* The house lights live here on a phone rather than in the header
                pill — see HouseLightsRow for why it is a row and not the
                switch. */}
            <HouseLightsRow onToggle={() => setMobileMenuOpen(false)} />

            <button
              type="button"
              className="t-sheet__row"
              disabled={isLoggingOut}
              onClick={() => {
                setMobileMenuOpen(false);
                void logout();
              }}
            >
              {isLoggingOut ? (
                <IconLoader2 className="size-[18px] shrink-0 animate-spin" />
              ) : (
                <IconLogout className="size-[18px] shrink-0" />
              )}
              {isLoggingOut ? "Logging out…" : "Log out"}
            </button>

            <button
              type="button"
              className="t-sheet__close"
              onClick={() => setMobileMenuOpen(false)}
            >
              Close
            </button>
          </div>
        </>
      )}

      {/* Holds the stage while the dynamic OnboardingWizard chunk loads, so the
          dashboard never assembles itself only to be covered a beat later. */}
      <FirstRunCurtain />
      <OnboardingWizard />
      <ProfileBackfillCard />
      <PWARegister />
      <SignupTracker />
      <FirstRehearsalGate />
      {changelogModalEntry && (
        <ChangelogModal
          open={showChangelogModal}
          onOpenChange={(open) => {
            if (!open) {
              void markAsSeen(changelogModalEntry.id).then(() => refreshUser());
            }
            setShowChangelogModal(open);
          }}
          entry={changelogModalEntry}
          onDismiss={() => {
            void markAsSeen(changelogModalEntry.id).then(() => refreshUser());
            setShowChangelogModal(false);
          }}
        />
      )}
      {contactOpen && <ContactModal open={contactOpen} onOpenChange={setContactOpen} />}
    </div>
    </UploadProvider>
    </TooltipProvider>
    </SWRConfig>
    </>
  );
}

