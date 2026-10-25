"""Partner pipeline on organizations: nothing reaches the landing without a written yes."""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api import partners
from app.api.admin import organizations as orgs
from app.models.organization import Organization
from tests.dbfixture import memory_db, restore


@pytest.fixture
def db(monkeypatch):
    session, saved = memory_db([Organization])
    # The member counts need the users tables; this is about the partner fields.
    monkeypatch.setattr(orgs, "_metrics_for", lambda db, ids: {})
    yield session
    session.close()
    restore(saved)


def _org(db, name="Gilroy Unified", kind="school"):
    org = Organization(name=name, kind=kind, created_at=datetime.now(timezone.utc))
    db.add(org)
    db.commit()
    return org


def _put(db, org, **kw):
    return orgs.update_partner(org.id, orgs.PartnerIn(**kw), _user=None, db=db)


def test_new_org_shows_nothing(db):
    _org(db)
    assert partners.approved_partners(db) == []


def test_show_needs_a_written_yes(db):
    org = _org(db)
    with pytest.raises(HTTPException):
        _put(db, org, status="yes", show="name")
    with pytest.raises(HTTPException):
        _put(db, org, status="asked", show="name", approval="teacher said maybe")
    assert partners.approved_partners(db) == []


def test_yes_with_approval_shows_by_display_name(db):
    org = _org(db)
    out = _put(
        db, org, status="yes", show="name", display_name="Gilroy High School drama",
        approval="Teacher, by email 2026-10-27: 'yes, happy to'",
    )
    assert out["partner"]["on_landing"] is True
    assert partners.approved_partners(db) == [
        {"name": "Gilroy High School drama", "kind": "school", "url": None, "logo": None, "show": "name"}
    ]


def test_logo_needs_a_file_and_a_link_must_be_a_link(db):
    org = _org(db, "Heidi Marshall Studio", "studio")
    with pytest.raises(HTTPException):
        _put(db, org, status="yes", show="logo", approval="owner, 2026-10-27")
    with pytest.raises(HTTPException):
        _put(db, org, status="yes", show="name", approval="ok", url="heidimarshall.com")
    _put(db, org, status="yes", show="logo", approval="owner, 2026-10-27",
         logo_url="/partners/hms.png", url="https://example.com")
    assert partners.approved_partners(db)[0]["logo"] == "/partners/hms.png"


def test_ready_to_ask_after_ten_students():
    org = Organization(name="x", kind="school", partner_status="none")
    assert orgs._partner(org, {"by_type": {"student": 10}})["ready_to_ask"] is True
    assert orgs._partner(org, {"by_type": {"student": 9}})["ready_to_ask"] is False
    org.partner_status = "asked"
    assert orgs._partner(org, {"by_type": {"student": 30}})["ready_to_ask"] is False
