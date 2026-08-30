import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Actors",
  description:
    "The actors who backed ActorRise from day one. They shape the platform, tell me what's broken, and help build something that actually serves the craft.",
  openGraph: {
    title: "Actors | ActorRise",
    description:
      "The actors who backed ActorRise from day one. They shape the platform and help build something that actually serves the craft.",
    url: `${siteUrl}/actors`,
  },
  alternates: { canonical: `${siteUrl}/actors` },
};

export default function ActorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
