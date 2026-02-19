"use client";

import { useAuth } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { IconChartBar, IconShieldCheck, IconFileSearch, IconDeviceTv } from "@tabler/icons-react";

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
      router.replace("/dashboard");
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
    { href: "/admin/moderation", label: "Moderation", icon: IconShieldCheck },
    { href: "/admin/monologues", label: "Monologues", icon: IconFileSearch },
    { href: "/admin/film-tv", label: "Film/TV", icon: IconDeviceTv },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/40 bg-card/30">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold text-foreground mb-4">Admin</h1>
          <div className="flex gap-2">
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
                  className="gap-2"
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
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
