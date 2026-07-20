# Ghost Light — Whole-App Redesign Design

**Date:** 2026-07-20
**Author:** Canberk (+ Claude)
**Status:** Design approved, ready to plan Phase 1

---

## 1. The idea

Canberk loves the "Ghost Light" theatrical aesthetic on the landing page: a warm
dark stage, an **orange glow that follows the cursor**, a **literal glowing orange
dot** (the ghost light on its stand), and big **serif display titles**. He wants
that language to become the app's overall design, not just the marketing shell.

The redesign takes the app from its current flat, neutral look to a cohesive
**dark theatrical shell + light reading canvas**, with the glow extracted into a
reusable primitive used across the product.

## 2. Decisions locked in

- **Scope:** whole-app redesign (marketing + signed-in `/platform`).
- **Theme direction:** **dark theatrical shell + light reading canvas.**
  - Dark, warm stage chrome (header, side nav, dashboards, empty states, hero
    moments) carries the glow — this is where the glow looks best and where
    "browsing" attention lives.
  - Light, calm reading/rehearsing surfaces (the monologue text itself, `/work`)
    stay light so long reading never tires the eyes.
  - The glow **only reads well on dark** — its drama comes from darkness. That is
    *why* the glow lives in the chrome, not the reading canvas.
- **Theme toggle:** ship a light/dark toggle as a fast follow. Infra already
  exists (`next-themes`, `ThemeProvider`, `components/ui/theme-toggle.tsx`), so
  this is wiring + polish, not a second redesign.
- **Typography:** hero-scale **display titles use the serif** (`font-serif` /
  Cormorant), matching `SpotlightHero` and the "Your scene partner is already
  waiting" line in `FinalCta`. UI chrome, labels, filters stay sans (Montserrat).
  Monologue *text* stays typewriter (Courier Prime). This is display-only serif —
  it does NOT reverse the 2026-07-16 rule that small titles/headings are sans.

## 3. Key finding — the theme system already exists

`app/globals.css` already defines:
- `:root` (light) and `.dark` token blocks — but `.dark` is a **flat neutral
  black** (`--background: oklch(0.145 0 0)`), unrelated to the warm stage.
- A **separate** `--stage-*` palette (warm near-black `oklch(0.16 0.015 50)`,
  `--stage-glow: oklch(0.72 0.17 55)`) used only by the landing's dark scenes.

So the core redesign work is **unifying these two dark palettes**: the app's
`.dark` theme should *become* the warm Ghost Light stage, and the `--stage-*`
tokens should be the canonical dark-mode tokens rather than a landing-only fork.

## 4. Architecture

### 4.1 Token layer (`app/globals.css`)
- Promote the warm `--stage-*` palette into the real `.dark` token block so the
  whole app's dark mode is the theatrical stage (warm near-black, warm muted
  text, `--stage-line` borders).
- Keep `--primary` as `#CB4B00` / `oklch(0.58 0.18 45)` in both themes (brand
  constant). Introduce a shared `--glow` token (= `--stage-glow` on dark) so the
  glow primitive references one name.
- Light theme stays the current readable light palette for reading canvases.

### 4.2 Glow primitives (new, reusable)
Extract the two landing effects into `components/brand/` (or `components/ui/`):

- **`<SpotlightSurface>`** — wraps the cursor-following radial wash. Encapsulates
  the `pointermove` → `--spot-x/--spot-y` rAF logic (currently inline in
  `SpotlightHero`) plus the `.stage-spotlight` / `.stage-wash` layers. Props for
  intensity and whether to include the slow `ghost-flicker`. Drop-in for any dark
  section that wants ambient cursor glow (hero, dashboard header, empty states).
- **`<GhostLight>`** — the standalone glowing orange dot + halo (currently inline
  in `FinalCta.tsx:14-25`). Size/animation props. A reusable motif for empty
  states, section marks, loading, "you" moments across the app.

Both consume the shared `--glow` token so they work in any dark context.

### 4.3 Shell layer (`app/(platform)/layout.tsx`)
- Introduce a dark theatrical app shell: header + side nav on the warm stage,
  carrying `<SpotlightSurface>` glow. Reading routes render a light canvas inside
  that dark frame ("dark frame, light stage").

## 5. Phasing

### Phase 1 — Foundation + landing proof (START HERE)
1. Extract `<SpotlightSurface>` and `<GhostLight>` primitives; refactor
   `SpotlightHero` and `FinalCta` to use them (no visual change — pure refactor,
   verifiable).
2. Add the shared `--glow` token; begin unifying `.dark` with `--stage-*`.
3. **Landing asks (concrete wins):**
   - **Glow on the header** — the landing header currently floats over the stage
     but has no glow of its own. Give it a `<SpotlightSurface>` (or share the
     hero's spotlight coordinates) so the orange glow tracks the cursor across the
     header too.
   - **Bigger stage-directions** — bump the `SceneMark` / `stage-direction` text
     (e.g. `(now you try.)`) up a step so they read as intentional beats, not fine
     print.
4. Confirm display titles use `font-serif` on landing (already true; document as
   the standard).

### Phase 2 — One flagship app screen (`/monologues`)
Redesign `/monologues` end-to-end as the template: dark shell + glow chrome, light
reading cards, serif display title, typewriter monologue text. Becomes the pattern
every other screen copies.

### Phase 3+ — Roll across the app
Dashboard, `/work`, `/audition`, billing, admin, etc. adopt the shell + primitives.
Ship and polish the light/dark toggle.

## 6. Non-goals / YAGNI
- No new color system beyond unifying the two existing dark palettes + one `--glow`
  token.
- No animation library — reuse existing CSS keyframes (`ghost-flicker`,
  `stage-rise`, `header-enter`).
- Not touching monologue *content* rendering rules (typewriter stays).
- Toggle polish is Phase 3, not a blocker for Phase 1/2.

## 7. Verification
- Phase 1 primitive extraction: landing looks pixel-identical before/after the
  refactor (visual diff), plus header glow + larger stage-directions are visible.
- Each phase driven end-to-end in the browser (not just typecheck) before "done".

## 8. Open questions
- Exact size bump for stage-directions (one step vs two) — decide visually.
- Whether the dashboard hero also gets `<GhostLight>` or only `<SpotlightSurface>`.
- Light-canvas boundary for `/work` (fully light vs. dark rails, light center).
