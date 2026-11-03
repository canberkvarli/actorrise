"""The Studio notebook sync: newest write wins, deletes travel, owners only."""

import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.admin.users import require_sensitive_admin
from app.api.auth import get_current_user
from app.api.studio import MAX_ROLE_BYTES, router
from app.core.database import get_db
from app.models.organization import Organization
from app.models.studio import StudioRole
from app.models.user import User
from tests.dbfixture import memory_db, restore

TABLES = [Organization, User, StudioRole]


class StudioSyncTests(unittest.TestCase):
    def setUp(self):
        _, self.saved = memory_db(TABLES)  # strips the Postgres column types
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        for model in TABLES:
            model.__table__.create(engine)
        self.db = sessionmaker(bind=engine)()
        # The Studio is staff-only: both test users hold the sensitive-admin level.
        self.alice = User(email="a@x.com", supabase_id="a", is_moderator=True, can_approve_submissions=True)
        self.bob = User(email="b@x.com", supabase_id="b", is_moderator=True, can_approve_submissions=True)
        self.actor = User(email="c@x.com", supabase_id="c")
        self.db.add_all([self.alice, self.bob, self.actor])
        self.db.commit()
        self.me = self.alice
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.me
        self.client = TestClient(app)

    def tearDown(self):
        restore(self.saved)

    def put(self, rid, t, name="Hamlet"):
        return self.client.put(f"/api/studio/roles/{rid}", json={"updated_at": t, "data": {"name": name}})

    def test_save_and_list(self):
        r = self.put("r1", 100)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["applied"])
        roles = self.client.get("/api/studio/roles").json()
        self.assertEqual([(x["id"], x["data"]["name"]) for x in roles], [("r1", "Hamlet")])

    def test_newer_write_wins_and_older_is_refused(self):
        self.put("r1", 200, "Newer")
        r = self.put("r1", 100, "Older")
        self.assertFalse(r.json()["applied"])
        self.assertEqual(r.json()["role"]["data"]["name"], "Newer")
        self.assertEqual(self.client.get("/api/studio/roles").json()[0]["data"]["name"], "Newer")

    def test_delete_leaves_a_tombstone(self):
        self.put("r1", 100)
        r = self.client.delete("/api/studio/roles/r1", params={"updated_at": 150})
        self.assertTrue(r.json()["deleted"])
        roles = self.client.get("/api/studio/roles").json()
        self.assertEqual(roles[0]["deleted"], True)
        self.assertIsNone(roles[0]["data"])

    def test_an_older_delete_loses_to_a_newer_edit(self):
        self.put("r1", 300, "Edited later")
        r = self.client.delete("/api/studio/roles/r1", params={"updated_at": 200})
        self.assertFalse(r.json()["deleted"])
        self.assertEqual(r.json()["data"]["name"], "Edited later")

    def test_a_newer_edit_revives_a_deleted_role(self):
        self.put("r1", 100)
        self.client.delete("/api/studio/roles/r1", params={"updated_at": 150})
        self.assertTrue(self.put("r1", 160, "Back").json()["applied"])
        self.assertFalse(self.client.get("/api/studio/roles").json()[0]["deleted"])

    def test_roles_are_private_to_their_owner(self):
        self.put("shared-id", 100, "Alice's")
        self.me = self.bob
        self.assertEqual(self.client.get("/api/studio/roles").json(), [])
        # Bob writing the same id makes his own row; Alice's is untouched.
        self.put("shared-id", 999, "Bob's")
        self.me = self.alice
        self.assertEqual(self.client.get("/api/studio/roles").json()[0]["data"]["name"], "Alice's")

    def test_closed_to_everyone_but_staff(self):
        self.me = self.actor
        self.assertEqual(self.client.get("/api/studio/roles").status_code, 403)
        self.assertEqual(self.put("r1", 1).status_code, 403)
        self.assertEqual(self.client.delete("/api/studio/roles/r1", params={"updated_at": 1}).status_code, 403)

    def test_bad_id_and_oversize_are_refused(self):
        self.assertEqual(self.put("not ok!", 1).status_code, 422)
        big = {"updated_at": 1, "data": {"x": "a" * (MAX_ROLE_BYTES + 1)}}
        self.assertEqual(self.client.put("/api/studio/roles/r1", json=big).status_code, 413)


if __name__ == "__main__":
    unittest.main()
