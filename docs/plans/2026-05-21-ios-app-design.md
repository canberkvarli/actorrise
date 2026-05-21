# ActorRise iOS App

**Date:** 2026-05-21
**Status:** Design

## Problem

ActorRise is web-only. The two features actors actually want on a phone are
**monologue search** (high-intent App Store traffic: "monologues for audition",
"dramatic monologues") and **ScenePartner** (rehearsal with recorded partner
lines). ScenePartner especially is bottlenecked by the browser: mic permissions
are clunky, audio session does not survive screen lock, no lock-screen
controls, no push for session cues. We also have no App Store presence, which
caps discoverability.

## Goal

Ship a native iOS app on the App Store with **monologue search + library +
ScenePartner** as the MVP surface. Web stays the primary surface for admin,
script upload, blog, marketing. One app, one subscription, one brand.

## Decisions (locked)

| # | Decision |
|---|----------|
| 1 | **One iOS app, not two.** Combined Search + ScenePartner. Separate apps would split the brand, double review/maintenance, fight Apple guideline 4.3 (spam), and break the natural "find monologue → rehearse" flow. |
| 2 | **Expo + React Native (managed workflow)**, not Capacitor wrapping Next.js. Real native audio is the wedge; thin webview wrappers risk Apple 4.2 rejection. Skipping Capacitor avoids fighting Next.js 16 server components in a static-export shell. |
| 3 | **pnpm + Turborepo monorepo.** Current flat repo becomes `apps/web` + `apps/mobile` + shared `packages/`. Shared: Supabase client, DB types, Zod schemas, typed API client for the Python backend, pure business logic. Not shared: UI, routing, auth flow specifics, audio. |
| 4 | **NativeWind** for styling (Tailwind classes on RN). Carries the existing design language across with minimal mental switching. |
| 5 | **Expo Router** for file-based routing (App Router-shaped, familiar from Next.js). |
| 6 | **Reuse existing data stack.** `@supabase/supabase-js` + `@tanstack/react-query` work as-is on RN. `@tanstack/query-async-storage-persister` (already installed) gives offline cache on mobile for free. |
| 7 | **Auth:** Supabase Auth + `expo-secure-store` for keychain-backed token persistence. Sign in with Apple (`expo-apple-authentication`) — required by Apple if any other social/magic login is offered. Deep-link scheme `actorrise://`. |
| 8 | **Audio: `expo-audio`** (newer replacement for `expo-av`). Recording + playback, `playAndRecord` audio session with `mixWithOthers: false`, background mode enabled, lock-screen now-playing metadata. Partner-line TTS streamed from existing server-side pipeline; `expo-speech` only as on-device fallback. |
| 9 | **Push: `expo-notifications`** + Expo push service (free, wraps APNs). |
| 10 | **In-App Purchase via RevenueCat.** Mandatory on iOS for digital subscriptions — Stripe is not allowed in-app. RevenueCat reconciles Apple IAP receipts back to Supabase so web Pro and mobile Pro stay in sync. Apple takes 15% (Small Business Program, under $1M ARR). |
| 11 | **EAS Build + EAS Submit** for code signing, provisioning, and App Store Connect uploads. `expo-updates` for OTA JS-only updates (no review needed for copy/layout/bugfixes). |
| 12 | **MVP scope (iOS):** auth, monologue search, library (saved monologues + uploaded scripts list), ScenePartner session, profile/subscription. Out of scope for v1: script editor, admin tools, blog, marketing pages, file uploads >small. |

## Architecture

### Repo layout (post-migration)

```
actorrise/
├── apps/
│   ├── web/                 # current Next.js app, moved verbatim
│   └── mobile/              # new Expo app
├── packages/
│   ├── supabase/            # shared Supabase client + generated DB types
│   ├── types/               # shared TS types (Script, Scene, Monologue, …)
│   ├── api-client/          # typed fetch wrappers for Python backend
│   └── validation/          # shared Zod schemas
├── backend/                 # Python, unchanged
├── supabase/                # migrations, unchanged
├── package.json             # workspace root
├── pnpm-workspace.yaml
└── turbo.json
```

### Mobile app structure (Expo Router)

```
apps/mobile/app/
├── (auth)/
│   ├── sign-in.tsx
│   └── sign-up.tsx
├── (tabs)/
│   ├── search.tsx           # monologue finder (App Store SEO hook)
│   ├── library.tsx          # saved monologues + scripts
│   ├── scene-partner.tsx    # ScenePartner entry / session picker
│   └── profile.tsx          # account, subscription, settings
├── scene-partner/
│   └── [scriptId].tsx       # active rehearsal session
└── _layout.tsx              # root providers (Query, Supabase, Theme)
```

### Data flow

```
                  ┌── React Query (cache + offline persist) ──┐
Mobile UI ────────┤                                            ├──► Supabase (auth, DB)
                  └── api-client (typed fetch) ────────────────┴──► Python backend
                                                                    (search, scenes, TTS)
```

Same backend as web. No new API surface required for MVP — existing routes
already serve monologue search, script/scene reads, and TTS generation.

### ScenePartner audio session

- Category: `playAndRecord`, `mixWithOthers: false`, `allowsRecordingIOS: true`
- Background mode `audio` enabled in `app.json` so playback survives screen lock
- Now-playing metadata (`expo-audio` MediaSession) for lock-screen controls
- Mic permission string in `Info.plist`:
  *"ActorRise records your voice so ScenePartner can rehearse scenes with you."*
- Partner lines: pre-generated audio streamed from backend; cached locally per session

## App Store positioning

- **Name:** `ActorRise`
- **Subtitle:** `Monologues & Scene Rehearsal` (keywords are searchable here)
- **Lead screenshot:** monologue search (high-intent traffic)
- **Screenshots 2–3:** ScenePartner reveal (retention/love feature)
- **Privacy manifest** (`PrivacyInfo.xcprivacy`) declares: email, user content,
  audio recordings — Expo handles most of this automatically.

## Subscription model

- Existing tiers (Free, Solo $7, Plus $12, Pro $24) mapped to RevenueCat offerings
- iOS users subscribe via Apple IAP → RevenueCat webhook → Supabase
  `subscriptions` table updated → Pro features unlock on both platforms
- Web users continue via Stripe (unchanged)
- Cross-platform entitlement: a Pro user who subscribed on iOS sees Pro on web,
  and vice versa, because both write to the same `subscriptions` table keyed
  by `user_id`

## MVP timeline (solo, ~part-time)

| Phase | Duration | Deliverable |
|---|---|---|
| Monorepo migration + Expo skeleton | 3–5 days | App boots on Simulator, deep links work, Supabase auth flow done |
| Monologue search + library | 1–2 weeks | Search, filters, save, view detail, offline cache |
| ScenePartner core | 2–3 weeks | Recording, playback, partner lines, session UI, lock-screen controls |
| Subscription + IAP (RevenueCat) | 4–5 days | Pro unlock via Apple IAP, web/mobile entitlement sync |
| Polish + App Store assets + submission | 1 week | Screenshots, privacy manifest, review submission |
| **Total** | **~6–9 weeks** | TestFlight → public launch |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Apple rejection (guideline 4.2, wrapper apps) | Going fully native with Expo, not wrapping the web app |
| Apple rejection (missing Sign in with Apple) | Add `expo-apple-authentication` alongside Google/magic-link |
| IAP / Stripe entitlement drift | RevenueCat as single source of truth, syncs to Supabase `subscriptions` table |
| Mic permission rejection | Specific, honest permission copy (see above) |
| Audio session breakage when screen locks | Background audio mode + `playAndRecord` category, tested on TestFlight before submission |
| Monorepo migration breaks web deploy | Vercel build command updated to `pnpm --filter=web build`; deploy a no-op PR first to verify |
| Two codebases drifting over time | Shared `packages/` for types, schemas, API client — UI necessarily diverges |

## Out of scope (v1)

- Android (Expo supports it for free later, but defer until iOS validates demand)
- Script upload / OCR on mobile (heavy; do it on web)
- Admin panel on mobile
- Blog / marketing pages on mobile (web continues to serve these)
- Self-tape recording features beyond ScenePartner basics

## Resolved decisions (locked 2026-05-21)

1. **Pricing:** Mirror the full four-tier web structure in IAP — Free (signed-in,
   no subscription), Solo $7, Plus $12, Pro $24. RevenueCat offerings map 1:1
   with web Stripe products. Entitlements written to the same Supabase
   `subscriptions` table so a user upgrading on either platform is recognized
   on both.
2. **Auth providers:** Match whatever the web app offers exactly — same
   providers, same flows, same labels. Sign in with Apple is added on top
   (required by Apple if any other social login is present). To be confirmed
   against the actual web `LoginForm` component during the monorepo migration
   phase.
3. **OTA channels:** Start with a single `production` channel via
   `expo-updates`. Add `staging` channel only when the first regression bites.
