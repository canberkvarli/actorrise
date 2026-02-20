import type { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

/** Stable date for sitemap entries so crawlers get consistent signals (update when doing larger content refreshes). */
const lastMod = new Date("2025-02-19");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, lastModified: lastMod, changeFrequency: "weekly" as const, priority: 1 },
    { url: `${baseUrl}/monologue-finder`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.9 },
    { url: `${baseUrl}/audition-monologues`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.9 },
    { url: `${baseUrl}/audition-ai`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.9 },
    { url: `${baseUrl}/pricing`, lastModified: lastMod, changeFrequency: "weekly" as const, priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/changelog`, lastModified: lastMod, changeFrequency: "weekly" as const, priority: 0.8 },
    { url: `${baseUrl}/for-teachers`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/5-monologues`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/monologues/comedic-woman-under-2-minutes`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/monologues/dramatic-contemporary`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/monologues/classical-monologues`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.8 },
    { url: `${baseUrl}/contact`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${baseUrl}/sources`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${baseUrl}/privacy`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.5 },
    { url: `${baseUrl}/terms`, lastModified: lastMod, changeFrequency: "monthly" as const, priority: 0.5 },
  ];
}
