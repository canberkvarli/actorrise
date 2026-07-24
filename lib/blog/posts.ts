export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  /** ISO 8601 publish date, used for display + Article schema datePublished. */
  date: string;
  readingMinutes: number;
};

// Add a post: create app/(marketing)/blog/<slug>/page.tsx and add an entry here.
export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "most-overdone-audition-monologues",
    title: "Overdone Audition Monologues (and What to Bring Instead)",
    excerpt:
      "The monologues casting hears in every waiting room, including the overdone Shakespeare pieces, how to tell if yours is one of them, and how to find something fresher that still fits you.",
    date: "2026-06-11",
    readingMinutes: 6,
  },
];
