import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
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
