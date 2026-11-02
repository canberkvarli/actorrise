import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { ContentT } from "@/components/seo/ContentT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Blog: Audition & Monologue Tips for Actors",
  description:
    "Practical writing for actors on choosing monologues, prepping auditions, and rehearsing smarter. From an actor building ActorRise.",
  openGraph: {
    title: "ActorRise Blog",
    description:
      "Practical writing for actors on choosing monologues, prepping auditions, and rehearsing smarter.",
    url: `${siteUrl}/blog`,
  },
  twitter: {
    card: "summary_large_image",
    title: "ActorRise Blog",
    description:
      "Practical writing for actors on choosing monologues, prepping auditions, and rehearsing smarter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/blog` },
};

export default function BlogIndexPage() {
  return (
    <>
      <StageHero
        direction={<T k="contentBlog.direction" />}
        title={<T k="contentBlog.title" />}
        lede={<T k="contentBlog.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <ul className="space-y-8">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug} className="border-b border-border/60 pb-8 last:border-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              <SeoT k="contentBlog.meta" dates={{ date: post.date }} vars={{ minutes: post.readingMinutes }} />
            </p>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-2">
              <Link prefetch={false} href={`/blog/${post.slug}`} className="text-foreground hover:text-primary transition-colors">
                <ContentT k={`contentBlog.posts.${post.slug}.title`} fallback={post.title} />
              </Link>
            </h2>
            <p className="text-muted-foreground">
              <ContentT k={`contentBlog.posts.${post.slug}.excerpt`} fallback={post.excerpt} />
            </p>
            <Link prefetch={false}
              href={`/blog/${post.slug}`}
              className="inline-block mt-3 text-sm text-primary font-medium hover:underline"
            >
              <T k="contentBlog.readMore" />
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </>
  );
}
