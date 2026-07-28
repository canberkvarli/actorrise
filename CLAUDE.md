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
"reply CURTAIN and I'll take you off the list, no hard feelings"

If a user replies CURTAIN (or otherwise asks to stop), add their email to `email_do_not_contact` in Supabase right away. Keep the unsubscribe link too, this is in addition to it, not a replacement.

## Trial-link CTA (dramatic one-word ask)

No coupon codes. FOUNDER3 is retired as of 2026-07-22. Actors just use the Stripe trial: Plus membership, 2 weeks free, card on file, then the yearly charge (cancel anytime before it hits). Do NOT offer or reference FOUNDER3 or any coupon in new drafts.

When offering the trial to actors, studios, or community theaters, close with a short, theatrical, one-word reply CTA instead of a generic "happy to answer questions" line: "If you want in, reply CURTAIN and I'll send you the link." One-word replies convert fastest with Canberk's audience, so keep the CTA to a single word.

Trial link (base): https://buy.stripe.com/00w6oJgG8gjAaVSgsl6g801

PREFILLED-EMAIL RULE (critical, do not skip): when someone replies CURTAIN, send them the link with their email appended as `?prefilled_email=<their address>`, using the exact address they replied from (that is their ActorRise account email). Example: https://buy.stripe.com/00w6oJgG8gjAaVSgsl6g801?prefilled_email=giosboss4@gmail.com . The webhook grants Plus by matching the checkout email to their ActorRise account, so a prefilled link makes the match automatic. Never send the bare base link to a specific person, and do not embed the link in cold outreach (only send after a CURTAIN reply).

Note: CURTAIN is intentionally reused as BOTH the trial opt-in word AND the marketing opt-out word above. Canberk relies on context to tell them apart (a reply to a cold trial pitch = sign-up; a reply to a re-engagement/marketing email he already sent to an existing user = opt-out). If a CURTAIN reply's intent is genuinely ambiguous, flag it for Canberk rather than assuming either way.

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
