"use client";

import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconHome, IconSearch, IconUser, IconLogout, IconMenu, IconBookmark, IconChevronDown, IconCreditCard, IconMask, IconVideo } from "@tabler/icons-react";
import { PlanBadge } from "@/components/billing/PlanBadge";
import { useState, useEffect, useRef } from "react";
import { useBookmarkCount } from "@/hooks/useBookmarkCount";
import { useProfile } from "@/hooks/useDashboardData";
import { SWRConfig } from "swr";
import { useSubscription } from "@/hooks/useSubscription";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function cleanImageUrl(url: string) {
  return url.trim().split("?")[0].split("#")[0];
}

// Create a client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const { count: bookmarkCount } = useBookmarkCount();
  const { data: profile } = useProfile();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const displayName = profile?.name?.trim() || user?.name?.trim() || user?.email?.trim() || "";
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileDropdownOpen]);

  // Note: Route protection is handled by middleware
  // This check is just for UI state while loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    { href: "/dashboard", label: "Home", icon: IconHome },
    { href: "/search", label: "MonologueMatch", icon: IconSearch },
    { href: "/my-scripts", label: "ScenePartner", icon: IconMask },
    { href: "/audition", label: "Audition Mode", icon: IconVideo },
  ];

  return (
    <QueryClientProvider client={queryClient}>
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60000, // 1 minute
      }}
    >
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <nav className="bg-background/95 backdrop-blur-sm border-b border-border/40 relative z-[9998]" style={{ position: 'relative' }}>
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20">
            {pathname === "/dashboard" ? (
              <span className="flex items-center gap-2.5 text-foreground cursor-default">
                <Image src="/logo.png" alt="ActorRise" width={32} height={32} className="rounded-md" />
                <span className="font-brand text-2xl font-semibold text-foreground">ActorRise</span>
              </span>
            ) : (
              <Link href="/dashboard" className="flex items-center gap-2.5 text-foreground hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="ActorRise" width={32} height={32} className="rounded-md" />
                <span className="font-brand text-2xl font-semibold text-foreground">ActorRise</span>
              </Link>
            )}

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

              {/* Profile Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="gap-2.5 rounded-full border border-border/60 bg-card/60 px-4 py-2 h-10 min-w-[2.5rem]"
                >
                  {headshotUrl ? (
                    <Image
                      src={headshotUrl}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full object-cover h-7 w-7"
                    />
                  ) : (
                    <span className="flex items-center justify-center h-7 w-7 rounded-full bg-foreground text-background text-xs font-medium">
                      {profileInitial}
                    </span>
                  )}
                  {displayName && (
                    <span className="hidden lg:inline text-sm font-medium text-foreground truncate max-w-[8rem]">
                      {displayName}
                    </span>
                  )}
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
                      <div className="flex items-center gap-4 rounded-lg bg-muted/60 px-4 py-4 mb-3">
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
                        <div className="min-w-0 flex flex-col gap-1">
                          <p className="text-sm font-semibold leading-tight truncate text-foreground">
                            {profileLabel}
                          </p>
                          <PlanBadge
                            planName={userTier}
                            variant="secondary"
                            showIcon={false}
                            className="h-5 px-2 text-[10px] font-medium uppercase tracking-wide"
                          />
                        </div>
                      </div>

                      <Link
                        href="/profile"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconUser className="h-4 w-4 text-muted-foreground" />
                        <span>Edit profile</span>
                      </Link>

                      <Link
                        href="/my-monologues"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="mt-0.5 flex items-center justify-between gap-2 px-4 py-3 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <IconBookmark className="h-4 w-4 text-muted-foreground" />
                          <span>Your monologues</span>
                        </div>
                        {bookmarkCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {bookmarkCount}
                          </Badge>
                        )}
                      </Link>

                      <Link
                        href="/billing"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="mt-0.5 flex items-center gap-3 px-4 py-3 text-sm rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <IconCreditCard className="h-4 w-4 text-muted-foreground" />
                        <span>Billing</span>
                      </Link>

                      <div className="my-2 h-px bg-border/40" />

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm rounded-lg hover:bg-muted/60 transition-colors text-left text-destructive"
                      >
                        <IconLogout className="h-4 w-4" />
                        <span>Log out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <IconMenu className="h-5 w-5" />
            </Button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border/40 overflow-hidden animate-in slide-in-from-top-2 duration-200">
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

                {/* Profile Link */}
                <Button
                  asChild
                  variant={pathname === "/profile" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                    <IconUser className="h-4 w-4" />
                    Edit Profile
                  </Link>
                </Button>

                {/* Bookmarks Link */}
                <Button
                  asChild
                  variant={pathname === "/my-monologues" ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-between gap-2"
                >
                  <Link href="/my-monologues" onClick={() => setMobileMenuOpen(false)}>
                    <div className="flex items-center gap-2">
                      <IconBookmark className="h-4 w-4" />
                      Your Monologues
                    </div>
                    {bookmarkCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {bookmarkCount}
                      </Badge>
                    )}
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

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full justify-start gap-2"
                >
                  <IconLogout className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main>
        {children}
      </main>
    </div>
    </SWRConfig>
    </QueryClientProvider>
  );
}

