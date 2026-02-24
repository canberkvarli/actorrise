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
}

export const TESTIMONIALS: TestimonialItem[] = [
  {
    quote:
      "I have spent a lot of time searching through books and databases for the right audition piece. That work matters, but rehearsal matters more. ActorRise helps me find material quickly so I can spend more time repeating, refining, and doing the work.",
    name: "Canberk Varli",
    descriptor: "Founder · Actor",
    image: "/testimonials/canberk/canberk.jpg",
    isFounder: true,
  },
  {
    quote:
      "I'm genuinely impressed by what Canberk has built with ActorRise. It's rare to find a platform that understands the actor's struggle so well. The ability to discover unique, tailored material in seconds is exactly what the industry needs right now. I'm proud to support it!",
    name: "Timothy Miller",
    descriptor: "Actor · Voice Actor · Comedian",
    image: "/testimonials/timothy_miller/1000001409.jpg",
  },
  {
    quote:
      "Join and play around. If you like what we're building, reach out. I'm happy to send a code for founding member access. I'd rather have more actors in the room than behind a paywall.",
    name: "Limited founding member spots.",
    descriptor: "",
    // No image: placeholder; big icon opens contact on click
  },
];

/** Number of testimonials shown initially; rest appear on "Load more". */
export const TESTIMONIALS_INITIAL_DISPLAY = 6;
