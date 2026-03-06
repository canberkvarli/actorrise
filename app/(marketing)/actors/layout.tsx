import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Founding Actors",
  description:
    "Meet the actors who believed in ActorRise from day one. They shape the platform, provide feedback, and help build something that truly serves the craft.",
  openGraph: {
    title: "Founding Actors | ActorRise",
    description:
      "Meet the actors who believed in ActorRise from day one. They shape the platform and help build something that truly serves the craft.",
    url: `${siteUrl}/actors`,
  },
  alternates: { canonical: `${siteUrl}/actors` },
};

export default function ActorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
