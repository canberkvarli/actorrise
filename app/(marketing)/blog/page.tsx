import type { Metadata } from "next";
import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blog/posts";

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogIndexPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Blog
      </h1>
      <p className="text-lg text-muted-foreground mb-12">
        Practical writing for actors on choosing monologues, prepping auditions, and rehearsing
        smarter. Written by an actor, not a marketing team.
      </p>

      <ul className="space-y-8">
        {BLOG_POSTS.map((post) => (
          <li key={post.slug} className="border-b border-border/60 pb-8 last:border-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              {formatDate(post.date)} · {post.readingMinutes} min read
            </p>
            <h2 className="text-xl md:text-2xl font-semibold tracking-tight mb-2">
              <Link href={`/blog/${post.slug}`} className="text-foreground hover:text-primary transition-colors">
                {post.title}
              </Link>
            </h2>
            <p className="text-muted-foreground">{post.excerpt}</p>
            <Link
              href={`/blog/${post.slug}`}
              className="inline-block mt-3 text-sm text-primary font-medium hover:underline"
            >
              Read more
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
