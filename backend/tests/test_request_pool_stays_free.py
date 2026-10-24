"""A request must not wait on a second connection from its own pool.

2026-10-22: a class of 26 signed up through one link in one period. Every new
signup sent its welcome email inline (a COUNT on a second connection, then a
call to Resend) and every request logged events on a second connection, all
while holding its first. The 15 ran out, students saw a black screen, and the
log said "QueuePool limit of size 5 overflow 10 reached".
"""

import ast
import threading
import unittest
from pathlib import Path
from unittest import mock

from app.core import database
from app.services.email import notifications

APP = Path(__file__).resolve().parents[1] / "app"


def _imported_session_factory(module_path: Path) -> str | None:
    tree = ast.parse(module_path.read_text())
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "app.core.database":
            for alias in node.names:
                if (alias.asname or alias.name) == "SessionLocal":
                    return alias.name
    return None


class EventWritesUseTheirOwnPool(unittest.TestCase):
    def test_side_pool_is_a_different_engine(self):
        self.assertIsNot(database.side_engine, database.engine)
        self.assertIs(database.SideSessionLocal.kw["bind"], database.side_engine)

    def test_user_events_and_feed_events_open_side_sessions(self):
        for rel in ("services/events.py", "services/community.py"):
            self.assertEqual(_imported_session_factory(APP / rel), "SideSessionLocal", rel)


class WelcomeEmailLeavesTheRequest(unittest.TestCase):
    def test_send_later_returns_before_the_send_finishes(self):
        release = threading.Event()
        started = threading.Event()

        def slow_send(**_kw):
            started.set()
            release.wait(5)

        with mock.patch.object(notifications, "send_welcome_email", slow_send):
            notifications.send_welcome_email_later("a@example.com", "A")
            self.assertTrue(started.wait(2))
            release.set()

    def test_a_failed_send_never_reaches_the_caller(self):
        def boom(**_kw):
            raise RuntimeError("resend down")

        with mock.patch.object(notifications, "send_welcome_email", boom):
            notifications.send_welcome_email_later("a@example.com")

    def test_the_library_count_is_read_once_an_hour(self):
        calls = []

        class FakeDb:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def execute(self, *_a):
                calls.append(1)
                return mock.Mock(scalar=lambda: 21000)

        notifications._count_cache.clear()
        with mock.patch("app.core.database.SessionLocal", FakeDb):
            self.assertEqual(notifications._searchable_monologue_count(), 21000)
            self.assertEqual(notifications._searchable_monologue_count(), 21000)
        notifications._count_cache.clear()
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
