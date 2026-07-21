"use client";

import { useAuth } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  IconChartBar,
  IconShieldCheck,
  IconFileSearch,
  IconUsers,
  IconMail,
  IconStar,
  IconSearch,
  IconMicrophone,
  IconClipboardCheck,
} from "@tabler/icons-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!user.is_moderator) {
      router.replace("/practice");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user?.is_moderator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  const tabs = [
    { href: "/admin", label: "Overview", icon: IconChartBar },
    { href: "/admin/users", label: "Users", icon: IconUsers },
    { href: "/admin/moderation", label: "Moderation", icon: IconShieldCheck },
    { href: "/admin/content", label: "Content", icon: IconFileSearch },
    { href: "/admin/monologues/review", label: "Review", icon: IconClipboardCheck },
    { href: "/admin/searches", label: "Searches", icon: IconSearch },
    { href: "/admin/sessions", label: "Sessions", icon: IconMicrophone },
    { href: "/admin/emails", label: "Emails", icon: IconMail },
    { href: "/admin/founding-actors", label: "Founding Actors", icon: IconStar },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/30">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <h1 className="font-brand text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-foreground mb-3 sm:mb-4">Admin</h1>
          <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 w-max sm:w-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive =
                  tab.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(tab.href);
                return (
                  <Button
                    key={tab.href}
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2 shrink-0 whitespace-nowrap"
                    asChild
                  >
                    <Link href={tab.href}>
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-4 sm:py-6">{children}</main>
    </div>
  );
}
