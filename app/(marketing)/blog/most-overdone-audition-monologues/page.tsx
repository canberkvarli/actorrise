import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const post = BLOG_POSTS.find((p) => p.slug === "most-overdone-audition-monologues")!;
const url = `${siteUrl}/blog/${post.slug}`;

export const metadata: Metadata = {
  title: post.title,
  description: post.excerpt,
  openGraph: {
    type: "article",
    title: post.title,
    description: post.excerpt,
    url,
    publishedTime: post.date,
  },
  twitter: {
    card: "summary_large_image",
    title: post.title,
    description: post.excerpt,
    images: ["/opengraph-image"],
  },
  alternates: { canonical: url },
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: post.title,
  description: post.excerpt,
  datePublished: post.date,
  dateModified: post.date,
  author: { "@type": "Person", name: "Canberk Varli", url: `${siteUrl}/about` },
  publisher: {
    "@type": "Organization",
    name: "ActorRise",
    logo: { "@type": "ImageObject", url: `${siteUrl}/icon-512.png` },
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
};

const H2 = "text-2xl font-semibold tracking-tight text-foreground pt-6";
const LINK = "text-foreground font-medium underline hover:no-underline";

function Bullet({ k }: { k: MessageKey }) {
  return (
    <li className="flex gap-2">
      <span className="text-primary">·</span>
      <span><T k={k} /></span>
    </li>
  );
}

function Tip({ title, body, slots }: { title: MessageKey; body: MessageKey; slots?: Record<string, React.ReactNode> }) {
  return (
    <li className="flex gap-2">
      <span className="text-primary">·</span>
      <span>
        <strong className="text-foreground"><T k={title} /></strong>{" "}
        <SeoT k={body} slots={slots} />
      </span>
    </li>
  );
}

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="contentOverdone.direction" />}
        title={
          <SeoT
            k="contentOverdone.title"
            slots={{ em: <em className="italic text-primary"><T k="contentOverdone.titleEm" /></em> }}
          />
        }
      />
      <article className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        <SeoT k="contentOverdone.meta" dates={{ date: post.date }} vars={{ minutes: post.readingMinutes }} />
      </p>

      <div className="space-y-5 text-muted-foreground leading-relaxed">
        <p><T k="contentOverdone.p1" /></p>

        <h2 className={H2}><T k="contentOverdone.h2Why" /></h2>
        <p><T k="contentOverdone.whyBody" /></p>

        <h2 className={H2}><T k="contentOverdone.h2Tell" /></h2>
        <ul className="space-y-2">
          <Bullet k="contentOverdone.tell1" />
          <Bullet k="contentOverdone.tell2" />
          <Bullet k="contentOverdone.tell3" />
          <Bullet k="contentOverdone.tell4" />
        </ul>
        <p><T k="contentOverdone.tellAfter" /></p>

        <h2 className={H2}><T k="contentOverdone.h2Classical" /></h2>
        <p><T k="contentOverdone.classicalIntro" /></p>
        <ul className="space-y-2">
          <Bullet k="contentOverdone.classical1" />
          <Bullet k="contentOverdone.classical2" />
          <Bullet k="contentOverdone.classical3" />
          <Bullet k="contentOverdone.classical4" />
          <Bullet k="contentOverdone.classical5" />
          <Bullet k="contentOverdone.classical6" />
        </ul>
        <p><T k="contentOverdone.classicalAfter" /></p>

        <h2 className={H2}><T k="contentOverdone.h2Screen" /></h2>
        <p><T k="contentOverdone.screenIntro" /></p>
        <ul className="space-y-2">
          <Bullet k="contentOverdone.screen1" />
          <Bullet k="contentOverdone.screen2" />
          <Bullet k="contentOverdone.screen3" />
          <Bullet k="contentOverdone.screen4" />
          <Bullet k="contentOverdone.screen5" />
        </ul>
        <p><T k="contentOverdone.screenAfter" /></p>

        <h2 className={H2}><T k="contentOverdone.h2Instead" /></h2>
        <p><T k="contentOverdone.insteadIntro" /></p>
        <ul className="space-y-3">
          <Tip
            title="contentOverdone.tip1Title"
            body="contentOverdone.tip1Body"
            slots={{
              link: (
                <Link prefetch={false} href="/monologue-finder" className={LINK}>
                  <T k="contentOverdone.tip1Link" />
                </Link>
              ),
            }}
          />
          <Tip title="contentOverdone.tip2Title" body="contentOverdone.tip2Body" />
          <Tip title="contentOverdone.tip3Title" body="contentOverdone.tip3Body" />
          <Tip
            title="contentOverdone.tip4Title"
            body="contentOverdone.tip4Body"
            slots={{
              link: (
                <Link prefetch={false} href="/scene-partner-ai" className={LINK}>
                  ScenePartner
                </Link>
              ),
            }}
          />
        </ul>
        <p><T k="contentOverdone.outro" /></p>
      </div>

      <div className="mt-12 pt-10 border-t border-border/60 flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/monologue-finder"><T k="contentOverdone.ctaFind" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
      </div>
    </article>
    </>
  );
}
