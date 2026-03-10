  import type { MetadataRoute } from "next";

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

  /** Stable date for sitemap entries so crawlers get consistent signals (update when doing larger content refreshes). */
  const lastMod = new Date("2026-03-06");

  export default function sitemap(): MetadataRoute.Sitemap {
    return [
      /* ── Core pages ─────────────────────────────────────────── */
      { url: baseUrl, lastModified: lastMod, changeFrequency: "weekly", priority: 1 },
      { url: `${baseUrl}/monologue-finder`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/audition-monologues`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/audition-ai`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/pricing`, lastModified: lastMod, changeFrequency: "weekly", priority: 0.9 },

      /* ── Keyword landing pages (monologues) ─────────────────── */
      { url: `${baseUrl}/shakespeare-monologues`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/dramatic-monologues`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/contemporary-monologues`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/monologues-for-women`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/monologues-for-men`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/monologues/comedic-woman-under-2-minutes`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.8 },
      { url: `${baseUrl}/monologues/dramatic-contemporary`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.8 },
      { url: `${baseUrl}/monologues/classical-monologues`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.8 },

      /* ── Feature / AI pages ─────────────────────────────────── */
      { url: `${baseUrl}/scene-partner-ai`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },
      { url: `${baseUrl}/ai-rehearsal-tool`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.9 },

      /* ── Content & info pages ───────────────────────────────── */
      { url: `${baseUrl}/about`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.8 },
      { url: `${baseUrl}/changelog`, lastModified: lastMod, changeFrequency: "weekly", priority: 0.8 },
      { url: `${baseUrl}/for-teachers`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.8 },
      { url: `${baseUrl}/5-monologues`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.8 },
      { url: `${baseUrl}/actors`, lastModified: lastMod, changeFrequency: "weekly", priority: 0.7 },
      { url: `${baseUrl}/for-students`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.7 },
      { url: `${baseUrl}/contact`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.6 },
      { url: `${baseUrl}/sources`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.6 },

      /* ── Legal ──────────────────────────────────────────────── */
      { url: `${baseUrl}/privacy`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.5 },
      { url: `${baseUrl}/terms`, lastModified: lastMod, changeFrequency: "monthly", priority: 0.5 },
    ];
  }
