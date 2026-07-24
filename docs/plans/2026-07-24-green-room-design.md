# The Green Room — Design

**Date:** 2026-07-24 · **Status:** Approved by Canberk, ready to build Phase A
**One-liner:** A place where two actors rehearse a scene *together* — live, over voice, like a Discord room — fed by a community-shared library of scripts.

This is the collaboration counterpart to the ambient **Callboard** (the activity feed). Callboard = "what's happening." Green Room = "come do it with someone."

## Locked decisions

| Question | Decision |
|---|---|
| Sync model | **Live rooms** (jump in, rehearse together over voice — Discord-room feel), with **async fallback** (leave your lines / AI reads) so a room is never a dead end. |
| Partner sourcing | **Direct invite by link** first (pull in a specific person, even off-platform → new signup). Open matchmaking later. |
| What a room is | **One scene + two roles.** Claim a character, invite/await the other, run it with the script scrolling in sync. |
| Scene supply | Three sources into one picker: (1) existing public-domain scene library, (2) your own uploaded scripts, (3) **NEW: community-shared scripts.** |
| Cold start | Until the community library has **≥3 shared scripts**, show a "this is new — still gathering scripts, share yours to kick it off" state, not an empty shelf. |

## The empty-room problem (and how the design survives it)

At ~320 users / ~2 concurrent, a purely-live room is empty most of the time. The design manufactures presence so you're never staring at nothing:
- **See before you commit** — "N actors in the Green Room," lit vs dark rooms (uses the presence we already track for the Callboard).
- **Invite-a-partner private rooms** — don't wait for a stranger, pull someone in.
- **Async fallback** — enter alone → leave your lines / AI reads until a human joins.
- **Scheduling (later)** — "I'll be in the Room at 7 running Romeo, join me."

## Phasing

### Phase A — Community script library (build first)
Shippable now, **zero live-voice infrastructure**, delivers "participation" immediately, and seeds the scene supply the rooms need so the Green Room launches with content.

- **Data:** `user_scripts.shared_with_community` (bool, default false).
- **Share:** owner toggles "Share with the community" on one of their uploads. Only scripts that parsed into ≥1 two-person scene are shareable (a room needs a scene).
- **Browse:** a community library page listing shared scripts — title, author, owner first name, scene/character count, genre. Opening one shows its scenes (reuses existing scene rendering).
- **Cold start:** `< 3` shared scripts → "we're still gathering scripts" state with a share CTA.
- **Privacy/moderation:** sharing is explicit opt-in. Owner can unshare anytime (retroactive). Consider a light report/hide path before scaling. Only metadata + the scene text the owner uploaded is exposed — same as they already see.

### Phase B — Live rooms (the big one)
On top of a library that already has scenes.
- Scene room: pick scene → claim role → invite link / presence → **live voice** + synced script scroll.
- Presence + "who's in the Green Room."
- Async fallback recording.
- **Open technical decision (defer to Phase B kickoff):** live voice transport — WebRTC peer-to-peer (cheap, 1:1, needs signaling) vs a hosted SFU (LiveKit/Daily/Agora — easier, costs money). Script-scroll sync via Supabase Realtime broadcast. This is the heaviest part; design it separately when Phase A is done.

## Related
- Builds on the scene library + `UserScript`/`Scene` models (see memory: scene-library, scripts architecture).
- Reuses presence/activity plumbing from the Callboard (`community_events`).
- Attacks the search→rehearse activation cliff by making rehearsal social.
