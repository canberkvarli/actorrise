# Landing Page Video Showcase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the feature showcase cards with a cinematic ScenePartner demo video section using staggered scroll animations.

**Architecture:** New `LandingVideoShowcase` component replaces `LandingFeatureShowcase`. Uses Framer Motion for staggered entrance animations (title first, then video card). YouTube embed loads on click via thumbnail-to-iframe swap pattern. Remove the three-step grid and overdone filter text sections.

**Tech Stack:** React, Next.js, Framer Motion, YouTube iframe API, Tailwind CSS

---

### Task 1: Create LandingVideoShowcase component

**Files:**
- Create: `components/landing/LandingVideoShowcase.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IconPlayerPlayFilled } from "@tabler/icons-react";

const YOUTUBE_ID = "IdVTZvjrGDU";
const THUMBNAIL_URL = `https://img.youtube.com/vi/${YOUTUBE_ID}/maxresdefault.jpg`;

const ease = [0.25, 0.1, 0.25, 1] as const;

const titleVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease },
  },
};

const videoVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, ease, delay: 0.2 },
  },
};

export function LandingVideoShowcase() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 md:py-28 border-t border-border/60">
      <div className="max-w-5xl mx-auto">
        {/* Title block - animates in first */}
        <motion.div
          variants={titleVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mb-8 sm:mb-12 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            ScenePartner
          </div>
          <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
            Watch how it works.
          </h2>
        </motion.div>

        {/* Video card - animates in 0.2s after title */}
        <motion.div
          variants={videoVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="relative rounded-2xl border border-border bg-card overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
        >
          <div className="relative aspect-video">
            {!isPlaying ? (
              <button
                onClick={() => setIsPlaying(true)}
                className="absolute inset-0 w-full h-full group cursor-pointer"
                aria-label="Play ScenePartner demo video"
              >
                {/* Thumbnail */}
                <img
                  src={THUMBNAIL_URL}
                  alt="ScenePartner demo"
                  className="w-full h-full object-cover"
                />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-300" />

                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/90 shadow-2xl group-hover:scale-110 transition-transform duration-300">
                    <IconPlayerPlayFilled
                      size={28}
                      className="text-foreground ml-1"
                    />
                  </div>
                </div>
              </button>
            ) : (
              <iframe
                src={`https://www.youtube.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1`}
                title="ScenePartner demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/canberkvarli/Development/actorrise && npx next lint --file components/landing/LandingVideoShowcase.tsx`

---

### Task 2: Update LandingPageAnimated to use new video section

**Files:**
- Modify: `components/landing/LandingPageAnimated.tsx`

**Step 1: Replace imports and sections**

Changes:
1. Replace `LandingFeatureShowcase` import with `LandingVideoShowcase`
2. Replace the `<RevealSection as="div"><LandingFeatureShowcase /></RevealSection>` block (line 133-135) with `<LandingVideoShowcase />`
3. Remove the "Get back to what matters" three-step grid section (lines 142-172)
4. Remove the "Give casting directors something different" overdone filter section (lines 174-183)

The final `<main>` section order becomes:
1. Hero section (existing)
2. `<LandingVideoShowcase />` (new, handles its own animations)
3. Testimonials (existing)
4. FAQ (existing)
5. Pricing (existing)

**Step 2: Verify dev server runs**

Run: `cd /Users/canberkvarli/Development/actorrise && npm run dev` and check localhost

---

### Task 3: Clean up unused imports

**Files:**
- Modify: `components/landing/LandingPageAnimated.tsx`

**Step 1: Remove unused import**

Remove `LandingFeatureShowcase` import line and `RevealSection` import if no longer used elsewhere in the file.

Check if `RevealSection` is still used (it wraps Testimonials, FAQ, Pricing) — if yes, keep it.

**Step 2: Verify build**

Run: `cd /Users/canberkvarli/Development/actorrise && npm run build`

---

### Task 4: Commit

**Step 1: Stage and commit**

```bash
git add components/landing/LandingVideoShowcase.tsx components/landing/LandingPageAnimated.tsx
git commit -m "feat: replace feature showcase with ScenePartner video demo section

Staggered scroll animations (title first, then video card).
Click-to-play YouTube embed with custom thumbnail and play button.
Remove three-step grid and overdone filter sections for cleaner flow."
```
