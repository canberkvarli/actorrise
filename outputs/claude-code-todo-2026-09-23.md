# Weekly metrics follow-ups, 2026-09-23

Work through these in order. Supabase project ppvqmbzuqvzpiuqaiqfy. Stripe is READ ONLY, never write to it.

## 1. Search regression from the 9/16 deploy (highest priority)

These queries returned zero results in prod after the 9/16 deploy and the library obviously has answers for them:

- "Shakespeare" (9/17, empty_reason null)
- "sad monologues" (9/16, empty_reason null)
- "dramatic contemporary monologue for a woman in her 20's" (9/19, empty_reason no_candidates)
- "dramatic monologue angry young woman" and two typo variants (9/19, no_candidates)

Steps:
1. Run: `select id, query, empty_reason, match_strategy, query_type, filters_used, created_at from public.search_logs where results_count = 0 and created_at >= '2026-09-16' order by created_at;`
2. Replay each of the queries above through the search endpoint against prod data. Confirm whether the 9/21 (7b0ba6dc) and 9/23 (726b0970) commits actually fixed them or just hid the empty screen.
3. Find why `no_candidates` fired for a plain attribute query. Check the candidate floor / filter path introduced or changed on 9/16.
4. Add a regression test: these five query strings must return results_count > 0.

## 2. Stripe subscriptions missing from the app

Two active Stripe subscriptions do not exist in `user_subscriptions` at all:

- sub_1TfQiARg9rz1StUqvgaN6Rfc, customer cus_UekCdRM3BC6HxN, Plus $99/yr, discounted, created ~2026-06-06
- sub_1TcCXNRg9rz1StUqOpNMxINA, customer cus_UbPMf5YnTWizPg, Plus $99/yr, discounted, created ~2026-06-01

Steps:
1. Check the webhook handler log / stripe_events table (if any) for `customer.subscription.created` and `checkout.session.completed` around those dates.
2. Work out whether the drop was an email mismatch (checkout email not matching an ActorRise account) or a handler error.
3. Propose the backfill (which user, if any, each belongs to). Do not write to Stripe. Do not insert rows until I confirm.
4. Add an admin reconciliation query that lists Stripe subs with no app row, so the weekly metrics run can flag this automatically.

## 3. Failed-payment customer

User 2127 (t130919112@gmail.com), Stripe customer cus_VBNZltpaftjLlK: four card declines since 9/15 (insufficient_funds x3, do_not_honor x1), subscription past_due, never succeeded. `billing_history` recorded only one of the four failures.

Steps:
1. Check the webhook handles `invoice.payment_failed` on retries, not just the first attempt.
2. Draft (do not send) a short plain email to this user from me saying the card kept declining and giving them the update-payment link. First person, no dashes, sign off Canberk.

## 4. Attribution gap

181 of 593 signups in 30 days (31%) have no utm_source and no referral_source. From the week of 9/7 these users DO see the welcome screen and 66% have usage_metrics rows, so they are real people, not bots. Earlier unattributed cohorts (Aug 24, Aug 31) never saw the welcome.

Steps:
1. Run: `select id, email, created_at, utm_source, referral_source from public.users where created_at >= '2026-09-07' and coalesce(nullif(utm_source,''), referral_source) is null order by created_at desc limit 40;`
2. Compare their signup route (OAuth provider, landing page, mobile vs desktop, any new signup path from the 9/16 onboarding rework, commits 8efe9f9d and ab918c91) to attributed signups from the same days.
3. Fix whichever path drops the attribution. Backfill is not needed.

## 5. Cut the headshot field

`headshot_url` is filled on 3 of 298 profiles in the 30-day cohort. Remove it from profile onboarding (keep the column, just stop asking). Update the profile completion calculation if it counts headshot.

## 6. Search query_type misclassification

Stored `query_type` disagrees with the obvious reading on these recent searches:

- "The note book" stored `other`, is a title (The Notebook)
- "never can tell valentine" stored `other`, is a title + character (You Never Can Tell, Valentine)
- "Cars" stored `other`, is a film title
- "monologue from a published play writen in the last 18 years" stored `named_lookup`, is a multi-constraint attribute query

Improve title detection for lowercase / missing-article / fuzzy titles, and make sure a query that is mostly constraints does not get labeled `named_lookup`. Add these four as test cases.

## 7. Feedback widget

Last 30 days: 6 negative, 0 positive on 1399 searches. Five of the six comments contain the word "contemporary". 

Steps:
1. Confirm the positive rating control actually renders and posts (zero positives in 30 days is suspicious).
2. Run the six commented queries and check the era / year of the top 10 results for each. If classical pieces dominate a query that says "contemporary", tighten the era filter or boost.

## Do NOT do

- Do not send any email or post anything.
- Do not call any Stripe write operation.
- Do not delete or modify user_subscriptions rows without confirmation.
