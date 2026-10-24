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


def test_lifecycle_and_triggered_skip_district_students():
    # triggered.py goes through lifecycle._mailable too.
    assert not lifecycle._mailable(_user("a@gilroyunified.org", "student"), set(), set())
    assert lifecycle._mailable(_user("a@gmail.com", "student"), set(), set())
    assert lifecycle._mailable(_user("t@gilroyunified.org", "educator"), set(), set())
