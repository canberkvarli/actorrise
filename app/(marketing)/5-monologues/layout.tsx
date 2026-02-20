import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "5 Monologues Casting Directors Would Rather See",
  description:
    "Get a free curated list of fresh monologues, the kind that make casting directors sit up. Enter your email for the list and find them on ActorRise.",
  openGraph: {
    title: "5 Monologues Casting Directors Would Rather See | ActorRise",
    description:
      "Fresh monologues casting directors want to see. Free curated list + links to find them on ActorRise.",
    url: `${siteUrl}/5-monologues`,
  },
  alternates: { canonical: `${siteUrl}/5-monologues` },
};

export default function FiveMonologuesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
