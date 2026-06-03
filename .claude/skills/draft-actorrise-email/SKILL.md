---
name: draft-actorrise-email
description: Use when drafting any email for ActorRise users — marketing announcements, founder updates, weekly engagement, re-engagement, launch emails, feature announcements, founder offers, beta invites, testimonial requests, or any user-facing email from Canberk. Triggers on "draft an email", "send users an email", "email about X", "founder update", "announcement email".
---

# Drafting ActorRise Emails

You are drafting an email from Canberk (solo founder + actor) to ActorRise users.

## Required inputs — ASK if missing

Before drafting, confirm in ONE message:
1. **Goal:** What should the reader DO after reading? (sign up, click a link, reply, share, upgrade, just feel informed)
2. **Audience:** All users? Free users? Plus subscribers? Lapsed users? People who signed up but never used it?
3. **Hook:** What's the news, story, or reason to send NOW? If there's no real reason, push back — Canberk doesn't spam.

If Canberk gives you a one-liner like "email users about the new monologues feature", make reasonable calls on (2) and (3), draft, and flag your assumptions at the top.

## Voice rules (enforce strictly)

- First person singular only: "I", "me", "my"
- Sign off: `Canberk` (just the name, optionally followed by `Founder | Actor` on a second line)
- NO dashes (em, en, or long hyphen). Use commas, periods, or rewrite.
- NO "we / our / us / the team"
- NO emojis unless explicitly requested
- NO corporate phrases: "excited to announce", "leverage", "synergy", "unlock potential", "game-changer", "revolutionize"
- Short paragraphs (1-3 sentences each)
- Casual but specific. Talk about real actor situations.

## Structure template

```
Subject: [under 50 chars, specific, no clickbait]

Preheader: [optional — first line that previews in inbox]

Hey [first name if personalized, otherwise skip],

[Opening: 1-2 sentences. Get to the point or hook fast. No "I hope this email finds you well."]

[Body: 1-3 short paragraphs. The thing you actually want to say. Specific examples.]

[Optional ask: clear, low-friction CTA. One ask per email.]

[Optional sign-off line: a warm one-liner. Skip if forced.]

Canberk
```

## Examples of GOOD opens

- "Hey Marcus, I built something this week that solved a problem I've been hitting in my own self-tapes."
- "Hey, quick one. The monologue search is live."
- "So I've been getting the same question from like 12 actors this week, figured I'd just write back to everyone at once."

## Examples of BAD opens (rewrite if you see these)

- "We're excited to announce..." → "I built..."
- "The ActorRise team is thrilled..." → "I'm stoked..."
- "We hope this email finds you well..." → just cut it
- "Unlock your acting potential with our new feature..." → "Here's what's new..."

## Subject line patterns that work

- `the [feature] is live` ("the monologue library is live")
- `quick one` / `quick update` (for short founder notes)
- `[specific actor pain] → [solution]` ("self-tape readers that don't suck")
- `built this for you` (personal touch)
- `your [thing] is ready` (transactional feel for marketing)

## Subject lines to NEVER send

- "🎬 Big news inside! 🎬"
- "Don't miss out!"
- "URGENT" / "ACTION REQUIRED"
- "[Name], you won't believe..."
- Anything with multiple emojis

## Check existing templates first

Before writing new HTML, check `backend/app/services/email/templates/`. If `weekly_engagement.html`, `custom.html`, or `founder_offer.html` already covers the format, just write the *copy* and tell Canberk which template to drop it into.

For brand-new email types, extend `base_personal.html` (not `base.html`) — personal is the default look.

## Output format

Deliver as:

```
SUBJECT: [line]
PREHEADER: [line, optional]

[body copy in plain text, exactly as it should read]

---
Notes:
- Audience: [who this goes to]
- Goal: [what success looks like]
- Suggested template: [filename]
- Assumptions: [anything you guessed]
```

Do NOT write the HTML unless Canberk asks. Copy first. Canberk reviews. Then HTML.

## Never do

- Send the email yourself. Always draft + show. Canberk sends.
- Add a P.S. just because "P.S. boosts open rates." Only add if it earns its spot.
- Promise features that don't exist yet.
- Reference a date relative to "today" without making it absolute.
