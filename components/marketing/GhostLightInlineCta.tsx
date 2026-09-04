import { appStoreUrl } from "@/lib/appStore";

/**
 * The app, offered at the one moment it makes obvious sense.
 *
 * This site's traffic is not the homepage. It is 1,281 SEO landing pages, mostly
 * individual monologues, and someone who has just read Nora's speech on their
 * phone is the most qualified person we will ever have. Until now those pages
 * said nothing about the app at all.
 *
 * Deliberately understated. There is a full rehearse card below this one, and
 * that is the primary conversion; an app pitch dressed at the same weight would
 * trade the main yes for a smaller one. So this is a single line with a link,
 * placed at the end of the words rather than in front of them.
 *
 * No `"use client"`. These pages are statically generated with a day's
 * revalidate, and they are the SEO surface, so shipping JavaScript to render one
 * sentence would be a poor trade. That also means no platform sniffing, hence
 * "on iPhone" said plainly rather than a button that lies to Android.
 */
export function GhostLightInlineCta() {
  return (
    <aside className="mb-12 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-muted/20 px-5 py-4">
      {/* The ghost light, at the size of a full stop. */}
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-primary shadow-[0_0_10px_2px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
      />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Learning this one?{" "}
        <a
          href={appStoreUrl("monologue_page")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
        >
          Ghost Light
        </a>{" "}
        keeps your saved pieces on your phone and reads them offline, in the
        wings or on the train. Free on iPhone.
      </p>
    </aside>
  );
}

export default GhostLightInlineCta;
