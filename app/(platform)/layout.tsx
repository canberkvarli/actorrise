"use client";

import { useAuth } from "@/lib/auth";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconHome, IconSearch, IconUser, IconLogout, IconMenu, IconBookmark, IconChevronDown, IconCreditCard, IconMask, IconVideo } from "@tabler/icons-react";
import { PlanBadge } from "@/components/billing/PlanBadge";
import { useState, useEffect, useRef } from "react";
import { useBookmarkCount } from "@/hooks/useBookmarkCount";
import { SWRConfig } from "swr";
import { useSubscription } from "@/hooks/useSubscription";

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  
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
    { href: "/dashboard", label: "Dashboard", icon: IconHome },
    { href: "/search", label: "MonologueMatch", icon: IconSearch },
    { href: "/scenes", label: "ScenePartner", icon: IconMask },
    { href: "/audition", label: "Audition Mode", icon: IconVideo },
  ];

  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60000, // 1 minute
      }}
    >
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-background/95 backdrop-blur-sm border-b border-border/40 relative z-[9998]" style={{ position: 'relative' }}>
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-20">
            <Link href="/dashboard" className="text-3xl font-bold tracking-tight hover:opacity-80 transition-opacity">
              ACTORRISE
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Button
                    key={item.href}
                    asChild
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </Button>
                );
              })}

              {/* Profile Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <Button
                  variant={pathname === "/profile" || pathname === "/my-monologues" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="gap-2"
                >
                  <IconUser className="h-4 w-4" />
                  Profile
                  <IconChevronDown className={`h-3 w-3 transition-transform ${profileDropdownOpen ? "rotate-180" : ""}`} />
                </Button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-background/95 backdrop-blur-sm border border-border/40 rounded-lg shadow-lg overflow-hidden z-[9999]">
                    <div className="py-1">
                      <div className="px-3 py-2 border-b border-border/30 bg-muted/50">
                        <p className="text-sm font-medium truncate">{user?.email}</p>
                        <div className="mt-1">
                          <PlanBadge planName={userTier} variant="outline" />
                        </div>
                      </div>

                      <Link
                        href="/profile"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        <IconUser className="h-4 w-4" />
                        Edit Profile
                      </Link>

                      <Link
                        href="/my-monologues"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
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

                      <Link
                        href="/billing"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        <IconCreditCard className="h-4 w-4" />
                        Billing
                      </Link>

                      <div className="border-t border-border/30 my-1" />

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                      >
                        <IconLogout className="h-4 w-4" />
                        Logout
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
  );
}

