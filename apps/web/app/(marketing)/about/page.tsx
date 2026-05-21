import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "About",
  description:
    "ActorRise was built by Canberk Varli, an actor and software engineer, to give actors more time for the work that matters.",
  openGraph: {
    title: "About | ActorRise",
    description: "Built by an actor who believes technology should support the art, not get in the way of it.",
    url: `${siteUrl}/about`,
  },
  alternates: { canonical: `${siteUrl}/about` },
};

export default function AboutPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-8 font-brand">
        About ActorRise
      </h1>

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <p className="text-base md:text-lg leading-relaxed">
          I&apos;m Canberk. I act with Inferno Theater in Berkeley and I&apos;m also a software engineer.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          I built ActorRise because I kept losing entire days to finding audition monologues instead of
          actually rehearsing them. The math didn&apos;t make sense: 6 hours searching, 2 hours rehearsing.
          That&apos;s backwards.
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          So I built the tool I wished I had. You describe what you need, it finds the right piece,
          and you get back to the actual work: rehearsing, acting, getting ready.
        </p>
        <p className="text-base md:text-lg leading-relaxed font-medium text-foreground">
          The goal isn&apos;t to replace the art. It&apos;s to give you more time for it.
        </p>
      </div>

      {/* Launch badges */}
      <div className="mt-12 pt-8 border-t border-border/60">
        <p className="text-xs text-muted-foreground mb-4">Featured on</p>
        <div className="flex flex-wrap items-center gap-4">
          <a href="https://www.producthunt.com/products/actorrise?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-actorrise" target="_blank" rel="noopener noreferrer">
            <img
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1078076&theme=dark&t=1773031056919"
              alt="ActorRise on Product Hunt"
              className="h-[40px] w-auto"
            />
          </a>
          <a href="https://fazier.com/launches/www.actorrise.com" target="_blank" rel="noopener noreferrer">
            <img
              src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=dark"
              width={150}
              alt="Fazier badge"
              className="h-[40px] w-auto"
            />
          </a>
          <a href="https://peerlist.io/canberkvarli/project/actorrise" target="_blank" rel="noreferrer">
            <img
              src="https://peerlist.io/api/v1/projects/embed/PRJHKKDKE6P6NPEPG3DRRAQ68J9OBR?showUpvote=false&theme=dark"
              alt="ActorRise on Peerlist"
              className="h-[40px] w-auto"
            />
          </a>
        </div>
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/sources" className="text-primary hover:underline">
          Sources & copyright
        </Link>
        {" · "}
        <Link href="/contact" className="text-primary hover:underline">
          Contact
        </Link>
      </p>
    </div>
  );
}
