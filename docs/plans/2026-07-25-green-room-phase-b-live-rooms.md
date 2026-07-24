# Green Room Phase B — Live Rooms

**Date:** 2026-07-25 · **Status:** building
**Goal:** Two actors jump into a room and rehearse a scene together, live.

## Architecture (no heavy infra)

A **room is a Supabase Realtime channel**, not a DB table. Room id lives in the
URL; everything ephemeral rides the channel:
- **presence** — who's in the room (Supabase Realtime presence)
- **broadcast** — synced current-line, role claims, "start/next"
- **WebRTC signaling** — SDP offer/answer + ICE candidates over broadcast

**Voice = WebRTC peer-to-peer** (1:1 mesh, 2 people). No SFU, no per-minute cost.
Supabase Realtime is only the signaling channel. If we ever want group rooms,
swap in a hosted SFU (LiveKit/Daily) — deferred.

The scene itself loads from the API. Since rooms rehearse **shared** community
scripts owned by other actors, we need a public read for a shared script's
scenes+lines (owner-gated endpoints won't do).

## Build order (each increment verifiable on its own)

1. **Backend — read a shared script's scenes.** `GET /api/community/scripts/{id}`
   → the script + its scenes (with lines), guarded by `shared_with_community OR
   is_sample`. Unblocks rooms rehearsing shared/demo scenes. ✅ testable via curl.
2. **Room scaffold (no audio).** `/greenroom/room/[roomId]` — join a channel,
   presence (who's here), load the scene, claim a role, step the current line
   (broadcast-synced), copy invite link. Verifiable single-browser (presence =
   me, invite copies, stepping broadcasts to a 2nd tab).
3. **Entry point.** "Rehearse together" on community library cards → mint a
   roomId → open the room for that script (pick scene inside).
4. **WebRTC audio.** getUserMedia → RTCPeerConnection, offer/answer + ICE over
   the channel; mute toggle; show who's talking. ⚠️ needs a real TWO-DEVICE test
   before we trust it — cannot be verified from one browser. Ship behind a clear
   "(beta)" until tested.
5. **Async fallback + presence in the Green Room** (later): "N in the room now",
   and if you're alone, leave your lines / AI reads.

## Privacy / safety
- Room ids are random + unguessable; the link is the capability (like a Meet
  link). No room listing/browse in v1 — you only get in via invite.
- Voice is peer-to-peer, not stored.

## Open
- Reconnect/refresh handling (rejoin channel, renegotiate).
- Mobile Safari WebRTC quirks (test on a phone).
