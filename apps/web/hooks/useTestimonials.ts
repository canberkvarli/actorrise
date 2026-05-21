"use client";

import { useMemo } from "react";
import { useFoundingActors } from "./useFoundingActors";
import {
  TESTIMONIALS,
  type TestimonialItem,
} from "@/data/testimonials";

/**
 * Fetches founding actors from the API and maps them to TestimonialItem[].
 * Falls back to the static TESTIMONIALS array when the API is unavailable.
 */
export function useTestimonials(): {
  testimonials: TestimonialItem[];
  isLoading: boolean;
} {
  const { data: foundingActors, isLoading } = useFoundingActors();

  const testimonials = useMemo(() => {
    if (foundingActors && foundingActors.length > 0) {
      const apiTestimonials: TestimonialItem[] = foundingActors.map((actor) => {
        const primary =
          actor.headshots.find((h) => h.is_primary) || actor.headshots[0];
        return {
          quote: actor.quote || "",
          name: actor.name,
          descriptor: actor.descriptor || "",
          image: primary?.url,
          isFounder: true,
          source: (actor.source as TestimonialItem["source"]) || "actor",
          slug: actor.slug,
          socialLinks: actor.social_links,
        };
      });
      // Keep the placeholder testimonial from static data
      const placeholder = TESTIMONIALS.find((t) => !t.image);
      if (placeholder) apiTestimonials.push(placeholder);
      return apiTestimonials;
    }
    return TESTIMONIALS;
  }, [foundingActors]);

  return { testimonials, isLoading };
}
