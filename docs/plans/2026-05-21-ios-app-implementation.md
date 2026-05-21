# ActorRise iOS App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a native iOS app on the App Store with monologue search + library + ScenePartner, sharing code with the existing web app via a pnpm + Turborepo monorepo.

**Architecture:** Convert flat repo into `apps/web` + `apps/mobile` + shared `packages/`. Mobile is Expo + React Native + Expo Router + NativeWind. Reuse `@supabase/supabase-js`, `@tanstack/react-query`, and Zod (all already in web). RevenueCat for IAP, syncs entitlement to existing Supabase `subscriptions` table.

**Tech Stack:** pnpm, Turborepo, Expo SDK (latest), React Native, Expo Router, NativeWind, Supabase Auth + `expo-secure-store`, `expo-audio`, `expo-notifications`, RevenueCat (`react-native-purchases`), EAS Build, `expo-updates`.

**Reference design:** [docs/plans/2026-05-21-ios-app-design.md](2026-05-21-ios-app-design.md)

---

## Phase 0 — Pre-flight (1 day)

External accounts and tooling that block everything else. Do these first.

### Task 0.1: Apple Developer Program enrollment

**Action:**
- Enroll at https://developer.apple.com/programs/ ($99/year)
- Verify enrollment is fully active (can take 24–48h)
- Create an App ID for `com.actorrise.app` in App Store Connect
- Reserve the app name "ActorRise" in App Store Connect (idle reservation is fine, no submission required yet)

**Verify:** You can see the App ID in your Apple Developer account.

### Task 0.2: Expo + EAS account

**Action:**
- Sign up at https://expo.dev with email matching `canberk@actorrise.com`
- Install Expo CLI globally: `npm install -g eas-cli`
- Log in: `eas login`
- Verify: `eas whoami` prints your username

### Task 0.3: RevenueCat account

**Action:**
- Sign up at https://app.revenuecat.com with `canberk@actorrise.com`
- Create a new project named `ActorRise`
- Note the iOS public SDK key (will be used in Phase 4)

**Verify:** Project dashboard loads; sandbox section is empty (expected — no purchases yet).

### Task 0.4: Install local toolchain

**Action:**
```bash
# pnpm (replaces npm for the monorepo)
npm install -g pnpm

# Xcode (App Store, ~15 GB download)
# Install from Mac App Store, then run once to accept license

# Xcode command-line tools
xcode-select --install

# iOS Simulator runtime (download via Xcode > Settings > Platforms)
```

**Verify:**
```bash
pnpm --version          # >= 9
xcodebuild -version     # >= 15
xcrun simctl list devices | head -5  # at least one iPhone listed
```

### Task 0.5: Commit checkpoint

```bash
# No code changes yet, this is just a marker
git commit --allow-empty -m "chore(ios): phase 0 pre-flight complete"
```

---

## Phase 1 — Monorepo migration + Expo skeleton (3–5 days)

The most delicate phase. Web app must keep deploying. Vercel must not break.

### Task 1.1: Create workspace skeleton files (DO NOT MOVE FILES YET)

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `apps/.gitkeep`
- Create: `packages/.gitkeep`

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "type-check": {}
  }
}
```

**Verify:** Files exist. `pnpm install` does not run yet.

**Commit:**
```bash
git add pnpm-workspace.yaml turbo.json apps/.gitkeep packages/.gitkeep
git commit -m "chore(monorepo): scaffold pnpm workspace + turbo"
```

### Task 1.2: Move web app into `apps/web/`

This is a big move. Do it in one commit so reverting is one command.

**Action:**
```bash
mkdir -p apps/web
# Move source dirs
git mv app apps/web/
git mv components apps/web/
git mv hooks apps/web/
git mv lib apps/web/
git mv utils apps/web/
git mv types apps/web/
git mv public apps/web/
git mv middleware.ts apps/web/

# Move web-only config
git mv next.config.ts apps/web/
git mv next-env.d.ts apps/web/
git mv postcss.config.mjs apps/web/
git mv components.json apps/web/
git mv eslint.config.mjs apps/web/
git mv tsconfig.json apps/web/
git mv tsconfig.tsbuildinfo apps/web/ 2>/dev/null || true

# Move package.json and lockfile
git mv package.json apps/web/
git mv package-lock.json apps/web/ 2>/dev/null || true

# Web-only scripts directory (be careful — there's also a backend/scripts/ that stays put)
git mv scripts apps/web/

# Keep these at root: backend/, supabase/, docs/, data/, .firecrawl/, render.yaml, .worktrees/, .gitignore
```

**Create new root `package.json`:**
```json
{
  "name": "actorrise-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check"
  },
  "devDependencies": {
    "turbo": "^2.3.0"
  },
  "packageManager": "pnpm@9.15.0"
}
```

**Verify:**
```bash
ls apps/web/app apps/web/components apps/web/package.json
ls backend/ supabase/ docs/  # still at root
```

**Commit:**
```bash
git add -A
git commit -m "chore(monorepo): move Next.js app into apps/web/"
```

### Task 1.3: Install workspace dependencies and verify web builds

**Action:**
```bash
# From repo root
pnpm install
# This generates pnpm-lock.yaml at root and installs deps into apps/web/node_modules/
```

**Add `pyrightconfig.json` and `package-lock.json` cleanup if needed.**

**Verify:**
```bash
pnpm --filter web build
# Expected: Next.js build completes successfully
```

If build fails: do NOT proceed. Likely issue is import paths or missing tsconfig paths. Fix before committing.

**Commit:**
```bash
git add pnpm-lock.yaml
# Remove old lockfile if it slipped in
git rm package-lock.json 2>/dev/null || true
git commit -m "chore(monorepo): install via pnpm, verify web build"
```

### Task 1.4: Update Vercel build config

**File:** Create `vercel.json` at repo root.

```json
{
  "buildCommand": "pnpm --filter web build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs"
}
```

**Action:**
- In Vercel dashboard, go to Project Settings → General
- Set Root Directory to `.` (root)
- Set Build Command override to `pnpm --filter web build`
- Set Output Directory to `apps/web/.next`
- Set Install Command to `pnpm install --frozen-lockfile`

**Verify:**
- Push to a throwaway branch first (`chore/monorepo-vercel-test`)
- Confirm Vercel deploys preview successfully
- Then merge to main

**Commit:**
```bash
git add vercel.json
git commit -m "chore(monorepo): configure Vercel for pnpm workspace"
```

### Task 1.5: Create `packages/types`

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`
- Create: `packages/types/src/database.ts` (copy from `apps/web/types/supabase.ts` if exists, else generate)

**`packages/types/package.json`:**
```json
{
  "name": "@actorrise/types",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

**`packages/types/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**`packages/types/src/index.ts`:**
```typescript
export * from "./database";
// Re-export domain types as we extract them from apps/web/types/
```

**Action:**
- Find shared types in `apps/web/types/` that mobile will need (Script, Scene, Monologue, Subscription, User profile)
- Move them into `packages/types/src/` (one file per domain)
- Update imports in `apps/web/` to `@actorrise/types`

**Wire into web:** In `apps/web/package.json` dependencies:
```json
"@actorrise/types": "workspace:*"
```

**Verify:**
```bash
pnpm install
pnpm --filter web type-check
pnpm --filter web build
```

**Commit:**
```bash
git add -A
git commit -m "feat(monorepo): extract shared types into @actorrise/types"
```

### Task 1.6: Create `packages/supabase`

Same pattern as types. Export configured Supabase client builders.

**Files:**
- Create: `packages/supabase/package.json`
- Create: `packages/supabase/src/index.ts`
- Create: `packages/supabase/src/client-web.ts` (browser/SSR via `@supabase/ssr`)
- Create: `packages/supabase/src/client-mobile.ts` (RN via `@supabase/supabase-js` + `expo-secure-store`)

**Key idea:** The package exports two entrypoints. Web imports `@actorrise/supabase/web`, mobile imports `@actorrise/supabase/mobile`. They share types and helpers, differ in storage adapter.

**`packages/supabase/package.json`:**
```json
{
  "name": "@actorrise/supabase",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./web": "./src/client-web.ts",
    "./mobile": "./src/client-mobile.ts"
  },
  "dependencies": {
    "@actorrise/types": "workspace:*"
  },
  "peerDependencies": {
    "@supabase/supabase-js": "^2.89.0",
    "@supabase/ssr": "^0.8.0"
  }
}
```

**Action:**
- Move `apps/web/utils/supabase/*` logic into `packages/supabase/src/client-web.ts`
- Update web imports to use `@actorrise/supabase/web`
- Leave mobile client as a stub `// TODO: implement in Task 1.13`

**Verify:** `pnpm --filter web build` still succeeds.

**Commit:**
```bash
git add -A
git commit -m "feat(monorepo): extract Supabase clients into @actorrise/supabase"
```

### Task 1.7: Create `packages/validation`

**Files:**
- Create: `packages/validation/package.json`
- Create: `packages/validation/src/index.ts`

Move shared Zod schemas (e.g. monologue filters, user profile, subscription tier enums) from `apps/web/lib/` here. Re-import in web.

**Verify:** `pnpm --filter web build` succeeds.

**Commit:**
```bash
git commit -m "feat(monorepo): extract Zod schemas into @actorrise/validation"
```

### Task 1.8: Create `packages/api-client`

Typed fetch wrappers around the Python backend.

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/api-client/src/monologues.ts`
- Create: `packages/api-client/src/scripts.ts`
- Create: `packages/api-client/src/scene-partner.ts`

**Design:** Each function takes a `baseUrl` and `accessToken`, returns typed Promise.

```typescript
// packages/api-client/src/monologues.ts
import { MonologueSearchSchema, type MonologueSearchResult } from "@actorrise/validation";

export interface SearchParams {
  q?: string;
  genre?: string[];
  minLength?: number;
  maxLength?: number;
  gender?: string;
  ageRange?: string;
  cursor?: string;
}

export async function searchMonologues(
  baseUrl: string,
  token: string,
  params: SearchParams
): Promise<MonologueSearchResult> {
  const url = new URL("/api/monologues/search", baseUrl);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return MonologueSearchSchema.parse(await res.json());
}
```

**Verify:** Web app imports one function from this package and builds.

**Commit:**
```bash
git commit -m "feat(monorepo): add typed @actorrise/api-client for Python backend"
```

### Task 1.9: Scaffold `apps/mobile` with Expo

**Action:**
```bash
cd apps
pnpm create expo-app mobile --template tabs
cd mobile

# Set name and slug
# Edit app.json:
#   "name": "ActorRise",
#   "slug": "actorrise",
#   "scheme": "actorrise",
#   "ios.bundleIdentifier": "com.actorrise.app"
```

**Update `apps/mobile/package.json` to use workspace deps:**
```json
{
  "name": "@actorrise/mobile",
  "dependencies": {
    "@actorrise/types": "workspace:*",
    "@actorrise/supabase": "workspace:*",
    "@actorrise/validation": "workspace:*",
    "@actorrise/api-client": "workspace:*"
  }
}
```

**Install Expo packages we need now:**
```bash
cd apps/mobile
pnpm add @supabase/supabase-js expo-secure-store expo-linking expo-router expo-constants expo-status-bar
pnpm add @tanstack/react-query @tanstack/query-async-storage-persister @react-native-async-storage/async-storage
pnpm add zod
```

**Verify:**
```bash
cd apps/mobile
pnpm start
# Expo dev server starts. Press 'i' to open iOS simulator. App boots to default tab template.
```

**Commit:**
```bash
git add -A
git commit -m "feat(mobile): scaffold Expo app with tabs template"
```

### Task 1.10: Configure NativeWind

**Action:**
```bash
cd apps/mobile
pnpm add nativewind react-native-reanimated
pnpm add -D tailwindcss@^3.4 prettier-plugin-tailwindcss
npx tailwindcss init
```

**Files to update:**
- `apps/mobile/tailwind.config.js` — set `content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"]`, add `presets: [require("nativewind/preset")]`
- `apps/mobile/babel.config.js` — add `"nativewind/babel"` plugin
- `apps/mobile/metro.config.js` — wrap with `withNativeWind`
- `apps/mobile/global.css` — `@tailwind base; @tailwind components; @tailwind utilities;`
- `apps/mobile/app/_layout.tsx` — import `"../global.css"`
- `apps/mobile/nativewind-env.d.ts` — reference types

Follow the official NativeWind v4 install guide exactly.

**Sync brand color** (`#CB4B00` per memory):
- Add to `tailwind.config.js` theme.extend.colors: `brand: { DEFAULT: "#CB4B00", hover: "#B03000" }`

**Verify:** Run app, replace a `<Text>` style with `className="text-brand text-2xl"`, confirm it renders orange.

**Commit:**
```bash
git commit -m "feat(mobile): configure NativeWind with ActorRise brand colors"
```

### Task 1.11: Configure Expo Router with placeholder routes

**Files:**
- `apps/mobile/app/_layout.tsx` — root layout (providers go here later)
- `apps/mobile/app/(auth)/_layout.tsx` — auth stack
- `apps/mobile/app/(auth)/sign-in.tsx` — placeholder
- `apps/mobile/app/(auth)/sign-up.tsx` — placeholder
- `apps/mobile/app/(tabs)/_layout.tsx` — bottom tabs
- `apps/mobile/app/(tabs)/search.tsx` — placeholder
- `apps/mobile/app/(tabs)/library.tsx` — placeholder
- `apps/mobile/app/(tabs)/scene-partner.tsx` — placeholder
- `apps/mobile/app/(tabs)/profile.tsx` — placeholder

Each placeholder is just a `<View><Text>screen name</Text></View>` for now.

**Verify:** Bottom tab bar shows 4 tabs, switching works. Auth stack reachable.

**Commit:**
```bash
git commit -m "feat(mobile): scaffold Expo Router with auth + tabs"
```

### Task 1.12: Implement Supabase mobile client

**File:** `packages/supabase/src/client-mobile.ts`

```typescript
import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "@actorrise/types";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export function createMobileClient(url: string, anonKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, anonKey, {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // mobile uses deep links, not URL detection
    },
  });
}
```

**Install in mobile:**
```bash
cd apps/mobile
pnpm add react-native-url-polyfill
```

**Wire in mobile root:**
- `apps/mobile/lib/supabase.ts` — instantiate client from env vars
- `apps/mobile/app.json` — add `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` via `.env` and `expo-constants`

**Verify:** Hit `supabase.auth.getSession()` in a tab screen, confirm it returns `null` cleanly (no error).

**Commit:**
```bash
git commit -m "feat(mobile): wire Supabase client with SecureStore persistence"
```

### Task 1.13: Implement sign-in screen matching web providers

**Prerequisite:** Read `apps/web/components/auth/LoginForm.tsx` (or equivalent) and inventory exactly which providers are used. Mirror them.

**Required additions:**
- `expo-apple-authentication` (Apple is mandatory if any other social login is offered)
- `expo-auth-session` + `expo-web-browser` (for OAuth providers like Google)

**File:** `apps/mobile/app/(auth)/sign-in.tsx`

Build with the same provider buttons web has, plus Apple if not already present. Use Supabase's `signInWithIdToken` for Apple, `signInWithOAuth` for others, `signInWithOtp` for magic links.

**Deep-link callback handling:**
- `apps/mobile/app/auth/callback.tsx` — handles the redirect after OAuth; parses session from URL fragment, sets it on the client
- `apps/mobile/app.json` — `scheme: "actorrise"`, intent filters configured

**Supabase dashboard:** Add `actorrise://auth/callback` to Authentication → URL Configuration → Redirect URLs.

**Verify:**
- Sign in with magic link → check email → tap link → app opens → user is signed in
- Sign in with Apple → native sheet → user is signed in
- `supabase.auth.getSession()` returns the session
- Sign out → session cleared from SecureStore

**Commit:**
```bash
git commit -m "feat(mobile): implement sign-in with providers matching web"
```

### Task 1.14: Wire React Query + offline persistence

**File:** `apps/mobile/app/_layout.tsx`

```typescript
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 60 * 24, // 24h
    },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage });

export default function RootLayout() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      {/* router slot */}
    </PersistQueryClientProvider>
  );
}
```

**Verify:** Add a test `useQuery` that fetches from `/api/monologues/search?q=test`, confirm it runs and caches.

**Commit:**
```bash
git commit -m "feat(mobile): wire React Query with AsyncStorage persistence"
```

### Task 1.15: Phase 1 verification

**Manual smoke test on iOS Simulator:**
- [ ] App launches without crash
- [ ] Sign in with each web auth provider works
- [ ] After sign-in, lands on Search tab
- [ ] All 4 tabs reachable
- [ ] Kill app, reopen → still signed in (SecureStore working)
- [ ] Sign out → returns to auth stack

**Commit:**
```bash
git commit --allow-empty -m "chore(mobile): phase 1 skeleton complete, ready for features"
```

---

## Phase 2 — Monologue search + library (1–2 weeks)

The App Store SEO hook. Has to feel fast and obvious.

### Task 2.1: Search screen UI

**File:** `apps/mobile/app/(tabs)/search.tsx`

Layout: search input pinned top, filter chips row below, results list. Use the existing web search page as the design reference for spacing, badge styles, etc., translated to NativeWind.

**Components to build:**
- `apps/mobile/components/search/SearchInput.tsx`
- `apps/mobile/components/search/FilterChips.tsx`
- `apps/mobile/components/search/MonologueCard.tsx`
- `apps/mobile/components/search/EmptyState.tsx`

Apply UI memory: sharp corners on non-clickable tags, `·` separators for metadata, no decorative icons on stats, light hover (just opacity dip on press).

**Verify:** Static UI renders with hardcoded results.

**Commit:** `git commit -m "feat(search): static UI scaffold"`

### Task 2.2: Wire search API

Use `@actorrise/api-client`'s `searchMonologues`. Wrap in `useInfiniteQuery` keyed by filter state. Debounce input by 300ms.

**Verify:** Type a query, see real results from the Python backend.

**Commit:** `git commit -m "feat(search): wire backend search with infinite scroll"`

### Task 2.3: Filter sheet

Bottom-sheet modal (use `@gorhom/bottom-sheet`) for filters: genre, length, gender, age range. Mirror web filter taxonomy exactly.

**Commit:** `git commit -m "feat(search): add filter bottom sheet"`

### Task 2.4: Monologue detail screen

**File:** `apps/mobile/app/monologue/[id].tsx`

Show full monologue text, metadata, source script link, save button, "Rehearse with ScenePartner" CTA (links into Phase 3).

**Commit:** `git commit -m "feat(search): monologue detail screen"`

### Task 2.5: Save/unsave + Library tab

- Save button writes to `saved_monologues` Supabase table (same table web uses)
- `apps/mobile/app/(tabs)/library.tsx` lists user's saved monologues via React Query
- Pull-to-refresh
- Swipe to delete

**Commit:** `git commit -m "feat(library): save and list monologues"`

### Task 2.6: Empty states + error handling

For each list view: loading skeleton, empty state with action ("Search for monologues"), error state with retry.

**Commit:** `git commit -m "feat(search,library): empty + error states"`

### Task 2.7: Phase 2 verification

**Manual smoke test:**
- [ ] Search returns results in <1s
- [ ] Filters narrow results correctly
- [ ] Detail screen shows full text
- [ ] Save works, appears in Library
- [ ] Offline: previously-viewed results still load from cache
- [ ] Pull-to-refresh works on Library

---

## Phase 3 — ScenePartner core (2–3 weeks)

The wedge feature. Audio quality is the differentiator. Test on a real device early (Simulator audio behavior diverges from physical iPhone).

### Task 3.1: Install and configure `expo-audio`

```bash
cd apps/mobile
pnpm add expo-audio
```

**`apps/mobile/app.json` additions:**
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSMicrophoneUsageDescription": "ActorRise records your voice so ScenePartner can rehearse scenes with you.",
        "UIBackgroundModes": ["audio"]
      }
    },
    "plugins": [
      ["expo-audio", { "microphonePermission": "Allow ActorRise to access the microphone for ScenePartner rehearsals." }]
    ]
  }
}
```

**Commit:** `git commit -m "feat(scene-partner): configure expo-audio with mic + background"`

### Task 3.2: Session picker screen

**File:** `apps/mobile/app/(tabs)/scene-partner.tsx`

List the user's uploaded scripts and saved monologues (with multiple characters). Tap one → choose your character → land on session screen.

**Commit:** `git commit -m "feat(scene-partner): session picker"`

### Task 3.3: Session screen scaffold

**File:** `apps/mobile/app/scene-partner/[scriptId].tsx`

States:
- `loading` → fetch script + scenes + pre-rendered partner audio URLs
- `ready` → show first line, "Start" button
- `partner-speaking` → playing partner audio
- `your-line` → recording, waveform shows live input, "Done" advances
- `done` → review screen

Use a state machine (XState or hand-rolled reducer). State must survive screen lock.

**Commit:** `git commit -m "feat(scene-partner): session state machine scaffold"`

### Task 3.4: Pre-fetch and cache partner audio

On session start, kick off a parallel fetch for the next N partner audio files, store under `FileSystem.cacheDirectory + sessionId/`. Stream playback from cache for zero latency.

**Commit:** `git commit -m "feat(scene-partner): pre-fetch partner audio"`

### Task 3.5: Audio session configuration

```typescript
import { setAudioModeAsync } from "expo-audio";

await setAudioModeAsync({
  playsInSilentMode: true,
  allowsRecording: true,
  interruptionMode: "doNotMix",
  shouldPlayInBackground: true,
});
```

Set this once on session entry, restore default on exit.

**Commit:** `git commit -m "feat(scene-partner): audio session with background playback"`

### Task 3.6: Record + save user lines

Per user line: record on entry, save to cache, allow playback in review screen at end of session. Optional v1.1: upload to backend for analysis.

**Commit:** `git commit -m "feat(scene-partner): record user lines"`

### Task 3.7: Lock-screen now-playing

Use `expo-audio`'s metadata API to expose play/pause to control center and lock screen. Title = scene name, artist = "ActorRise".

**Commit:** `git commit -m "feat(scene-partner): lock-screen controls"`

### Task 3.8: Review + completion screen

After last line: show user a list of all their recorded lines with playback, "Restart Scene" and "Done" buttons. Done returns to picker.

**Commit:** `git commit -m "feat(scene-partner): post-session review"`

### Task 3.9: Phase 3 verification (REAL DEVICE)

**Run via `eas build --profile development` and install on your iPhone via Expo dev client.**

- [ ] Mic permission prompt appears with correct copy
- [ ] Partner lines play with no perceptible lag
- [ ] Lock phone mid-session → audio continues, lock-screen controls appear
- [ ] Recording is audible in review
- [ ] No memory crash on a 10+ minute scene
- [ ] AirPods Pro: routing works, mic + playback both go through AirPods

---

## Phase 4 — Subscription + IAP (RevenueCat) (4–5 days)

### Task 4.1: Configure Apple IAP in App Store Connect

- Create 4 auto-renewable subscriptions: `solo_monthly`, `plus_monthly`, `pro_monthly` (Free is just signed-in, no IAP)
- One subscription group: `actorrise_pro`
- Prices: $7, $12, $24/month respectively
- Localized display names, descriptions
- Required: 1 promo screenshot per subscription (can be temporary)

**Commit:** `git commit --allow-empty -m "chore(iap): App Store Connect subscriptions created"`

### Task 4.2: Configure RevenueCat

- Add the 3 product IDs to RevenueCat
- Create 3 entitlements: `solo`, `plus`, `pro`
- Map products → entitlements (pro product → pro entitlement, etc.)
- Create one offering named `default` with the 3 packages

**Commit:** `git commit --allow-empty -m "chore(iap): RevenueCat products configured"`

### Task 4.3: Install and initialize SDK

```bash
cd apps/mobile
pnpm add react-native-purchases
```

**File:** `apps/mobile/lib/revenuecat.ts`

```typescript
import Purchases from "react-native-purchases";

export function initRevenueCat(userId: string) {
  Purchases.configure({
    apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!,
    appUserID: userId, // Supabase user ID — links IAP to user
  });
}
```

Call from `_layout.tsx` after auth resolves.

**Commit:** `git commit -m "feat(iap): initialize RevenueCat SDK"`

### Task 4.4: Paywall screen

**File:** `apps/mobile/app/paywall.tsx`

Show all 4 tiers (including Free as "Continue without subscription"). Match web pricing card visual hierarchy. Purchase calls `Purchases.purchasePackage(pkg)`.

Restore purchases button calls `Purchases.restorePurchases()`.

**Commit:** `git commit -m "feat(iap): paywall + restore"`

### Task 4.5: Supabase edge function for RevenueCat webhook

**File:** `supabase/functions/revenuecat-webhook/index.ts`

Receives RevenueCat events (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION). Writes/updates the `subscriptions` table keyed by `user_id` (which equals RevenueCat `app_user_id`).

Verify webhook signature. Reject unauthorized.

In RevenueCat dashboard: add webhook URL `https://<project>.supabase.co/functions/v1/revenuecat-webhook`.

**Commit:** `git commit -m "feat(iap): RevenueCat webhook → Supabase sync"`

### Task 4.6: Entitlement check helper

Single source of truth on mobile: `useEntitlement()` hook that reads the `subscriptions` table for the current user. Wraps in React Query. Gate features behind this.

**Commit:** `git commit -m "feat(iap): entitlement hook for gated features"`

### Task 4.7: Phase 4 verification

**Use Apple sandbox tester (created in App Store Connect):**
- [ ] Purchase Solo → entitlement appears in app + in Supabase `subscriptions` table
- [ ] Cancel → entitlement removed
- [ ] Restore purchases on fresh install → entitlement re-appears
- [ ] Web user with Stripe Pro → mobile app shows Pro (cross-platform entitlement)

---

## Phase 5 — Polish + App Store submission (1 week)

### Task 5.1: App icon

- 1024×1024 icon, no transparency, no rounded corners (Apple rounds automatically)
- Multiple sizes generated automatically by Expo when set in `app.json` → `ios.icon`
- Design: ActorRise logo on `#CB4B00` background

**Commit:** `git commit -m "chore(brand): add app icon"`

### Task 5.2: Splash screen

- Single image, centered logo on brand color
- Configure via `expo-splash-screen` plugin

**Commit:** `git commit -m "chore(brand): add splash screen"`

### Task 5.3: App Store screenshots

Required sizes: 6.7" (iPhone 15 Pro Max) and 6.1" (iPhone 15) — 2 sizes cover all current iPhones.

Suggested screenshots (10 max, 3 minimum):
1. Search results — "Find your next monologue"
2. Monologue detail — "Full text, instantly"
3. ScenePartner active session — "Rehearse anywhere"
4. ScenePartner pre-fetch + lock screen controls — "Practice on your commute"
5. Library — "All your monologues in one place"
6. Pricing — "Pricing that respects actors"

Use Figma or a tool like `xcrun simctl io booted screenshot`.

**Commit:** `git commit -m "chore(brand): App Store screenshots v1"`

### Task 5.4: Privacy manifest + App Store privacy answers

- `apps/mobile/PrivacyInfo.xcprivacy` (Expo generates much of this automatically)
- App Store Connect → App Privacy → declare collected data:
  - Contact info: email (for auth)
  - User content: audio recordings (ScenePartner)
  - Identifiers: user ID (Supabase)
  - Usage data: app interactions (analytics)
- Link to https://actorrise.com/privacy

**Commit:** `git commit -m "chore(privacy): manifest + App Store answers"`

### Task 5.5: App Store listing copy

- **Name:** `ActorRise`
- **Subtitle:** `Monologues & Scene Rehearsal` (30 char limit)
- **Promotional text:** updateable without resubmission, use for launch announcements
- **Description:** lead with monologue search, ScenePartner as headline feature, then tiers
- **Keywords:** comma-separated, ~100 chars total, e.g.: `monologue,actor,audition,scene,rehearsal,acting,theatre,film,casting,drama`
- **Support URL:** https://actorrise.com/help (create page if needed)
- **Marketing URL:** https://actorrise.com

**Commit:** `git commit -m "chore(submit): App Store listing copy"`

### Task 5.6: Production EAS build + TestFlight

```bash
cd apps/mobile
eas build --platform ios --profile production
# Wait ~20 min
eas submit --platform ios --latest
# Uploads to App Store Connect → TestFlight processing (~1h)
```

**Internal TestFlight pass:** invite yourself + 2–3 actor friends. Live with it for a few days. Watch crash logs in Xcode Organizer.

**Commit:** `git commit --allow-empty -m "chore(submit): build 1.0.0 (1) to TestFlight"`

### Task 5.7: External TestFlight

Once internal is stable, submit external TestFlight (Apple light review, ~1 day). Invite ~20 actors from the existing user list.

**Commit:** `git commit --allow-empty -m "chore(submit): external TestFlight enabled"`

### Task 5.8: App Store submission

Submit for review. Expected review time: 1–3 days.

**Pre-submission checklist:**
- [ ] Sign in with Apple visible alongside other providers
- [ ] No hidden Stripe / web payment links inside the app
- [ ] Privacy manifest matches actual data collection
- [ ] App description does not mention prices that differ from IAP
- [ ] Demo account credentials provided in App Review notes (for any auth-gated feature)
- [ ] Mic permission copy is specific
- [ ] Both screenshot sizes uploaded
- [ ] Age rating set correctly (likely 12+ for dramatic content)

**Commit:** `git commit --allow-empty -m "chore(submit): App Store review submitted"`

---

## Post-launch

### Cleanup

- Use `superpowers:finishing-a-development-branch` to merge `feature/ios-app` to `main`
- Remove the `.worktrees/ios-app` worktree via `git worktree remove`

### v1.1 backlog (deferred from MVP)

- Android via Expo (~2 weeks incremental)
- Self-tape recording mode
- Script upload from mobile (camera OCR via Vision API)
- Push notifications for daily monologue prompts
- AirPlay support for ScenePartner audio
- Apple Watch companion for solo line cues

---

## Skills referenced

- `superpowers:executing-plans` — task-by-task execution
- `superpowers:subagent-driven-development` — dispatch subagents per task with code review
- `superpowers:test-driven-development` — for any task with non-trivial logic (state machines, audio orchestration)
- `superpowers:verification-before-completion` — before each phase-completion commit
- `superpowers:finishing-a-development-branch` — after Phase 5

---

## Risk register (live, update during execution)

| Risk | Status | Mitigation |
|---|---|---|
| Apple rejection on wrapper concern | open | Going fully native, mic + recording features qualify as substantial native functionality |
| Vercel deploy breaks during monorepo migration | mitigate in Task 1.4 | Test on throwaway branch before merging |
| `expo-audio` background mode flaky on certain iOS versions | open | Test on iOS 17 + iOS 18 devices before submission |
| RevenueCat sandbox vs production divergence | open | Test full purchase cycle in sandbox before submitting |
| Apple changes IAP rules mid-implementation | low | Subscribe to Apple developer announcements |
