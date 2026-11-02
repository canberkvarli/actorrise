import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

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
  twitter: {
    card: "summary_large_image",
    title: "About | ActorRise",
    description:
      "Built by an actor who believes technology should support the art, not get in the way of it.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/about` },
};

export default function AboutPage() {
  return (
    <>
      <StageHero
        direction="(enter, stage left: the founder.)"
        title={
          <>
            <T k="marketingAbout.titleA" />
            <em className="italic text-primary"><T k="marketingAbout.titleB" /></em>
            <T k="marketingAbout.titleC" />
          </>
        }
        lede={<T k="marketingAbout.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-muted-foreground">
        <p className="text-base md:text-lg leading-relaxed">
          <T k="marketingAbout.p1" />
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          <T k="marketingAbout.p2" />
        </p>
        <p className="text-base md:text-lg leading-relaxed">
          <T k="marketingAbout.p3" />
        </p>
        <p className="text-base md:text-lg leading-relaxed font-medium text-foreground">
          <T k="marketingAbout.p4" />
        </p>
      </div>

      {/* Launch badges */}
      <div className="mt-12 pt-8 border-t border-border/60">
        <p className="text-xs text-muted-foreground mb-4"><T k="marketingAbout.featuredOn" /></p>
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
        <Link prefetch={false} href="/sources" className="text-primary hover:underline">
          <T k="marketingFooter.sources" />
        </Link>
        {" · "}
        <Link prefetch={false} href="/contact" className="text-primary hover:underline">
          <T k="marketingFooter.contact" />
        </Link>
      </p>
      </div>
    </>
  );
}
