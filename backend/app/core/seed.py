"""
Canonical pricing tier definitions + idempotent startup seeding.

This module is the SINGLE SOURCE OF TRUTH for tier feature limits. Both the
startup seeder (``ensure_pricing_tiers``) and the manual upsert script
(``scripts/seed_pricing_tiers.py``) build their tiers from ``canonical_tiers()``
so the two can never drift apart again.

History: ScenePartner caps drifted in prod because two seed files defined
different Plus limits (10 vs 30). Plus is 30 sessions/month. Keep it here only.
"""

from app.core.database import SessionLocal
from app.models.billing import PricingTier


def canonical_tiers() -> list[PricingTier]:
    """Return the canonical Free / Solo / Plus / Pro tier set.

    The ``features`` dicts here are authoritative. ``-1`` means unlimited,
    ``0`` means not available. Update limits HERE, then run
    ``python backend/scripts/seed_pricing_tiers.py`` to push to the DB.
    """
    return [
        # FREE
        PricingTier(
            name="free",
            display_name="Free",
            description="Explore and try it out",
            monthly_price_cents=0,
            annual_price_cents=0,
            stripe_monthly_price_id=None,
            stripe_annual_price_id=None,
            features={
                "ai_searches_per_month": 10,
                "bookmarks_limit": 10,
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                # 1 script, lifetime (rate_limiting counts total_scripts_uploaded for
                # free, so deleting and re-uploading does not reset it). Was 0, which
                # meant a free actor could only ever rehearse the two demo scenes and
                # never their own sides — the one thing the product is actually for.
                # Sessions stay the meter: upload is the taste, volume is the ask.
                "scene_partner_scripts": 1,
                # 3, not 2. The average run delivers 3.1 lines and only 35% of
                # sessions complete, so two attempts often did not buy one finished
                # scene: a mic hiccup or a restart ate half the allowance before
                # anything landed. The trial offer fires on COMPLETION as well as at
                # the cap, so a third run feeds the ask rather than weakening it.
                "scene_partner_sessions": 3,
                "monologue_sessions": 3,  # kept level with scene sessions; paid tiers stay -1.
                "scene_partner_trial_only": True,
            },
            is_active=True,
            sort_order=0,
        ),
        # MONOLOGUES — Ghost Light iOS ($4.99/mo, $29.99/yr). Sold through the
        # App Store via RevenueCat, NOT Stripe, so it carries no Stripe price ids
        # and is granted/revoked by the RevenueCat webhook. It buys the one thing
        # the iOS app gates: unlimited full monologue reads (free is 3, lifetime)
        # plus unlimited saves. It deliberately does NOT include ScenePartner —
        # that is Plus/v2. Sits between Free and Plus (spec §4 #4).
        PricingTier(
            name="monologues",
            display_name="Monologues",
            description="Every monologue, unlimited",
            monthly_price_cents=499,
            annual_price_cents=2999,
            stripe_monthly_price_id=None,
            stripe_annual_price_id=None,
            features={
                "monologue_reads_lifetime": -1,  # unlimited — the whole point
                "ai_searches_per_month": -1,  # search is free for everyone anyway
                "bookmarks_limit": -1,  # unlimited saves (a paid feature on iOS)
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": 0,  # not included — Plus/v2
                "scene_partner_sessions": 0,
                "monologue_sessions": -1,
            },
            is_active=True,
            sort_order=1,
        ),
        # SOLO — $7/mo — RETIRED 2026-09-04, is_active=False on purpose.
        #
        # Sat on the pricing page with working Stripe prices from 2026-03-15 and
        # sold nothing in six months. Its own feature row explains why: the
        # ScenePartner allowance was 1 script and 3 sessions, identical to Free,
        # so $7 bought nothing for the part of the product people arrive for.
        #
        # Kept here rather than deleted so a reseed cannot resurrect it and so
        # the Stripe price ids stay findable. Nobody was ever subscribed, so
        # retiring it changed no one's plan.
        PricingTier(
            name="solo",
            display_name="Solo",
            description="For actors getting started",
            monthly_price_cents=700,
            annual_price_cents=5900,
            stripe_monthly_price_id="price_1TB9sHRg9rz1StUqgZ4y46hb",
            stripe_annual_price_id="price_1TB9uJRg9rz1StUqRQMbqKz2",
            features={
                "ai_searches_per_month": 25,
                "bookmarks_limit": 15,
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": 1,
                "scene_partner_sessions": 3,
                "monologue_sessions": -1,  # launch: unlimited for all tiers (2026-07-15), revisit once /work usage is understood
            },
            is_active=False,
            sort_order=1,
        ),
        # PLUS — $12/mo
        PricingTier(
            name="plus",
            display_name="Plus",
            description="For working actors and students",
            monthly_price_cents=1200,
            annual_price_cents=9900,
            stripe_monthly_price_id="price_1SyWoMRg9rz1StUqUqj3ltC1",
            stripe_annual_price_id="price_1SyWpsRg9rz1StUqRVhstl9N",
            features={
                "ai_searches_per_month": -1,  # unlimited
                "bookmarks_limit": -1,  # unlimited
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": 5,
                # Unlimited as of 2026-09-04. This was 30 here and 10 in the
                # client's fallback table: two different numbers for one limit,
                # which is how you know neither came from measurement. The
                # heaviest Plus account across the whole base has run 11
                # sessions, so the cap could only ever stop the person
                # rehearsing hardest.
                "scene_partner_sessions": -1,
                "monologue_sessions": -1,  # launch: unlimited for all tiers (2026-07-15), revisit once /work usage is understood
            },
            is_active=True,
            sort_order=2,
        ),
        # PRO — $24/mo
        PricingTier(
            name="pro",
            display_name="Pro",
            description="For professionals and coaches",
            monthly_price_cents=2400,
            annual_price_cents=19900,
            stripe_monthly_price_id="price_1TBA1XRg9rz1StUqlOP5Ox4O",
            stripe_annual_price_id="price_1TBA1zRg9rz1StUqI8dDx47x",
            features={
                "ai_searches_per_month": -1,  # unlimited
                "bookmarks_limit": -1,  # unlimited
                "recommendations": True,
                "download_formats": ["pdf", "docx"],
                "priority_support": False,
                "scene_partner_scripts": -1,  # unlimited
                "scene_partner_sessions": -1,  # unlimited scenes
                "monologue_sessions": -1,  # launch: unlimited for all tiers (2026-07-15), revisit once /work usage is understood
            },
            is_active=True,
            sort_order=3,
        ),
    ]


def ensure_pricing_tiers() -> None:
    """If the pricing_tiers table is empty, insert the canonical tiers.

    Idempotent: does nothing once tiers exist (it will not overwrite live
    rows). To push canonical changes to an already-seeded DB, run
    ``scripts/seed_pricing_tiers.py`` which upserts.
    """
    db = SessionLocal()
    try:
        if db.query(PricingTier).first() is not None:
            return
        for tier in canonical_tiers():
            db.add(tier)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
