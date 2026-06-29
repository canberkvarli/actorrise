# Re-engagement email — dormant, never-rehearsed users

Status: DRAFT for Canberk to review. Do not send until approved.

---

SUBJECT: your first scene is one tap now
PREHEADER: no setup, no script upload, just you and a scene.

Hey [first name],

You signed up for ActorRise a while back but never actually ran a scene. That one's on me. The old way made you upload a script before you could rehearse anything, which is a lot to ask before you've even seen if the thing works.

So I fixed it. Now you tap once and you're in a real scene with an AI partner reading the other role out loud. About 90 seconds, no prep. I picked a fun one to start you off, Gwendolen and Cecily from The Importance of Being Earnest, two women being extremely polite and extremely vicious over tea.

Give it one shot. If it does nothing for you, fair enough. But running lines out loud with something that actually answers back is going to surprise you, I think.

[ Run your first scene ]  → https://actorrise.com/first-scene

Canberk
Founder | Actor

---
Notes:
- Audience: users with a completed signup but zero rehearsals (the ~210 dormant accounts). Segment on `scene_partner_sessions == 0`.
- Goal: one click into /first-scene and a completed sample rehearsal. Success = the "Rehearsed a scene" funnel step moves.
- Suggested template: `weekly_engagement.html` or extend `base_personal.html` (personal look). Copy first, HTML after you approve.
- Assumptions: CTA points at /first-scene (the gate also auto-redirects them on next login, so even a plain "open ActorRise" link works). Swap the play if you'd rather lead with a different free scene.
- Voice check: first person singular, no dashes, signed Canberk, no emojis.
