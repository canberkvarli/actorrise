"""The outcome links in the morning-after email: GET shows a page, POST records."""

import unittest

from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.api.auditions import router
from app.core.database import get_db
from app.models.actor import UserScript
from app.models.audition import Audition, AuditionEvent, AuditionPiece, AuditionReminderSend
from app.models.organization import Organization
from app.models.user import User
from tests.dbfixture import memory_db, restore

TABLES = [Organization, User, UserScript, Audition, AuditionPiece, AuditionEvent, AuditionReminderSend]


class OutcomeLinkTests(unittest.TestCase):
    def setUp(self):
        _, self.saved = memory_db(TABLES)  # strips the Postgres column types
        # TestClient serves from another thread, so the in-memory DB must be shareable.
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        for model in TABLES:
            model.__table__.create(engine)
        self.db = sessionmaker(bind=engine)()
        u = User(email="a@x.com", supabase_id="a")
        self.db.add(u)
        self.db.commit()
        self.a = Audition(user_id=u.id, project="Glass Menagerie", tz="UTC", status="booked")
        self.db.add(self.a)
        self.db.commit()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app, follow_redirects=False)
        self.url = f"/api/auditions/outcome/{self.a.outcome_token}"

    def tearDown(self):
        restore(self.saved)

    def test_get_records_nothing(self):
        r = self.client.get(self.url, params={"o": "callback"})
        self.assertEqual(r.status_code, 200)
        self.assertIn('method="post"', r.text)
        self.db.refresh(self.a)
        self.assertEqual(self.a.status, "booked")
        self.assertEqual(self.db.query(AuditionEvent).count(), 0)

    def test_post_logs_and_redirects(self):
        r = self.client.post(self.url, params={"o": "callback"})
        self.assertEqual(r.status_code, 303)
        self.assertIn(f"/auditions/{self.a.id}?logged=callback", r.headers["location"])
        self.db.refresh(self.a)
        self.assertEqual(self.a.status, "callback")

    def test_post_takes_o_from_form(self):
        r = self.client.post(self.url, data={"o": "no"})
        self.assertEqual(r.status_code, 303)
        self.db.refresh(self.a)
        self.assertEqual(self.a.status, "passed")

    def test_bad_token_is_404_on_both(self):
        bad = "/api/auditions/outcome/nope"
        self.assertEqual(self.client.get(bad, params={"o": "good"}).status_code, 404)
        self.assertEqual(self.client.post(bad, params={"o": "good"}).status_code, 404)
