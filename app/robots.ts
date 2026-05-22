import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/practice", "/monologues", "/profile", "/billing", "/checkout", "/auth", "/login", "/signup", "/opengraph-image"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
