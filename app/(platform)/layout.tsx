"use client";

import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconSearch, IconUser, IconLogout, IconLoader2, IconMenu, IconBookmark, IconChevronDown, IconCreditCard, IconMicrophone, IconQuote, IconFileText, IconMail, IconSettings, IconShieldCheck, IconRocket, IconStar, IconHelpCircle } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PlanBadge } from "@/components/billing/PlanBadge";
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

// Lazy-load modals that only appear conditionally — keeps them out of the
// platform layout's initial JS bundle and shaves first-paint cost on /practice.
const WelcomeFlow = dynamic(
  () => import("@/components/onboarding/WelcomeFlow").then((m) => ({ default: m.WelcomeFlow })),
  { ssr: false },
);
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
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
  const mobileMenuRef = useRef<HTMLDivElement>(null);
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

  // Close mobile menu when clicking/tapping outside (mobile + desktop)
  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.addEventListener("pointerdown", handlePointerDownOutside);
      return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
    }
  }, [mobileMenuOpen]);

  // Show welcome flow for new users who haven't seen it. Suppressed while the
  // newer full-screen OnboardingWizard is still pending (has_completed_onboarding
  // === false) so the two first-run experiences never stack.
  useEffect(() => {
    if (
      !loading &&
      user &&
      user.has_seen_welcome === false &&
      user.has_completed_onboarding !== false
    ) {
      const timer = setTimeout(() => setShowWelcome(true), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, user]);

  // Show changelog modal when user has not seen the latest feature (after welcome, 1s delay).
  // Source of truth is user.last_seen_feature_id on the backend so it's once per actor,
  // not once per browser. localStorage is a fallback for dismisses written before the
  // server-side column existed.
  useEffect(() => {
    if (loading || !user || showWelcome) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      fetch("/changelog.json")
        .then((res) => res.ok ? res.json() : null)
        .then((data: { updates?: ChangelogEntry[] } | null) => {
          if (cancelled || !data?.updates?.length) return;
          const latest = getLatestModalEntry(data.updates);
          if (!latest) return;
          const seenServer = user.last_seen_feature_id ?? null;
          const seenLocal = getLastSeenId();
          if (latest.id === seenServer || latest.id === seenLocal) return;
          setChangelogModalEntry(latest);
          setShowChangelogModal(true);
        })
        .catch(() => {});
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [loading, user, showWelcome]);


  const navItems = [
    { href: "/monologues", label: "Monologues", icon: IconQuote },
    { href: "/rehearse", label: "Collection", icon: IconBookmark },
    { href: "/practice", label: "My Scripts", icon: IconMicrophone },
  ];
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
    <div className="min-h-screen bg-background overflow-x-hidden relative">
      {/* Logout transition overlay */}
      <AnimatePresence>
        {isLoggingOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm"
            aria-live="polite"
            aria-label="Logging out"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex flex-col items-center gap-4 rounded-2xl bg-card/90 px-8 py-6 shadow-lg border border-border/50"
            >
              <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-sm font-medium text-foreground">Logging out…</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Navigation */}
      {!isImmersive && (
      <nav className="bg-background/95 backdrop-blur-sm border-b border-border/40 relative z-[9998]" style={{ position: 'relative' }}>
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20 gap-3">
            {/* Logo: left on all breakpoints */}
            <Link
              href="/practice"
              className="flex items-center min-w-0 shrink-0 text-foreground hover:opacity-80 transition-opacity"
              aria-label="ActorRise Home"
            >
              <BrandLogo size="header" />
            </Link>

            {/* Desktop Navigation - centered */}
            <div className="hidden md:flex items-center justify-center gap-1 lg:gap-2 flex-1">
              {navItems.map((item, index) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const isPrimary = index === 0;
                return (
                  <Button
                    key={item.href}
                    asChild
                    variant={isActive ? "outline" : "ghost"}
                    size="sm"
                    className={`gap-1.5 lg:gap-2 rounded-full px-2.5 lg:px-4 text-xs lg:text-sm ${
                      isActive
                        ? "bg-primary/10 text-primary border-primary/40 hover:bg-primary/15 hover:text-primary"
                        : ""
                    }`}
                  >
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      <span className={`hidden sm:inline ${isActive || isPrimary ? "font-semibold" : ""}`}>{item.label}</span>
                    </Link>
                  </Button>
                );
              })}
              {user?.is_moderator && (
                <Button
                  asChild
                  variant={pathname.startsWith("/admin") ? "outline" : "ghost"}
                  size="sm"
                  className="gap-1.5 lg:gap-2 rounded-full px-2.5 lg:px-4 text-xs lg:text-sm"
                >
                  <Link href="/admin">
                    <IconShieldCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Link>
                </Button>
              )}
            </div>

            {/* Desktop Profile Dropdown - right aligned */}
            <div className="hidden md:flex items-center gap-1">
              <Button
                asChild
                variant={pathname === "/help" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9"
              >
                <Link href="/help" aria-label="Help">
                  <IconHelpCircle className="h-4 w-4" />
                  <span className="sr-only">Help</span>
                </Link>
              </Button>
              <ThemeToggle />
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="gap-2.5 rounded-full border border-border/60 bg-card/60 px-4 py-2 h-10 min-w-[2.5rem] min-h-10"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden bg-foreground text-background text-xs font-medium">
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
                  <span className="hidden lg:inline text-sm font-medium text-foreground truncate max-w-[8rem] min-w-[5rem]">
                    {displayName || "Account"}
                  </span>
                  <IconChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0 ${
                      profileDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </Button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border/50 bg-card/95 backdrop-blur-sm shadow-lg shadow-black/40 z-[9999]">
                    <div className="p-3">
                      <div className="flex items-center gap-4 rounded-xl bg-muted/60 px-4 py-4 mb-3">
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
                          <div className="flex items-center justify-center h-11 w-11 rounded-full bg-foreground text-background text-sm font-medium">
                            {profileInitial}
                          </div>
                        )}
                        <div className="min-w-0 flex flex-col gap-1.5">
                          <p className="text-sm font-semibold leading-tight truncate text-foreground">
                            {displayName ? profileLabel : "Your account"}
                          </p>
                          {!displayName && (
                            <Link
                              href="/profile"
                              onClick={() => setProfileDropdownOpen(false)}
                              className="text-xs text-primary hover:underline"
                            >
                              Add your name & photo →
                            </Link>
                          )}
                          <PlanBadge
                            planName={userTier}
                            variant="secondary"
                            showIcon={false}
                            className="h-5 px-2 text-[10px] font-medium uppercase tracking-wide self-start w-fit"
                          />
                        </div>
                      </div>

                      <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Profile
                      </p>
                      <Link
                        href="/profile"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconUser className="h-4 w-4 text-muted-foreground" />
                        <span>Edit profile</span>
                      </Link>
                      {user?.is_founding_actor && (
                        <Link
                          href="/founding-actor"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                        >
                          <IconStar className="h-4 w-4 text-muted-foreground" />
                          <span>My founding page</span>
                        </Link>
                      )}

                      <p className="px-2 py-1.5 mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Billing & settings
                      </p>
                      <Link
                        href="/billing"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconCreditCard className="h-4 w-4 text-muted-foreground" />
                        <span>Billing</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconSettings className="h-4 w-4 text-muted-foreground" />
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
                            className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                          >
                            <IconShieldCheck className="h-4 w-4 text-muted-foreground" />
                            <span>Admin</span>
                          </Link>
                        </>
                      )}

                      <div className="my-2 h-px bg-border/40" />

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          void logout();
                        }}
                        disabled={isLoggingOut}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg hover:bg-muted/60 transition-colors text-left text-destructive disabled:opacity-70 disabled:pointer-events-none"
                      >
                        {isLoggingOut ? (
                          <IconLoader2 className="h-4 w-4 animate-spin shrink-0" />
                        ) : (
                          <IconLogout className="h-4 w-4 shrink-0" />
                        )}
                        <span>{isLoggingOut ? "Logging out…" : "Log out"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile: center primary action(s) so header doesn’t feel empty; menu on the right */}
            <div className="md:hidden flex flex-1 items-center justify-center min-w-0">
              <Button
                asChild
                variant={pathname === "/monologues" ? "outline" : "ghost"}
                size="sm"
                className="gap-2 rounded-full px-4"
              >
                <Link href="/monologues">
                  <IconSearch className="h-4 w-4" />
                  <span className="text-sm">Monologues</span>
                </Link>
              </Button>
            </div>

            {/* Mobile menu: theme toggle + hamburger on far right */}
            <div className="md:hidden flex items-center gap-0.5 shrink-0">
              <ThemeToggle />
              <div ref={mobileMenuRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              >
                <IconMenu className="h-5 w-5" />
              </Button>

              {/* Mobile Navigation - fixed below header so position is correct */}
              {mobileMenuOpen && (
            <div className="fixed left-0 right-0 top-[5rem] z-[9997] border-b border-border bg-background shadow-[0_8px_24px_rgba(0,0,0,0.25)] rounded-b-xl overflow-y-auto max-h-[calc(100dvh-5rem)] animate-in slide-in-from-top-2 duration-200 md:hidden">
              <div className="py-3 px-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Button
                      key={item.href}
                      asChild
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className="w-full justify-start gap-2"
                    >
                      <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </Button>
                  );
                })}
                {user?.is_moderator && (
                  <Button
                    asChild
                    variant={pathname.startsWith("/admin") ? "default" : "ghost"}
                    size="sm"
                    className="w-full justify-start gap-2"
                  >
                    <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                      <IconShieldCheck className="h-4 w-4" />
                      Admin
                    </Link>
                  </Button>
                )}

                {/* Secondary links only in hamburger; Account is in bottom nav */}
                {/* Bookmarks Link */}
                <Button
                  asChild
                  variant={pathname === "/monologues" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-between gap-2"
                >
                  <Link href="/monologues" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <IconBookmark className="h-4 w-4" />
                      Saved
                    </div>
                    <span className="min-w-[1.75rem] flex justify-end">
                      {!isLoadingBookmarks && !isLoadingFilmTvFavorites && savedCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {savedCount}
                        </Badge>
                      )}
                    </span>
                  </Link>
                </Button>

                {/* Billing Link */}
                <Button
                  asChild
                  variant={pathname === "/billing" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Link href="/billing" onClick={() => setMobileMenuOpen(false)}>
                    <IconCreditCard className="h-4 w-4" />
                    Billing
                  </Link>
                </Button>

                {/* Account settings */}
                <Button
                  asChild
                  variant={pathname === "/settings" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Link href="/settings" onClick={() => setMobileMenuOpen(false)}>
                    <IconSettings className="h-4 w-4" />
                    Account settings
                  </Link>
                </Button>

                {/* Help */}
                <Button
                  asChild
                  variant={pathname === "/help" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Link href="/help" onClick={() => setMobileMenuOpen(false)}>
                    <IconHelpCircle className="h-4 w-4" />
                    Help
                  </Link>
                </Button>

                {/* What's New */}
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Link href="/changelog" onClick={() => setMobileMenuOpen(false)}>
                    <IconRocket className="h-4 w-4" />
                    What&apos;s New
                  </Link>
                </Button>
                {/* Contact */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setContactOpen(true);
                  }}
                >
                  <IconMail className="h-4 w-4" />
                  Contact & feedback
                </Button>

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void logout();
                    setMobileMenuOpen(false);
                  }}
                  disabled={isLoggingOut}
                  className="w-full justify-start gap-2"
                >
                  {isLoggingOut ? (
                    <IconLoader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <IconLogout className="h-4 w-4 shrink-0" />
                  )}
                  {isLoggingOut ? "Logging out…" : "Logout"}
                </Button>
              </div>
            </div>
              )}
            </div>
            </div>
        </div>
        </div>
      </nav>
      )}

      {/* Main Content - extra padding on mobile so content scrolls above bottom nav */}
      <main className={isImmersive ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0"}>
        {isImmersive ? children : <PageTransition transitionKey={pathname}>{children}</PageTransition>}
      </main>

      {/* Mobile Bottom Navigation - one-thumb access to primary actions */}
      {!isImmersive && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[9998] bg-background/95 backdrop-blur-sm border-t border-border/40 safe-area-bottom"
      >
        <div className="flex items-stretch justify-around min-h-[48px]">
          <Link
            href="/rehearse"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/rehearse" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconBookmark className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">Collection</span>
          </Link>
          <Link
            href="/practice"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/practice" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconMicrophone className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">My Scripts</span>
          </Link>
          <Link
            href="/monologues"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/monologues" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconQuote className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">Monologues</span>
          </Link>
          <Link
            href="/profile"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/profile" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {headshotUrl ? (
              <Image
                src={headshotUrl}
                alt=""
                width={24}
                height={24}
                className="rounded-full object-cover h-6 w-6 shrink-0"
                unoptimized
                onError={() => setHeadshotFailed(true)}
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-medium shrink-0">
                {profileInitial}
              </span>
            )}
            <span className="text-[10px] font-medium">Account</span>
          </Link>
        </div>
      </nav>
      )}

      <OnboardingWizard />
      <ProfileBackfillCard />
      <PWARegister />
      <FirstRehearsalGate />
      <AnimatePresence>
        {showWelcome && (
          <WelcomeFlow onDismiss={async () => { setShowWelcome(false); await refreshUser(); }} />
        )}
      </AnimatePresence>
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

