/**
 * Landing page testimonials. Founding actors and community feedback.
 * Add headshot images to public/testimonials/ and reference as /testimonials/filename.jpg
 */

export interface TestimonialItem {
  quote: string;
  name: string;
  descriptor: string;
  /** Path under /testimonials/ (e.g. /testimonials/canberk.jpeg). Put files in public/testimonials/. */
  image?: string;
  isFounder?: boolean;
  /** Source platform for the review */
  source?: "product_hunt" | "reddit" | "direct" | "x" | "actor";
  /** URL slug for the actor's dedicated page (e.g. "canberk-varli" → /actors/canberk-varli). */
  slug?: string;
  /** Social links: { imdb, website, instagram, x } */
  socialLinks?: Record<string, string>;
}

export const TESTIMONIALS: TestimonialItem[] = [
  {
    quote:
      "I have spent a lot of time searching through books and databases for the right audition piece. That work matters, but rehearsal matters more. ActorRise helps me find material quickly so I can spend more time repeating, refining, and doing the work.",
    name: "Canberk Varli",
    descriptor: "Founder · Actor",
    image: "/testimonials/canberk/canberk.jpg",
    isFounder: true,
    source: "direct",
    slug: "canberk-varli",
    socialLinks: {
      instagram: "https://www.instagram.com/canberk.varli",
      x: "https://x.com/canberkvarli",
    },
  },
  {
    // His own words, from the founding-actor profile he submitted (id 5).
    // The DB holds the full two-paragraph version and /actors renders that;
    // this is the opening, cut at a sentence end so the notice card sits at a
    // readable height next to the others. Never edited, only shortened.
    quote:
      "ActorRise has become a key part of how I stay sharp and ready in an industry that doesn't wait. It's not just about practice, it's about maintaining a level of consistency and discipline, even when things go quiet. I don't have to rely on having a reader or the perfect setup, I can rehearse, refine and elevate my performances anywhere, anytime.",
    name: "Ayush Nana",
    descriptor: "Actor",
    image: "/testimonials/ayush-nana/ayush-nana.jpg",
    source: "actor",
    slug: "ayush-nana",
  },
  {
    quote:
      "I'm genuinely impressed by what Canberk has built with ActorRise. It's rare to find a platform that understands the actor's struggle so well. The ability to discover unique, tailored material in seconds is exactly what the industry needs right now. I'm proud to support it!",
    name: "Timothy Miller",
    descriptor: "Actor · Voice Actor · Comedian",
    image: "/testimonials/timothy_miller/1000001409.jpg",
    source: "actor",
  },
  {
    quote:
      "ActorRise has honestly been such a game changer for me. I used to spend hours searching for the perfect monologue for self tapes and still end up second guessing it. Now I can find material in minutes. The algorithm is kind of scary in the best way, it's super specific and really tailored to me and my tone. Let's be honest, AI doesn't always \"get\" actors... but this actually does, which is absolutely impeccable!!!",
    name: "Jeannille Ettinoffe",
    descriptor: "Singer ⭒ Actress ⭒ Dancer ⭒ Musician",
    image: "/testimonials/jeannille-ettinoffe/jeannille-ettinoffe.jpg",
    source: "actor",
    slug: "jeannille-ettinoffe",
    socialLinks: {
      instagram: "https://www.instagram.com/theeofficial_jeannille",
      youtube: "https://www.youtube.com/@jeannille_music",
      backstage: "https://www.backstage.com/u/jeannille-ettinoffe/",
      imdb: "https://www.imdb.com/name/nm17774164/",
      website: "https://www.jeannilleettinoffe.com",
    },
  },
];

/** Number of testimonials shown initially; rest appear on "Load more". */
export const TESTIMONIALS_INITIAL_DISPLAY = 6;
