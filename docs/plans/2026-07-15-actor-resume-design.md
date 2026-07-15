# Actor Résumé (Phase 2 of the profile flywheel) — Design

**Date:** 2026-07-15
**Status:** Approved — building Increment 1
**Related:** `docs/plans/2026-07-14-profile-onboarding-personalization-design.md` (Phase 1), memory `profile-onboarding`

## Why
The onboarding flywheel's recurring/monetizable carrot: fill the deep profile → get a real, downloadable **actor résumé**. Same profile data feeds personalization *and* the résumé, so "why fill this out?" finally has a strong answer. Watermark removal is the upgrade lever.

## Decision (2026-07-15): watermark-first gating
One résumé per actor, auto-composed from profile + credits.
- **Free:** download **watermarked** (subtle actorrise.com mark).
- **Any paid tier (Solo/Plus/Pro):** download **clean**.
- Multiple named versions (Theatrical / Commercial / per-role) = later increment, not now.

## What exists (reuse) vs missing (build)
Reuse: `FeatureGate` + usage metrics, Jinja HTML rendering (`email/templates.py`), Supabase headshot upload (`POST /profile/headshot`), tier-features resolution (`benefits.py::get_effective_benefits`), profile fields.
Build: `actor_credits` model, résumé UI, HTML→PDF generation.

## Data model
New table `actor_credits`:
- id, user_id (FK), category (theatre|film|tv|commercial|other), production, role, company (theatre/company/network), director, year (nullable), sort_order.
Add to `actor_profiles`: `special_skills` (JSON list). `training_background` + `headshot_url` already exist.

## Render (Increment 2)
Server-side HTML→PDF reusing the Jinja Environment. Industry-standard one-pager:
- Header: name + playing age, height, union, contact (email), optional headshot.
- Credits grouped by category (Theatre / Film & TV / Commercial): `Production · Role · Company · Director`.
- Training. Special skills (comma list).
- Free → faint diagonal `actorrise.com` watermark; paid → none.
- **PDF lib TBD at Increment 2** — WeasyPrint has heavy serverless system deps (Pango/Cairo); evaluate WeasyPrint vs a headless-render vs reportlab against the actual backend host before committing. Increment 1 needs no PDF.

## Gating (Increment 2)
Add a `resume` feature branch to `FeatureGate` (or a dedicated `/api/resume/download` handler) that reads the user's effective tier features: paid → clean, free → watermarked. No monthly usage cap in watermark-first (both free & paid can regenerate freely).

## Increments
1. **Data + entry + preview (NOW):** `actor_credits` model + `special_skills` column + migration scripts; credits CRUD API; profile-page Credits section (add/edit/reorder/delete) + special skills; in-app résumé preview (HTML, no PDF).
2. **PDF + watermark + gating:** pick PDF approach, render template, gated download endpoint, "Download résumé" button.
3. **Later:** multiple named versions + per-version credit selection + version caps (Free 1 / Solo 3 / Plus 5 / Pro ∞).

## Success
Résumé downloads by tier; free→paid conversions attributed to the watermark-removal path.
