# Testimonial headshots

**Where to put actor headshots:** put the image files **in this folder** (i.e. `public/testimonials/`) (this directory).  
Example: save Timothy’s headshot as `public/testimonials/timothy-miller.jpg`.

**When you get new headshots from actors:** 1) Save the files here (any subfolder is fine, e.g. `timothy_miller/photo.jpg`). 2) Add the testimonial and image path in `data/testimonials.ts`. 3) Run **`npm run compress-testimonials`** from the repo root so images are resized and compressed for the web. Then you’re done.

- **Path in code:** In `data/testimonials.ts`, set `image: "/testimonials/filename.jpg"` for each testimonial (e.g. `"/testimonials/timothy-miller.jpg"`).
- **Naming:** lowercase, no spaces (e.g. `jane-doe.jpg`, `canberk.jpeg`).

---

## What to ask from actors (headshot specs)

| Spec | Recommendation | Why |
|------|----------------|-----|
| **Resolution** | **Minimum 600×600 px** (square), or **600×800 px** if portrait | We display headshots large (up to ~360 px); 600+ px keeps them sharp on retina. |
| **Aspect** | Square (1:1) or portrait (3:4) | We crop to square in the UI; square source is ideal. |
| **File size** | **Under 200 KB** per image | Keeps the homepage fast. |
| **Format** | JPEG (preferred) or PNG | Next.js will serve WebP when supported. |

**Copy-paste for emails:**

> Headshot for the testimonial: please send a **square or portrait photo** (at least **600×600 pixels**), **under 200 KB** if possible (JPEG is fine). We’ll use it in our testimonials carousel on the homepage.

Optional: ask for **800×800 px** for extra flexibility and compress before adding to `public/testimonials/` (e.g. [Squoosh](https://squoosh.app/) or ImageOptim).

---

## Should I compress images?

**Yes.** Large headshots (e.g. multi‑MB from a phone or camera) will slow down the homepage and hurt performance, especially with many testimonials. Next.js optimizes and serves WebP, but the source file size still affects build and first load.

**Target:** Keep each headshot **under 150–200 KB** (JPEG quality ~80–85 is usually enough for web).

**How to compress:**
- **Quick (manual):** [Squoosh](https://squoosh.app/): drag the image, choose JPEG, set quality 80–85, download. Or use **ImageOptim** (Mac) to losslessly shrink.
- **Batch (project script):** From repo root run `npm run compress-testimonials` to compress all images in `public/testimonials/` in place (max width 800px, JPEG quality 82). Requires `sharp` as dev dependency. Run after adding new headshots.

If you already added large files (e.g. in `timothy_miller/`), replace them with compressed versions of the same image and keep the same filename so `data/testimonials.ts` doesn’t need changes.
