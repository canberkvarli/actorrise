# Pricing and quotas, against the actual numbers

2026-09-04. Pulled from prod, not assumed.

---

## What the data says

| Tier | Users | Ever uploaded | Ever rehearsed | Most scripts | Most sessions | Session cap |
|---|---|---|---|---|---|---|
| free | 779 | 4 (0.5%) | 37 (4.7%) | 1 | **3** | 3 |
| solo $7 | **0** | – | – | – | – | 3 |
| plus $12 | 28 | 6 | 10 | 2 | 11 | 30 |
| pro $24 | 11 | 1 | 2 | 2 | 24 | -1 |

Three findings, in order of how much they should change what we do.

### 1. The script quota has never bound on anybody

Nobody on any tier has more than **two** scripts. Plus allows five. Pro is
unlimited and its heaviest user has two.

So the question I kept putting to Canberk — does a new "scenes extracted" meter
replace `scene_partner_scripts` or sit beside it — is a question about a limit
nobody has ever touched. **Neither. Do not build the scene meter.** A second
meter on an action that has never once hit its first meter is pure explanation
cost: one more number in the paywall copy, one more thing to reconcile in the
admin, one more way for the picker and the server to disagree, and no revenue
attached to any of it.

The picker still earns its place. It saves the AI spend and the PDF parse, and
picking the nunnery scene is better than extracting all of Hamlet. It just
should not ration.

### 2. Free's session cap is the only wall anyone actually hits

Free users max out at exactly 3 sessions, which is exactly the cap. That is the
one limit in the product doing any work at all, and 37 people have reached it.

Plus allows 30 and its heaviest user has 11. Pro is unlimited and its heaviest
has 24. Both paid caps are decoration.

### 3. Solo is dead and the reason is visible in its own feature row

Zero subscribers. Look at what $7 buys:

```
free  scene_partner_scripts 1   scene_partner_sessions 3
solo  scene_partner_scripts 1   scene_partner_sessions 3    <- identical
```

Solo unlocks monologue sessions and a few more searches. For ScenePartner, the
thing with the AI voice and the microphone, **it changes nothing**. Somebody
paying $7 to rehearse scenes gets the free experience. Nobody has bought it, and
the feature row explains why without needing a survey.

---

## The actual problem

779 free users. 37 have ever rehearsed once. 4 have ever uploaded a script.

The constraint is not the paywall. It is that almost nobody reaches the product
the paywall is protecting. Tuning quotas at 4.7% activation is rearranging the
till while the door is stuck.

That said, the quotas are still wrong in ways worth fixing cheaply, because they
are wrong in the direction of *confusing* rather than *restrictive*.

---

## Recommendations

### A. Do not build the scene meter — REMOVE the one I already put in the client

`SCENE_ALLOWANCE` in `UploadProvider.tsx` (free 1 / solo 10 / plus 40 / pro
unlimited) was invented against a problem the data does not show. It caps Plus
at 40 scenes when the largest thing anyone has uploaded is a 20-scene Hamlet and
no account holds more than two scripts.

Replace it with what is already true: free builds one scene, paid builds the
play. That needs no new meter, no new column, no migration, and it is one
sentence in the picker.

### B. Kill Solo, or make it the ScenePartner tier

Zero subscribers is not a small signal at 818 accounts. Two options:

- **Retire it.** Leaves Free / Plus $12 / Pro $24, which is the three-tier shape
  with an obvious middle. Cleanest, and matches what people actually buy.
- **Repurpose it.** Make $7 the ScenePartner entry: unlimited scenes on one
  script. Only worth it if you want a cheaper door specifically for scene work.

Retiring is my recommendation. A tier nobody buys still costs you: it is a
column on the pricing page, a branch in every gate, and a decision the visitor
has to make before they can get to the one you want them to make.

### C. Make the paid session caps honest

Plus 30 and Pro unlimited, against real maxima of 11 and 24. Either the cap is
real and should be stated plainly, or it is decoration and should be removed.
Decoration in a quota is a liability: the first Plus user who rehearses hard
enough to hit 30 in a month is your best customer, and the product will stop
them.

Recommend: **Plus unlimited too.** The cost per session is TTS, and your heaviest
user across the whole base runs 24 a month.

### D. Free stays at 3 sessions and 1 script

This is the one wall that works, and it is at the right place: after the taste,
before the habit. Do not widen it while activation is the problem, and do not
narrow it either.

---

## What I would do before any of this

The quota work above is an afternoon. The 4.7% is the business.

37 of 779 free users have rehearsed once. Before optimising the paywall, find out
what happens to the other 742 — whether they never reach a scene, bounce off the
mic permission, or hit the room and leave. `rehearsal_started` versus
`rehearsal_completed` versus first-line-delivered will say which, and it is the
same funnel that `memory/activation-cliff-search-to-rehearse.md` flagged in June.

A paywall converts the people who arrive at it. Right now almost nobody does.

---

## Not done, needs Canberk

Nothing in `pricing_tiers` has been touched. Retiring Solo and lifting the Plus
session cap are production pricing changes on live subscribers, so they are his
call, not a side effect of a strategy note.
