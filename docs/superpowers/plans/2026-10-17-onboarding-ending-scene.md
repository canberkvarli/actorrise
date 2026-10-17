# Onboarding Ending: The Scene For Everyone (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The new-account onboarding card ends on "say one line" (the guided scene "Late"), picks are kept silently only when casting or playing age was answered, and the win screen says how many are on the shelf. Spec: `docs/superpowers/specs/2026-10-17-onboarding-ending-scene-design.md`.

**Architecture:** The hub's Answer tap (mic prime, find the guided scene, log, route) moves into `lib/guided-start.ts` so the card and the hub share it. `ProfileOnboardingFlow` gets an `ending` phase for `variant="new"`; the backfill variant keeps the payoff. A sessionStorage flag (`lib/onboardingPicks.ts`) carries the kept count from the card to `SceneWin`.

**Tech Stack:** Next.js app router, framer-motion, vitest, FastAPI (one allowlist edit).

---

### Task 1: `lib/guided-start.ts` (shared Answer) + `lib/onboardingPicks.ts` (kept flag)

**Files:**
- Create: `lib/guided-start.ts`, `lib/guided-start.test.ts`, `lib/onboardingPicks.ts`, `lib/onboardingPicks.test.ts`
- Modify: `lib/events.ts` (union), `backend/app/services/events.py` (`CLIENT_EVENT_NAMES`)

- [ ] **Step 1: Failing tests**

`lib/guided-start.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { guidedRoute, platformOf } from "./guided-start";

describe("guided start", () => {
  it("routes to the guided run", () => {
    expect(guidedRoute(937)).toBe("/scenes/937/rehearse?guided=1");
  });
  it("names the platform from the user agent", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(platformOf("Mozilla/5.0 (Macintosh)")).toBe("desktop");
  });
});
```
`lib/onboardingPicks.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PICKS_KEPT_KEY, noteOnboardingPicksKept, takeOnboardingPicksKept } from "./onboardingPicks";

function memory() {
  const m = new Map<string, string>();
  return () => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
}
const throwing = () => { throw new Error("SecurityError"); };

describe("onboarding picks kept flag", () => {
  it("is zero until noted, and read once", () => {
    const s = memory();
    expect(takeOnboardingPicksKept(s)).toBe(0);
    noteOnboardingPicksKept(6, s);
    expect(s().getItem(PICKS_KEPT_KEY)).toBe("6");
    expect(takeOnboardingPicksKept(s)).toBe(6);
    expect(takeOnboardingPicksKept(s)).toBe(0);
  });
  it("ignores zero and garbage", () => {
    const s = memory();
    noteOnboardingPicksKept(0, s);
    expect(s().getItem(PICKS_KEPT_KEY)).toBeNull();
    s().setItem(PICKS_KEPT_KEY, "six");
    expect(takeOnboardingPicksKept(s)).toBe(0);
  });
  it("survives a throwing storage", () => {
    expect(takeOnboardingPicksKept(throwing)).toBe(0);
    expect(() => noteOnboardingPicksKept(3, throwing)).not.toThrow();
  });
});
```
Run: `npx vitest run lib/guided-start.test.ts lib/onboardingPicks.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement**

`lib/guided-start.ts`:
```ts
import api from "@/lib/api";
import { trackEvent } from "@/lib/events";

/** Which door the actor came through. Read apart in guided_scene_started. */
export type GuidedDoor = "hub" | "onboarding";

export function guidedRoute(sceneId: number): string {
  return `/scenes/${sceneId}/rehearse?guided=1`;
}

export function platformOf(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** The guided scene's id. Stable on prod (937) but fetched, never hard-coded. */
export async function fetchGuidedSceneId(): Promise<number> {
  const { data } = await api.get<{ scene_id: number; character: string }>("/api/rehearsal/guided");
  return data.scene_id;
}

/** Ask for the mic INSIDE the tap, so the rehearse page inherits a granted
 *  permission instead of asking again on arrival. Denied is fine: the page
 *  falls back to tap mode. */
export async function primeMic(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* denied or unavailable: the page copes */
  }
}

/**
 * The Answer tap, shared by the hub invitation and the onboarding ending.
 * Resolves to the route to push. Throws when the scene cannot be found so the
 * caller can say "that didn't start".
 */
export async function startGuidedScene(from: GuidedDoor, knownId?: number | null): Promise<string> {
  await primeMic();
  const id = knownId ?? (await fetchGuidedSceneId());
  trackEvent("guided_scene_started", { platform: platformOf(navigator.userAgent), from });
  return guidedRoute(id);
}
```
`lib/onboardingPicks.ts`:
```ts
/** How many picks the onboarding card kept, carried to the win screen of the
 *  first scene and read once. sessionStorage: it is about this sitting. */
export const PICKS_KEPT_KEY = "arc.onboardingPicksKept";

type GetStorage = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session: GetStorage = () => window.sessionStorage;

export function noteOnboardingPicksKept(count: number, storage: GetStorage = session): void {
  if (count <= 0) return;
  try {
    storage().setItem(PICKS_KEPT_KEY, String(count));
  } catch {
    /* private mode: the win screen just says nothing about the shelf */
  }
}

export function takeOnboardingPicksKept(storage: GetStorage = session): number {
  try {
    const raw = storage().getItem(PICKS_KEPT_KEY);
    if (raw === null) return 0;
    storage().removeItem(PICKS_KEPT_KEY);
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
```
`lib/events.ts`: add to `UserEventName` after `"onboarding_question_skipped"`:
```ts
  | "onboarding_ending_shown"
  | "onboarding_ending_answer"
  | "onboarding_ending_skip"
  | "onboarding_picks_kept"
```
`backend/app/services/events.py`: add the same four names to `CLIENT_EVENT_NAMES` next to `"onboarding_step_viewed"`, each with a short comment.

Run the two test files → PASS. Run `cd backend && .venv/bin/python -m pytest tests/ -q -k events` → PASS.

- [ ] **Step 3: Commit**
```bash
git add lib/guided-start.ts lib/guided-start.test.ts lib/onboardingPicks.ts lib/onboardingPicks.test.ts lib/events.ts backend/app/services/events.py
git commit -m "Guided start shared between the hub and the card; picks-kept flag; four onboarding ending events"
```

---

### Task 2: The hub uses the shared start

**Files:**
- Modify: `components/practice/GuidedInvitation.tsx` (`answer` ≈ lines 80–120)

- [ ] **Step 1: Replace the body of `answer`**

Import `{ fetchGuidedSceneId, guidedRoute, startGuidedScene }` from `@/lib/guided-start`. The prefetch effect keeps its own GET but can call `fetchGuidedSceneId()` and `router.prefetch(guidedRoute(id))`. `answer` becomes:
```ts
  const answer = async () => {
    if (starting) return;
    setStarting(true);
    setFailed(false);
    try {
      router.push(await startGuidedScene("hub", sceneId));
      setTimeout(() => void refreshUser(), 4000);
    } catch {
      setFailed(true);
      setStarting(false);
    }
  };
```
Delete the now-unused inline getUserMedia and platform code and the `trackEvent` import if nothing else uses it (the `guided_scene_shown` effect still does; keep it).

- [ ] **Step 2: `npx tsc --noEmit` clean, `npx eslint components/practice/GuidedInvitation.tsx` clean. Commit.**
```bash
git add components/practice/GuidedInvitation.tsx
git commit -m "Hub invitation: Answer goes through lib/guided-start"
```

---

### Task 3: The card ends on the scene

**Files:**
- Modify: `lib/onboardingFilters.ts` (+ `shouldFetchPicks`), `lib/onboardingFilters.test.ts` (create if missing)
- Modify: `components/onboarding/ProfileOnboardingFlow.tsx`

- [ ] **Step 1: Failing test for the lever guard**

`lib/onboardingFilters.test.ts` (append or create):
```ts
import { describe, expect, it } from "vitest";
import { shouldFetchPicks } from "./onboardingFilters";

const base = { casting: "", ageRange: "", workOn: [], mediums: [], stage: "" };
describe("shouldFetchPicks", () => {
  it("needs casting or age", () => {
    expect(shouldFetchPicks(base)).toBe(false);
    expect(shouldFetchPicks({ ...base, casting: "Female" })).toBe(true);
    expect(shouldFetchPicks({ ...base, ageRange: "20-29" })).toBe(true);
    expect(shouldFetchPicks({ ...base, workOn: ["comedic"], stage: "working_pro" })).toBe(false);
  });
});
```
(Check `OnboardingAnswers` for the exact field shapes before writing `base`; casting may be a union type, cast with `as OnboardingAnswers` if needed.) Run → FAIL.

- [ ] **Step 2: Implement the guard**

In `lib/onboardingFilters.ts`:
```ts
/** Picks are only worth keeping when the search has a lever to pull. Without
 *  casting or age the "picks" are the top of an unfiltered search, which is
 *  not a pick. */
export function shouldFetchPicks(a: OnboardingAnswers): boolean {
  return Boolean(a.casting) || Boolean(a.ageRange);
}
```
Run → PASS.

- [ ] **Step 3: The `ending` phase in the flow**

In `ProfileOnboardingFlow.tsx`:

1. Imports: add `shouldFetchPicks` to the `@/lib/onboardingFilters` import; add `import { fetchGuidedSceneId, startGuidedScene } from "@/lib/guided-start";`, `import { noteOnboardingPicksKept } from "@/lib/onboardingPicks";`, and `import { GUIDED_ACTOR, GUIDED_LINE_COUNT, GUIDED_PARTNER } from "@/lib/guided-scene";`.
2. Phase type: `useState<"q" | "settling" | "ending" | "payoff">("q")`.
3. A ref for the prefetched scene id: `const guidedIdRef = useRef<number | null>(null);`
4. `handleFinishQuestions` becomes:
```ts
  const handleFinishQuestions = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setDirection(1);
    setPhase("settling");
    // The scene id, fetched while the profile writes so Answer is instant.
    if (variant === "new") {
      void fetchGuidedSceneId().then((id) => { guidedIdRef.current = id; }).catch(() => {});
    }
    try {
      await persist();
    } catch {
      setPhase("q");
      setSubmitting(false);
      return;
    }
    if (variant === "backfill") {
      setPicks(await fetchPicks(answers));
      setPhase("payoff");
      return;
    }
    // New accounts: the picks are a side effect, kept without being shown,
    // and only when there is a lever to pick by. Then the scene.
    if (shouldFetchPicks(answers)) {
      const list = await fetchPicks(answers);
      if (list.length) {
        keepsInFlight.current = list.map((m) => api.post(`/api/monologues/${m.id}/favorite`).catch(() => {}));
        noteOnboardingPicksKept(list.length);
        trackEvent("onboarding_picks_kept", { count: list.length });
      }
    }
    trackEvent("onboarding_ending_shown");
    setPhase("ending");
    setSubmitting(false);
  }, [submitting, persist, answers, variant]);
```
5. Two handlers:
```ts
  const [answering, setAnswering] = useState(false);
  const [answerFailed, setAnswerFailed] = useState(false);
  const answerScene = useCallback(async () => {
    if (answering) return;
    setAnswering(true);
    setAnswerFailed(false);
    trackEvent("onboarding_ending_answer");
    try {
      const route = await startGuidedScene("onboarding", guidedIdRef.current);
      endFlow();
      router.push(route);
    } catch {
      setAnswerFailed(true);
      setAnswering(false);
    }
  }, [answering, endFlow, router]);
  const skipScene = useCallback(() => {
    trackEvent("onboarding_ending_skip");
    endFlow();
    router.push("/monologues");
  }, [endFlow, router]);
```
6. `numeral`: `phase === "payoff" || phase === "ending" ? "✦" : undefined`.
7. Last-question CTA label: `variant === "new" ? "Set my stage" : "Show me my monologues"`.
8. Render branch: before the payoff branch add
```tsx
          ) : phase === "ending" ? (
            <motion.div key="ending" initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={stepTransition}>
              <OnboardingEnding onAnswer={answerScene} onSkip={skipScene} answering={answering} failed={answerFailed} />
            </motion.div>
```
9. The component, next to `OnboardingPayoff`:
```tsx
/**
 * The last beat for a new account: not a list of pieces, one line to say.
 * Four in five actors who met "You're late" on the hub after this card went
 * and searched instead (2026-09-29 to 10-17: 179 saw it, 35 answered). The
 * card had just trained them to think in monologues. So the card ends on the
 * scene, and the picks it would have shown are already on the shelf.
 */
function OnboardingEnding({ onAnswer, onSkip, answering, failed }: {
  onAnswer: () => void; onSkip: () => void; answering: boolean; failed: boolean;
}) {
  const partner = GUIDED_PARTNER[0] + GUIDED_PARTNER.slice(1).toLowerCase();
  const actor = GUIDED_ACTOR[0] + GUIDED_ACTOR.slice(1).toLowerCase();
  return (
    <div className="px-5 pb-[48px] pt-10 text-center sm:px-7 sm:pb-[60px] sm:pt-12">
      <p className="text-[13px] italic tracking-[0.06em]" style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}>
        (before anything.)
      </p>
      <h2 className="mt-2 font-normal leading-none tracking-[-0.02em]" style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)" }}>
        Say <em className="italic" style={{ color: "var(--acc)" }}>one line.</em>
      </h2>
      <p className="mx-auto mt-4 max-w-[34ch] text-[15px] leading-relaxed" style={{ color: "var(--t-muted-dark)" }}>
        {answering ? `${partner} is waiting.` : `I'll read ${partner}. You're ${actor}. ${GUIDED_LINE_COUNT} lines, under a minute.`}
      </p>
      <div className="mt-7 flex justify-center">
        <CtaPill onClick={onAnswer} disabled={answering}>{answering ? "One moment" : "Answer"}</CtaPill>
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--t-muted-dark)" }}>
          That didn&apos;t start. Try once more.
        </p>
      )}
      <p className="mt-6 text-[13px]" style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}>
        <FootLink onClick={onSkip}>skip, take me to the library</FootLink>
      </p>
    </div>
  );
}
```
Check `CtaPill`'s existing markup for an arrow dot and keep it. If `GUIDED_PARTNER` casing helpers already exist (`titleCase` in GuidedInvitation), move `titleCase` into `lib/guided-scene.ts` and use it in both places instead of the inline slice.

- [ ] **Step 4: `npx tsc --noEmit`, `npx eslint components/onboarding/ProfileOnboardingFlow.tsx lib/onboardingFilters.ts`, `npx vitest run` → clean/green. Commit.**
```bash
git add lib/onboardingFilters.ts lib/onboardingFilters.test.ts components/onboarding/ProfileOnboardingFlow.tsx lib/guided-scene.ts components/practice/GuidedInvitation.tsx
git commit -m "Onboarding ends on the first scene; picks kept silently only when casting or age was answered"
```

---

### Task 4: The win screen names the shelf

**Files:**
- Modify: `components/rehearse/SceneWin.tsx`, `app/(platform)/scenes/[id]/rehearse/Ending.tsx`

- [ ] **Step 1: Prop + line**

`SceneWin` gets `kept?: number` (default 0). Inside `.t-win__doors`, after the "Find a monologue" link:
```tsx
        {kept > 0 && (
          <Link href="/rehearse" className="t-win__alt">
            {kept} {kept === 1 ? "piece is" : "pieces are"} on your shelf
          </Link>
        )}
```
`GuidedEnd` in `Ending.tsx`: `const [kept] = useState(() => takeOnboardingPicksKept());` (import from `@/lib/onboardingPicks`) and pass `kept={kept}`.

- [ ] **Step 2: `npx tsc --noEmit` + eslint clean. Commit.**
```bash
git add components/rehearse/SceneWin.tsx "app/(platform)/scenes/[id]/rehearse/Ending.tsx"
git commit -m "First-scene win screen: the pieces onboarding kept are one tap away"
```

---

### Task 5: Verify, merge, push

- [ ] `npx vitest run`, `npx tsc --noEmit`, `cd backend && .venv/bin/python -m pytest tests/ -q` → green.
- [ ] Phone-width check at 390px with a NEW account (signup → card → Set my stage → ending → Answer lands on `/scenes/<id>/rehearse?guided=1`; skip lands on /monologues). The demo account never sees the card (`has_completed_onboarding` true), so sign up a throwaway on localhost or temporarily flip the flag on a dev user. Mic cannot be verified headless; say so.
- [ ] Merge to main, push, delete the branch. Memory note.
