/**
 * Organizations that list ActorRise: chapters, theaters, studios, schools, newsletters.
 * Add logo files to public/partners/ and reference as /partners/filename.svg
 *
 * Nothing renders until `approved: true`. That flag means the organization has said
 * yes, in writing, to their mark appearing on a commercial site. Leave it false until
 * they have.
 *
 * To add one:
 *   1. Drop the logo in public/partners/ (see public/partners/README.md for formats).
 *   2. Append an entry below.
 *   3. Flip `approved` to true only once you have their written OK.
 *
 * {
 *   name: "Virginia Theatre Association",
 *   shortName: "VTA",
 *   url: "https://www.vtasite.org",
 *   logo: "/partners/vta.png",
 *   blurb: "Lists ActorRise in the chapter resource guide.",
 *   category: "chapter",
 *   approved: false,
 * },
 */

export interface PartnerItem {
  /** Display name, e.g. "Virginia Theatre Association" */
  name: string;
  /** Short label under the logo, e.g. "VTA" — optional */
  shortName?: string;
  /** Where the logo links. Absolute https URL. */
  url: string;
  /** Path under /partners/ (e.g. /partners/vta.png). Files go in public/partners/. */
  logo?: string;
  /** One line describing the relationship, for the /partners page only. */
  blurb?: string;
  /** "chapter" | "theater" | "newsletter" | "studio" | "school" */
  category: string;
  /** false until they have explicitly approved logo use. Only true entries render. */
  approved: boolean;
}

export const PARTNERS: PartnerItem[] = [];

/**
 * The only list any view should read. Filtering here rather than at each call site
 * means an unapproved entry cannot leak into a new surface by omission.
 */
export const APPROVED_PARTNERS: PartnerItem[] = PARTNERS.filter((p) => p.approved);

/** Below this, the landing row renders nothing: one logo reads worse than none. */
export const PARTNERS_MIN_TO_SHOW = 3;

/** Section order on /partners. Categories not listed here fall to the end, alphabetically. */
export const PARTNER_CATEGORY_ORDER = [
  "chapter",
  "theater",
  "studio",
  "school",
  "newsletter",
] as const;

/** Plural headings for the /partners page. Unknown categories fall back to the raw value. */
export const PARTNER_CATEGORY_LABELS: Record<string, string> = {
  chapter: "Chapters",
  theater: "Theaters",
  studio: "Studios",
  school: "Schools",
  newsletter: "Newsletters",
};
