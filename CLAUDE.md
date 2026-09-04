# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

---

# ActorRise Marketing Mode

ActorRise is a solo project by **Canberk** (founder + working actor). When Canberk asks for marketing help — user acquisition, emails to users, social posts, launch copy, founder updates, growth ideas — invoke the `marketing` skill. Sub-skills: `draft-actorrise-email`, `write-actor-social-post`.

Trigger phrases that mean "go into marketing mode" and invoke the `marketing` skill:
- `/marketing` (treat as direct invocation)
- "marketing", "draft an email to users", "email about X", "write a post", "tweet about X", "instagram caption", "how do we get more actors", "promote X", "announce Y", "founder update"

## Non-negotiable voice rules (apply to ALL marketing output)

1. **First person singular only.** "I", "me", "my". NEVER "we", "our", "us", or "the ActorRise team".
2. **No dashes.** No em dash (—), en dash (–), or long hyphen. Use commas, periods, or rewrite. They look AI-generated.
3. **Sign off as `Canberk`** in emails. Never "The ActorRise Team".
4. **Tone:** Casual, warm, direct, like texting a friend who's also an actor. No corporate phrases ("excited to announce", "leverage", "unlock", "revolutionize", "game-changer").
5. **No emojis** unless Canberk explicitly asks.
6. **Audience:** working/aspiring actors, peer-to-peer not CEO-to-customer.

Reference example of Canberk's actual voice: user memory `email-voice.md`.

## Opt-out requirement (current-user emails)

Any marketing email sent to existing platform users (not cold outreach) must include a plain reply-to-opt-out option in the body or sign-off, not just the unsubscribe link. Reason: the /unsubscribe page's "Other" feedback reason has no free-text field (bug, not yet fixed as of 2026-07-09), so users who want to explain why they're leaving get stuck and end up emailing instead.

Standard line, place near the sign-off:
"reply UNSUBSCRIBE and I'll take you off the list, no hard feelings"

If a user replies UNSUBSCRIBE (or otherwise asks to stop), add their email to `email_do_not_contact` in Supabase right away. Keep the unsubscribe link too, this is in addition to it, not a replacement.

## Trial-link CTA (dramatic one-word ask)

No coupon codes. FOUNDER3 is retired as of 2026-07-22. Actors just use the Stripe trial: Plus membership, 2 weeks free, card on file, then the yearly charge (cancel anytime before it hits). Do NOT offer or reference FOUNDER3 or any coupon in new drafts.

INDIVIDUAL ACTORS ONLY (corrected 2026-09-02): the CURTAIN CTA is for **individual actors** — current platform users and individual actor signups. When offering them the trial, close with a short, theatrical, one-word reply CTA instead of a generic "happy to answer questions" line: "If you want in, reply CURTAIN and I'll send you the link." One-word replies convert fastest with that audience, so keep the CTA to a single word.

NEVER use CURTAIN in organizational outreach — theaters, studios, acting coaches, schools, chapters, libraries. Writing to an org is a peer-to-peer marketing email, not a signup funnel. It should read personal and warm, land the offer plainly, and end like one working theater person writing to another. Give the next step directly ("reply and I'll set your actors up", "tell me how many and I'll sort it") instead of asking a stranger to learn a code word. Supporting data as of 2026-09-02: across every batch sent to orgs, not one recipient has ever replied CURTAIN, while every actual conversion came from a plain human exchange.

FIRST-TOUCH ONLY (added 2026-08-19): even for individual actors, the CURTAIN CTA belongs ONLY in a first-touch email. NEVER use it mid-conversation (a reply on an existing thread, an inbound lead, or anyone already talking with Canberk). In an ongoing conversation, just make the offer plainly and give the next step directly, no CURTAIN line.

Trial link (base), 2 weeks / 14 days: https://buy.stripe.com/00w8wR4Xqd7o7JGa3X6g802

LINK LENGTHS DIFFER, CHECK BEFORE SENDING. Three live Stripe payment links exist and only the first matches the "2 weeks free" copy above:
- `00w8wR4Xqd7o7JGa3X6g802` — Plus $99/yr, **14-day** trial. This is the one to send.
- `00w6oJgG8gjAaVSgsl6g801` — Plus $99/yr, **90-day** trial. Older founder-era link, do NOT send with 2-week copy.
- `28EbJ30Had7o1li8ZT6g800` — Pro $199/yr, **90-day** trial.

The in-app upgrade path (UpgradeModal → `/api/subscriptions/checkout` with `trial=true`) is a separate 14-day trial set in `backend/app/api/subscriptions.py`. It already matches the 2-week copy.

PREFILLED-EMAIL RULE (critical, do not skip): when someone replies CURTAIN, send them the link with their email appended as `?prefilled_email=<their address>`, using the exact address they replied from (that is their ActorRise account email). Example: https://buy.stripe.com/00w8wR4Xqd7o7JGa3X6g802?prefilled_email=giosboss4@gmail.com . The webhook grants Plus by matching the checkout email to their ActorRise account, so a prefilled link makes the match automatic. Never send the bare base link to a specific person, and do not embed the link in cold outreach (only send after a CURTAIN reply).

Note: CURTAIN is now the trial SIGN-UP word only. Marketing/re-engagement opt-outs use a separate, plain word: UNSUBSCRIBE (see the Opt-out requirement section above). The two no longer overlap, so a CURTAIN reply always means "sign me up for the trial" and an UNSUBSCRIBE reply always means "take me off the list." No context-guessing needed. (Changed 2026-08-17: opt-out was previously also CURTAIN, which was too appealing and got over-used.)

## Educators & students free-access offer (added 2026-08-19)

Educators, teachers, coaches, teaching artists, and their students do NOT get the Stripe trial and do NOT get the CURTAIN CTA. They get free Plus directly. The mechanism to give in emails:

1. They sign up at https://actorrise.com (free to start).
2. They email canberk@actorrise.com the address they signed up with.
3. Canberk manually upgrades that account, on him.

DURATIONS (revised 2026-09-05, replaces the old flat "3 months" — do NOT promise
three months in new drafts):
- **Educators: 1 month**, with the door left open. Always say the extension is
  there for the asking ("need longer? just say so and I'll push it out").
- **Students: 2 weeks to try, or 1 month.** Either is fine, pick by context; a
  whole class coming in together reads better on the same month so the dates
  don't scatter.

STUDENTS COME THROUGH THEIR TEACHER (added 2026-09-05). Do not run a student
signup drive and do not email students directly to offer this. The teacher
reaches out with their students' addresses and Canberk grants them in a batch.
Reason: the one email blast straight to students went badly (2026-09-04, seven
NMU actors, an unsubscribe inside two minutes), while the teacher route worked
first try — Stephanie DeYoung at Del Norte replied inside five hours and offered
to collect her class list. So in educator emails, always include the "send me
your students' emails and I'll do the same for them" line. That line IS the
student funnel.

Frame it as a gift, not a discount ("I don't run a discount, I just give it to you free"). This replaces any "reply CURTAIN" language for educator/student contexts. Prefer it over the trial whenever the audience is educators or students.

In the admin, `/admin/users/<id>` → Grant comp membership has one-tap presets for
all three (Educator · 1 month, Student · 2 weeks, Student · 1 month). Each sets
the tier, the duration AND the account_type together, so use those rather than
setting the fields by hand.

## Brand

- Primary `#CB4B00`, hover `#B03000`
- Domain: actorrise.com
- IG: @canberk.varli | X: @canberkvarli | Email: canberk@actorrise.com

## Never autonomously

- Send an email
- Post to social
- Push marketing-page commits
- Make up testimonials, user quotes, or stats

Always draft → show Canberk → he approves → he sends/posts.
