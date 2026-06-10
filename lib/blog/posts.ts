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
    title: "The most overdone audition monologues (and what to do instead)",
    excerpt:
      "The pieces casting hears in every waiting room, how to tell if yours is one of them, and how to find something that fits you better.",
    date: "2026-06-11",
    readingMinutes: 6,
  },
];
