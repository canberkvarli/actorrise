import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // SEO-tool crawlers, shut out. On 2026-10-01 AhrefsBot made 10,852 of
      // the 12,500 hits on /monologues/[slug] in 31 hours (Google: 51). Each
      // hit on an uncached page is an ISR write on Vercel, and those were
      // 362k a month against the 200k the Hobby plan allows. Neither bot sends
      // an actor here; they crawl for their own backlink indexes. Ahrefs'
      // own data about this site is read through its API, not its crawler.
      { userAgent: ["AhrefsBot", "SemrushBot"], disallow: ["/"] },
      {
        userAgent: "*",
        // Explicitly allow the marketing /monologues* pages. A bare `Disallow: /monologues`
        // matches by prefix, which would also block these crawl-worthy pages.
        allow: ["/", "/monologues/", "/monologues-for-men", "/monologues-for-women"],
        // `/monologues$` blocks only the exact auth-walled app search route (Googlebot/Bingbot
        // honor `$`); the allows above keep every /monologues/* category page crawlable.
        disallow: ["/practice", "/monologues$", "/profile", "/billing", "/checkout", "/auth", "/login", "/signup", "/opengraph-image"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
