"use client";

import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconHome, IconSearch, IconUser, IconLogout, IconLoader2, IconMenu, IconBookmark, IconChevronDown, IconCreditCard, IconMask, IconVideo, IconSparkles, IconFileText, IconMail, IconSettings, IconShieldCheck, IconRocket } from "@tabler/icons-react";
import { PlanBadge } from "@/components/billing/PlanBadge";
import { useState, useEffect, useRef, Suspense } from "react";
import { useBookmarkCount } from "@/hooks/useBookmarkCount";
import { useFilmTvFavoriteCount } from "@/hooks/useFilmTvFavorites";
import { useProfile } from "@/hooks/useDashboardData";
import { ContactModal } from "@/components/contact/ContactModal";
import { SWRConfig } from "swr";
import { useSubscription } from "@/hooks/useSubscription";
import { AnimatePresence, motion } from "framer-motion";
import { WelcomeFlow } from "@/components/onboarding/WelcomeFlow";
import { ChangelogModal } from "@/components/ChangelogModal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageTransition } from "@/components/transition/PageTransition";
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
  const { user, loading, isLoggingOut, logout, refreshUser } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [changelogModalEntry, setChangelogModalEntry] = useState<ChangelogEntry | null>(null);
  const { count: bookmarkCount, isLoading: isLoadingBookmarks } = useBookmarkCount();
  const { count: filmTvFavoriteCount, isLoading: isLoadingFilmTvFavorites } = useFilmTvFavoriteCount();
  const savedCount = bookmarkCount + filmTvFavoriteCount;
  const { data: profile } = useProfile();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const displayName = profile?.name?.trim() || user?.name?.trim() || "";
  const profileLabel = displayName || "Account";
  const profileInitial = displayName
    ? displayName.trim().split(/\s+/).length >= 2
      ? `${displayName.trim().split(/\s+/)[0][0]}${displayName.trim().split(/\s+/)[1][0]}`.toUpperCase()
      : displayName.trim().slice(0, 2).toUpperCase()
    : (user?.email || "?").charAt(0).toUpperCase();
  const headshotUrl = profile?.headshot_url ? cleanImageUrl(profile.headshot_url) : null;

  // Use SWR hook for cached subscription data - MUST be called before any early returns
  const { subscription } = useSubscription();
  const userTier = subscription?.tier_name || "free";

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

  // Show welcome flow for new users who haven't seen it
  useEffect(() => {
    if (!loading && user && user.has_seen_welcome === false) {
      const timer = setTimeout(() => setShowWelcome(true), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, user]);

  // Show changelog modal when user has not seen the latest feature (after welcome, 1s delay)
  useEffect(() => {
    if (loading || !user || showWelcome) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      fetch("/changelog.json")
        .then((res) => res.ok ? res.json() : null)
        .then((data: { updates?: ChangelogEntry[] } | null) => {
          if (cancelled || !data?.updates?.length) return;
          const latest = getLatestModalEntry(data.updates);
          if (latest && latest.id !== getLastSeenId()) {
            setChangelogModalEntry(latest);
            setShowChangelogModal(true);
          }
        })
        .catch(() => {});
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [loading, user, showWelcome]);

  // Note: Route protection is handled by middleware
  // Single branded loading state so post–sign-in feels like one flow (no "Loading..." then "Loading your dashboard...")
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <IconSparkles className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-muted-foreground font-medium">Loading your dashboard…</p>
      </div>
    );
  }

  const navItems = [
    { href: "/dashboard", label: "Home", icon: IconHome },
    { href: "/search", label: "MonologueMatch", icon: IconSearch },
    { href: "/my-scripts", label: "ScenePartner", icon: IconMask },
    { href: "/audition", label: "Audition Mode", icon: IconVideo },
  ];
  const isImmersiveRehearsal = /^\/scenes\/[^/]+\/rehearse$/.test(pathname || "");

  return (
    <>
    <Suspense fallback={null}>
      <LastAuthProviderSync />
    </Suspense>
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60000, // 1 minute
      }}
    >
    <TooltipProvider>
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
      {!isImmersiveRehearsal && (
      <nav className="bg-background/95 backdrop-blur-sm border-b border-border/40 relative z-[9998]" style={{ position: 'relative' }}>
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20 gap-3">
            <Link
              href="/dashboard"
              className="flex items-center min-w-0 shrink text-foreground hover:opacity-80 transition-opacity"
              aria-label="ActorRise Home"
            >
              <BrandLogo size="header" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                const isHomeOnDashboard = item.href === "/dashboard" && pathname === "/dashboard";
                return (
                  <Button
                    key={item.href}
                    asChild={!isHomeOnDashboard}
                    variant={isActive ? "outline" : "ghost"}
                    size="sm"
                    className="gap-2 rounded-full px-4 text-sm"
                  >
                    {isHomeOnDashboard ? (
                      <span className="flex items-center gap-2 cursor-default">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </span>
                    ) : (
                      <Link href={item.href}>
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    )}
                  </Button>
                );
              })}
              {user?.is_moderator && (
                <Button
                  asChild
                  variant={pathname.startsWith("/admin") ? "outline" : "ghost"}
                  size="sm"
                  className="gap-2 rounded-full px-4 text-sm"
                >
                  <Link href="/admin">
                    <IconShieldCheck className="h-4 w-4" />
                    Admin
                  </Link>
                </Button>
              )}

              {/* Profile Dropdown */}
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

                      <p className="px-2 py-1.5 mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Content
                      </p>
                      <Link
                        href="/my-monologues"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <IconBookmark className="h-4 w-4 text-muted-foreground" />
                          <span>Saved</span>
                        </div>
                        <span className="min-w-[1.75rem] flex justify-end">
                          {isLoadingBookmarks || isLoadingFilmTvFavorites ? null : savedCount > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              {savedCount}
                            </Badge>
                          ) : null}
                        </span>
                      </Link>
                      <Link
                        href="/my-scripts"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconFileText className="h-4 w-4 text-muted-foreground" />
                        <span>Your scripts</span>
                      </Link>
                      <Link
                        href="/my-submissions"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconFileText className="h-4 w-4 text-muted-foreground" />
                        <span>My submissions</span>
                      </Link>
                      {user?.is_moderator && (
                        <Link
                          href="/admin"
                          onClick={() => setProfileDropdownOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                        >
                          <IconShieldCheck className="h-4 w-4 text-muted-foreground" />
                          <span>Admin</span>
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

                      <p className="px-2 py-1.5 mt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Support
                      </p>
                      <Link
                        href="/changelog"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconRocket className="h-4 w-4 text-muted-foreground" />
                        <span>What&apos;s New</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          setContactOpen(true);
                        }}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg hover:bg-muted/60 transition-colors w-full text-left"
                      >
                        <IconMail className="h-4 w-4 text-muted-foreground" />
                        <span>Contact & feedback</span>
                      </button>

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

            {/* Mobile menu: button + dropdown (click outside to close) */}
            <div ref={mobileMenuRef} className="md:hidden flex flex-col flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <IconMenu className="h-5 w-5" />
              </Button>

              {/* Mobile Navigation */}
              {mobileMenuOpen && (
            <div className="border-t border-border/40 overflow-hidden animate-in slide-in-from-top-2 duration-200">
              <div className="py-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  const isHomeOnDashboard = item.href === "/dashboard" && pathname === "/dashboard";
                  return (
                    <Button
                      key={item.href}
                      asChild={!isHomeOnDashboard}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className="w-full justify-start gap-2"
                    >
                      {isHomeOnDashboard ? (
                        <span className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </span>
                      ) : (
                        <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      )}
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
                  variant={pathname === "/my-monologues" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-between gap-2"
                >
                  <Link href="/my-monologues" onClick={() => setMobileMenuOpen(false)} className="flex items-center justify-between w-full">
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

                {/* Your Scripts Link */}
                <Button
                  asChild
                  variant={pathname === "/my-scripts" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Link href="/my-scripts" onClick={() => setMobileMenuOpen(false)}>
                    <IconFileText className="h-4 w-4" />
                    Your Scripts
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
      </nav>
      )}

      {/* Main Content - extra padding on mobile so content scrolls above bottom nav */}
      <main className={isImmersiveRehearsal ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0"}>
        {isImmersiveRehearsal ? children : <PageTransition transitionKey={pathname}>{children}</PageTransition>}
      </main>

      {/* Mobile Bottom Navigation - one-thumb access to primary actions */}
      {!isImmersiveRehearsal && (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[9998] bg-background/95 backdrop-blur-sm border-t border-border/40 safe-area-bottom"
      >
        <div className="flex items-stretch justify-around min-h-[48px]">
          <Link
            href="/dashboard"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/dashboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconHome className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>
          <Link
            href="/search"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/search" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconSearch className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">Search</span>
          </Link>
          <Link
            href="/my-scripts"
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[48px] transition-colors ${
              pathname === "/my-scripts" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <IconMask className="h-5 w-5 shrink-0" />
            <span className="text-[10px] font-medium">Scenes</span>
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
              markAsSeen(changelogModalEntry.id);
            }
            setShowChangelogModal(open);
          }}
          entry={changelogModalEntry}
          onDismiss={() => {
            markAsSeen(changelogModalEntry.id);
            setShowChangelogModal(false);
          }}
        />
      )}
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </div>
    </TooltipProvider>
    </SWRConfig>
    </>
  );
}

