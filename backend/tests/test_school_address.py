"""Students on a district mail system get no automated email (school_address.py)."""

from types import SimpleNamespace

import pytest

from app.services.email import lifecycle
from app.services.email.school_address import is_district_address, is_school_student


@pytest.mark.parametrize(
    "email",
    [
        "a@gilroyunified.org",
        "a@powayusd.com",
        "a@sbcusd.k12.ca.us",
        "a@parkwayschools.net",
        "a@student.hunterschools.org",
        "a@katyisd.org",
        "a@my.puhsd.org",
        "a@brit.croydon.sch.uk",
        "a@student.esmonline.org",
    ],
)
def test_district_addresses(email):
    assert is_district_address(email)


@pytest.mark.parametrize(
    "email",
    ["a@gmail.com", "a@icloud.com", "a@nmu.edu", "a@k12.edu", "a@unitedconservatory.org", "a@privaterelay.appleid.com", "a@outlook.com", "", None, "nope"],
)
def test_not_district_addresses(email):
    assert not is_district_address(email)


def _user(email, account_type):
    return SimpleNamespace(
        id=1, email=email, account_type=account_type, marketing_opt_in=True, exclude_from_stats=False
    )


def test_only_students_are_skipped():
    assert is_school_student(_user("a@gilroyunified.org", "student"))
    assert not is_school_student(_user("teacher@gilroyunified.org", "educator"))
    assert not is_school_student(_user("a@gmail.com", "student"))


def test_a_student_subdomain_is_a_student_whatever_the_account_says():
    assert is_school_student(_user("568713@stu.sandi.net", "actor"))
    assert is_school_student(_user("568713@stu.sandi.net", None))
    assert is_school_student(_user("a@student.hunterschools.org", "actor"))
    assert not is_school_student(_user("teacher@sandi.net", "educator"))
    assert not is_school_student(_user("a@stuart.com", None))


def test_lifecycle_and_triggered_skip_district_students():
    # triggered.py goes through lifecycle._mailable too.
    assert not lifecycle._mailable(_user("a@gilroyunified.org", "student"), set(), set())
    assert lifecycle._mailable(_user("a@gmail.com", "student"), set(), set())
    assert lifecycle._mailable(_user("t@gilroyunified.org", "educator"), set(), set())


def test_bulk_email_skips_student_inboxes_whatever_the_account_says():
    from datetime import datetime, timezone

    from app.models.billing import PricingTier, UserSubscription
    from app.models.email_do_not_contact import EmailDoNotContact
    from app.models.organization import Organization
    from app.models.user import User
    from app.services.email.marketing import _get_marketing_recipients
    from tests.dbfixture import memory_db, restore

    db, saved = memory_db([Organization, User, EmailDoNotContact, PricingTier, UserSubscription])
    try:
        now = datetime.now(timezone.utc)
        for i, (email, kind) in enumerate(
            [
                ("actor@gmail.com", None),
                ("568713@stu.sandi.net", "actor"),
                ("555111@stu.sandi.net", None),
                ("a@student.hunterschools.org", "actor"),
                ("teacher@sandi.net", "educator"),
                ("kid@gilroyunified.org", "student"),
            ],
            start=1,
        ):
            db.add(User(id=i, email=email, supabase_id=email, account_type=kind, marketing_opt_in=True, created_at=now))
        db.commit()
        got = {u.email for u in _get_marketing_recipients(db, "all")}
        assert got == {"actor@gmail.com", "teacher@sandi.net"}
    finally:
        db.close()
        restore(saved)
