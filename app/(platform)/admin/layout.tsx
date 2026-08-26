"use client";

import { useAuth } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  IconChartBar,
  IconFileSearch,
  IconUsers,
  IconMail,
  IconStar,
  IconSearch,
  IconMicrophone,
  IconMessageReport,
} from "@tabler/icons-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof IconChartBar;
  badgeKey?: "feedback";
};

type NavGroup = { title: string; items: NavItem[] };

// Ordered by what actually gets used. Search + Sessions + Feedback are the daily
// drivers, so they sit at the top under Pulse. Moderation and the monologue
// review queue were removed — retired, not hidden.
const GROUPS: NavGroup[] = [
  {
    title: "Pulse",
    items: [
      { href: "/admin", label: "Overview", icon: IconChartBar },
      { href: "/admin/searches", label: "Search", icon: IconSearch },
      { href: "/admin/sessions", label: "Sessions", icon: IconMicrophone },
      { href: "/admin/feedback", label: "Feedback", icon: IconMessageReport, badgeKey: "feedback" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: IconUsers },
      { href: "/admin/founding-actors", label: "Founding actors", icon: IconStar },
    ],
  },
  {
    title: "Library",
    items: [{ href: "/admin/content", label: "Content", icon: IconFileSearch }],
  },
  {
    title: "Comms",
    items: [{ href: "/admin/emails", label: "Emails", icon: IconMail }],
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

  // Unread negative-feedback count → nav badge. Polls so a fresh complaint shows
  // up without a reload. Cheap (single COUNT), only runs for moderators.
  const { data: fb } = useQuery({
    queryKey: ["admin-feedback-badge"],
    queryFn: async () => {
      const res = await api.get<{ unread: number }>("/api/admin/feedback/summary");
      return res.data;
    },
    enabled: !!user?.is_moderator,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const badges = { feedback: fb?.unread ?? 0 };

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

  const renderLink = (item: NavItem, layout: "side" | "strip") => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    const count = item.badgeKey ? badges[item.badgeKey] : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          "group relative flex items-center gap-2.5 text-sm transition-colors",
          layout === "side"
            ? "rounded-md px-3 py-2"
            : "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        ].join(" ")}
      >
        {layout === "side" && (
          <span
            className={[
              "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary transition-opacity",
              active ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        )}
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span>{item.label}</span>
        {count > 0 && (
          <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] lg:flex">
        {/* Sidebar — desktop */}
        <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 lg:border-r lg:border-border/40 lg:min-h-screen">
          <div className="px-5 py-5">
            <Link href="/admin" className="block">
              <p className="font-brand text-xl font-semibold tracking-[-0.02em] text-foreground">
                ActorRise
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-0.5">
                Admin
              </p>
            </Link>
          </div>
          <nav className="flex-1 space-y-6 px-3 pb-8">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => renderLink(item, "side"))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Top strip — mobile / tablet */}
        <div className="lg:hidden border-b border-border/40 bg-card/30">
          <div className="flex items-center justify-between px-4 pt-3">
            <p className="font-brand text-lg font-semibold tracking-[-0.02em]">
              ActorRise <span className="text-muted-foreground font-normal">Admin</span>
            </p>
          </div>
          <div className="-mx-0 overflow-x-auto scrollbar-hide px-4 py-3">
            <div className="flex gap-1.5 w-max">
              {GROUPS.flatMap((g) => g.items).map((item) => renderLink(item, "strip"))}
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
