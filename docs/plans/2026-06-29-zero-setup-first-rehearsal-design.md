# Zero-Setup First Rehearsal — Design

**Date:** 2026-06-29
**Author:** Canberk (designed with Claude)
**Status:** Approved, ready for implementation

## Problem

The activation funnel collapses at the final step:

| Step | Count | % |
|---|---|---|
| Signed up | 254 | 100% |
| Completed onboarding | 249 | 98% |
| Ran a search | 225 | 88.6% |
| **Rehearsed a scene** | **10** | **3.9%** |

Onboarding and search work. The product loses ~215 of 225 people in the gap between "searched" and "rehearsed." Rehearsing (ScenePartner) is the core aha moment, and almost no one reaches it. Retention follows: WoW 0% recent weeks, 210/254 dormant, 1.9% stickiness.

Root cause: monologue search and the rehearse feature are disconnected islands. New users land on an empty `/practice` page that requires uploading a script before they can rehearse anything, and the 4 free ready-to-go library scenes are buried at `/rehearse` where new users never look.

## Goal

Get every user into ONE zero-setup rehearsal immediately, before they can wander off. Move the "Rehearsed a scene" funnel step up from 3.9%.

## The Experience

1. Actor finishes onboarding (or, for existing never-rehearsed users, logs in).
2. Instead of landing on empty `/practice`, they are routed straight into a rehearsal view for the hero scene, pre-cast: they play one role, the AI plays the other.
3. A single intro card sits *inside* the rehearsal view: "Your first scene. ~90 seconds. Tap to start when you're ready." plus a quiet "Skip for now" link. No microphone activates until they tap start.
4. They run the scene with the AI partner.
5. On finish: a short win beat ("You just ran your first scene"), then ONE next action: "Now find a scene that's actually yours" leading into search.

**Hero scene:** The Importance of Being Earnest — Gwendolen and Cecily at Tea. Comedic two-hander, both parts meaty, accessible language, the volley with an AI partner lands as genuinely impressive. (Already one of the 4 free library scenes.)

## Trigger Logic

- Condition: user has `scene_partner_sessions == 0` (never rehearsed), evaluated on app entry / login.
- Fires **once** per user, gated by a `has_seen_first_rehearsal` flag on the user (prevents re-triggering on later logins).
- Catches both new signups and the ~210 dormant/never-rehearsed users on their next visit.
- Always skippable: a "Skip, take me to my account" link routes them to their normal landing page and sets the flag.

## Out of Scope (YAGNI for v1)

- Profile-matched scene selection — one hero scene for everyone.
- Personalized post-rehearsal recommendations — one fixed next step.
- The "Rehearse this" monologue bridge button — that is follow-up fix #2, separate work.
- Any change to onboarding fields — 98% complete it; leave it alone.

## Follow-ups (after this ships)

- **Fix #2:** "Rehearse this" button on monologue search results + detail, auto-creating a rehearsable scene from a monologue. The post-rehearsal "find one that's yours" step sets this up.
- Re-engagement email to dormant users pointing at their first scene (marketing).

## Success Metric

The activation funnel's "Rehearsed a scene" step climbs from 3.9%. That single number tells us whether it worked. Secondary: WoW retention and stickiness.
