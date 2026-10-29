"""Students on a school district's mail system get no automated email.

District mail servers hold back or turn away outside mail to students. The
Gilroy class (2026-10-22, 19 of 24 on the district's domain) took Resend's bounce
rate to 8%, past the 4% where Resend starts warning, and a high enough rate
pauses sending for the whole domain, password resets included.

Only students: a teacher on the same district address still gets everything.
A college address (.edu) is left alone; those inboxes take outside mail.
"""

from __future__ import annotations

import re

# Matched against the part of the domain before its last label, so
# "gilroyunified.org", "powayusd.com", "sbcusd.k12.ca.us", "parkwayschools.net",
# "my.puhsd.org", "brit.croydon.sch.uk", "student.esmonline.org".
_DISTRICT = re.compile(r"k12|unified|[ui]sd\d*\b|hsd\d*\b|schools?\b|\bsd\d*\b|\bsch\b|^stu(dents?)?\.")


def is_district_address(email: str | None) -> bool:
    domain = (email or "").rsplit("@", 1)[-1].strip().lower()
    if "." not in domain or domain.endswith(".edu"):
        return False
    return bool(_DISTRICT.search(domain.rsplit(".", 1)[0]))


# A district's student mail lives on its own subdomain ("stu.sandi.net",
# "student.hunterschools.org"). Nobody but a student has one, so the address
# alone says so, whatever the account says: 17 San Diego students signed up on
# 2026-10-28 without a class link, half of them as actors, and the next bulk
# send went to them.
STUDENT_INBOX_PREFIXES = ("stu.", "student.", "students.")


def is_student_inbox(email: str | None) -> bool:
    domain = (email or "").rsplit("@", 1)[-1].strip().lower()
    return domain.startswith(STUDENT_INBOX_PREFIXES)


def is_school_student(user) -> bool:
    """A student on a district's mail system: a student account on a district
    address, or anyone on a student-only subdomain."""
    email = getattr(user, "email", None)
    if is_student_inbox(email):
        return True
    return getattr(user, "account_type", None) == "student" and is_district_address(email)
