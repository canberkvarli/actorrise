# Organizations in the admin — design

**Date:** 2026-09-05
**Status:** designed, not built
**Scope chosen:** read-only grouping and metrics. No roles, no teacher portal.

## Why

Canberk cannot answer "is Northern Michigan University actually using this?"
The teacher route is the channel that converts (Stephanie DeYoung replied in five
hours and offered to collect her class list), but there is no way to see whether a
cluster that signed up ever did anything afterwards.

## What the data actually looks like

Measured 2026-09-05, and it is the reason this design is small.

Institutional clusters by email domain: `nmu.edu` 7, `lsr7.net` 2,
`heidimarshall.com` 2, `parkwayschools.net` 2. **Four groups, about 13 people.**
Everything else is gmail, icloud or Apple private relay.

Account types: 804 unset, 17 educator, 8 actor, 6 student.

`users.organization` already exists and 22 people have filled it in, but it is a
free-text profile field the user types about themselves (`auth.py:316`, rendered on
their profile call sheet). The same institution appears as
`Northern Michigan University` and `nmu.edu`, `Parkway Schools` and
`parkwayschools.net`, plus `florida atlantic university` in lowercase. No two rows
group reliably. That is precisely why org activity is invisible today.

`users.referral_source` is populated for 290 users, so origin is already answerable.

## Decisions

**Read-only metrics first.** A teacher-facing portal means org entities, roles,
invitations, seat limits and abuse controls. That is a multi-tenant permissions
system for thirteen people, while the manual path (teacher emails a list, Canberk
runs the comp preset) works and converts. Revisit when the volume argues for it.

**Membership is assigned by hand, suggested by machine.** Pure domain derivation
would miss most students: Robert's actual students will sign up on gmail, and Heidi
Marshall's clients will not be on `heidimarshall.com`. Canberk knows who belongs;
the email does not.

**The user's typed string is never overwritten.** It is their self-description on
their own profile. It becomes a *signal* for attachment, nothing more.

## Schema

```sql
create table organizations (
  id          serial primary key,
  name        text not null,          -- canonical, ours: "Northern Michigan University"
  kind        text not null,          -- school | studio | chapter | company
  notes       text,                   -- "Robert Pieranunzi, found via search Aug 25"
  created_at  timestamptz default now()
);

alter table users add column organization_id int references organizations(id);
create index ix_users_organization_id on users(organization_id);
```

One table, one column, one index. `users.organization` is left untouched.

## Metrics

Every figure excludes `exclude_from_stats` users. See
`admin-dashboards-exclude-staff`: `/admin/sessions` counted 27% test data and
reported 21.9% completion when the real number was 27.7%.

| Column | Source |
|---|---|
| Members | `count(users where organization_id = X)`, split by `account_type` |
| Activated | any `usage_metrics` row with `total_searches_count > 0` or `monologue_sessions > 0` or `scene_partner_sessions > 0` |
| Active 30d | any `usage_metrics.date` inside 30 days with activity |
| Comps | `user_subscriptions` where `stripe_subscription_id is null` and status active; show count and **nearest `current_period_end`** |
| Origin | `min(users.created_at)` and most common `referral_source` / `referral_detail` |

Comp detection follows `admin-mrr-paid-vs-comped`: a comp is a subscription with a
NULL `stripe_subscription_id`.

## The page

`/admin/organizations`, listed under People beside Users.

**List view**, sorted by nearest comp expiry by default, so it opens as a worklist:
*these classes lapse this month, write to their teacher.* That is the single action
this data enables and the one thing currently missed.

**Detail view**: member table (name, account type, joined, last active, comp expiry)
plus two attach controls fed by the suggestion sources:

- "7 unattached users on `nmu.edu`, attach?"
- "3 users typed something close to this org name, attach?"

Nothing attaches automatically. Every attachment is a confirmed click, which is what
lets a gmail student be attached to Robert's class at all.

## Explicitly out of scope

- Roles, permissions, a teacher-facing section, student self-service
- Seat limits, invitations, org-level billing
- Editing `users.organization`. It is theirs.

## Open, not blocking

**SMTP bounces are invisible.** Batch 21 produced three hard bounces
(`rundastudents.brookhouse.ac.ke`, `onldm.net`, `bishopchatard.org`) that were found
only in Gmail. The SMTP client returns no provider id, so nothing writes them back
and `Bounced` reads 0 forever. They were suppressed by hand on 2026-09-05, taking
`email_do_not_contact` to 92. A parser for Workspace bounce-backs, or a switch to
Resend for bulk, is the real fix. Related: `email-sending-resend-vs-smtp`.
