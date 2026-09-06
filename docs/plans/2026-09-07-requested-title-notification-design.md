# Telling the actor who asked

Design, 2026-09-07. Validated with Canberk in three slices.

## What this is

When an actor presses track on something we do not carry, and Canberk later
ingests it, the admin offers a one-tap draft telling that actor it is up.

## Why this shape and not the obvious one

The obvious version emails anyone whose search failed. Canberk's own words on
that: it would read as "yeah we watch what you type". He is right, and the
distinction that fixes it is consent. A tracked request is a raised hand, so the
reply is answering a question rather than reporting surveillance.

Volume is small on purpose. Roughly 7 genuine gaps in 30 days. Every send is
wanted, which is the whole point.

## The blocker, and the fix

`content_requests` records `play_title`, `author`, `character_name`,
`request_count`, timestamps and `status`. It records **no user**. So today the
feature is impossible from that table.

The requester is recoverable: joining request text against `search_logs.query`
and `content_gap->>'play'` finds a user for 13 of the 14 existing requests. Mean
Girls has 3 waiting, Death of a Salesman 2.

So:

- New link table `content_request_requesters`: `content_request_id`, `user_id`,
  `created_at`. Nothing else. Unique on the pair.
- Backfill it once from `search_logs` so the existing 14 are not lost.
- Write to it at track time, in `upsert_content_request`.

## The flow

1. Actor presses track. Link row written.
2. Canberk ingests the title whenever he gets to it.
3. The request row notices the title now resolves in the catalogue and shows
   "3 waiting, ready to tell them".
4. Tap. The existing `/api/admin/emails/preview` builds a draft per person.
5. Read, edit, send via the existing `/send`. Each requester is marked notified.

Two properties fall out of this for free:

**The queue cleans itself.** The button only appears when the title genuinely
resolves. About half the queue is vibes rather than titles ("High stakes",
"monologues for women", "Power dynamics", "drgff"). Those rows never light up
and never need triage.

**Do-not-contact is checked before the draft is built**, not after, so an
opted-out actor never appears in a list Canberk is about to send to.

## Why the preview stays

Canberk asked for one tap. The tap should produce a finished draft, not skip
him. At one to three people per title, a real note beats a template, and the
send rule in CLAUDE.md is draft, approve, send.

## The email

No trial pitch. No CURTAIN. The CTA rules put CURTAIN on first-touch only, and
someone who asked for a title and is being answered is mid-conversation.
Attaching a sale would also make the pretext look manufactured, which is exactly
the failure mode this design exists to avoid.

Subject: `The Humans is up`

```
Hey [Name],

You asked about The Humans a while back. It's up now, three pieces from it.

[link to the piece]

Save it and you can practice it right away.

Thanks for flagging it was missing. That's genuinely how I pick what to add
next, so it helps.

Canberk

reply UNSUBSCRIBE and I'll take you off the list, no hard feelings
```

Voice per CLAUDE.md: first person singular, no dashes of any kind, signed
Canberk, no emoji, peer to peer.

The opt-out line is arguably belt and braces on something this close to
transactional, but the rule covers every email to existing users and the reason
behind it (the /unsubscribe page's "Other" reason has no free-text field) holds
here too.

## Testing

- Link table: writes on track, unique on the pair, survives a repeat press.
- Backfill: matches the 13 recoverable requests, skips `drgff`.
- Button visibility: hidden while the title does not resolve, shown when it
  does, hidden again once everyone is notified.
- Do-not-contact: an opted-out requester is absent from the draft list.
- Notified-once: a second tap offers nobody who was already told.
- Voice: no en dash, em dash, "we", "our" or "us" in the rendered body.
