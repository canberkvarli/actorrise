import {
  IconBuilding,
  IconChartBar,
  IconClipboardCheck,
  IconFileSearch,
  IconInbox,
  IconMail,
  IconMessageReport,
  IconMicrophone,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";

/** Every key `/api/admin/pulse` returns. A nav badge may use no other. */
export const BADGE_KEYS = [
  "feedback",
  "review",
  "requests",
  "searches",
  "revenue",
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

/** Surfaces whose badge clears by visiting them (the `admin_seen` three). */
export const SEEN_SURFACES = ["requests", "searches", "revenue"] as const;

export type SeenSurface = (typeof SEEN_SURFACES)[number];

export type NavItem = {
  href: string;
  label: string;
  icon: typeof IconChartBar;
  badgeKey?: BadgeKey;
};

export type NavGroup = { title: string; items: NavItem[] };

// Ordered by what actually gets used. Search + Sessions + Feedback are the daily
// drivers, so they sit at the top under Pulse. Moderation was removed — retired,
// not hidden.
//
// The monologue review queue is back. It was retired while it sat empty, but the
// interleaved-dialogue and flattened-scene passes now route anything they cannot
// repair safely into it instead of guessing, so there is real work in there and
// it needs a way in. The badge is the point: a queue with no counter is a queue
// nobody opens.
//
// Requests is here for exactly that reason. It had no nav entry at all and lived
// as a tab inside Search, so fifteen titles actors asked for — one of them five
// months old — were never seen by anybody.
export const ADMIN_NAV: NavGroup[] = [
  {
    title: "Pulse",
    items: [
      { href: "/admin", label: "Overview", icon: IconChartBar, badgeKey: "revenue" },
      {
        href: "/admin/searches",
        label: "Search",
        icon: IconSearch,
        badgeKey: "searches",
      },
      { href: "/admin/sessions", label: "Sessions", icon: IconMicrophone },
      {
        href: "/admin/feedback",
        label: "Feedback",
        icon: IconMessageReport,
        badgeKey: "feedback",
      },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: IconUsers },
      { href: "/admin/organizations", label: "Organizations", icon: IconBuilding },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/admin/content", label: "Content", icon: IconFileSearch },
      {
        href: "/admin/requests",
        label: "Requests",
        icon: IconInbox,
        badgeKey: "requests",
      },
      {
        href: "/admin/monologues/review",
        label: "Review",
        icon: IconClipboardCheck,
        badgeKey: "review",
      },
    ],
  },
  {
    title: "Comms",
    items: [{ href: "/admin/emails", label: "Emails", icon: IconMail }],
  },
];

/** Overview is an exact match; everything else owns its subtree. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
