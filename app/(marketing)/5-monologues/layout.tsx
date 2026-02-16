import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "5 Monologues Casting Directors Would Rather See",
  description:
    "Get a free curated list of fresh monologues, the kind that make casting directors sit up. Enter your email for the list and find them on ActorRise.",
  openGraph: {
    title: "5 Monologues Casting Directors Would Rather See | ActorRise",
    description:
      "Fresh monologues casting directors want to see. Free curated list + links to find them on ActorRise.",
  },
};

export default function FiveMonologuesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
