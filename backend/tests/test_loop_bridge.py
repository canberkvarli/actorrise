"""The loop bridge: only the loop's scripts, only with the token."""
import subprocess

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import loop_bridge

TOKEN = "t" * 40


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("LOOP_TOKEN", TOKEN)
    app = FastAPI()
    app.include_router(loop_bridge.router)
    return TestClient(app)


@pytest.fixture
def ran(monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        assert kw["env"]["PYTHONPATH"] == str(loop_bridge.BACKEND)
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="ok\n", stderr="")

    monkeypatch.setattr(loop_bridge.subprocess, "run", fake_run)
    return calls


def post(client, body, token=TOKEN):
    return client.post("/api/loop/run", json=body, headers={"Authorization": f"Bearer {token}"})


def test_no_token_on_server_means_no_route(monkeypatch, ran):
    monkeypatch.delenv("LOOP_TOKEN", raising=False)
    app = FastAPI()
    app.include_router(loop_bridge.router)
    r = post(TestClient(app), {"script": "cue_report"})
    assert r.status_code == 404 and ran == []


def test_wrong_token_refused(client, ran):
    assert post(client, {"script": "cue_report"}, token="x" * 40).status_code == 401
    assert ran == []


def test_runs_an_allowed_script_as_a_list(client, ran):
    r = post(client, {"script": "contact_log", "args": ["check", "a@b.com", "--org", "X; rm -rf /"]})
    assert r.status_code == 200 and r.json()["stdout"] == "ok\n"
    cmd = ran[0]
    assert cmd[1].endswith("scripts/contact_log.py")
    assert cmd[2:] == ["check", "a@b.com", "--org", "X; rm -rf /"]


@pytest.mark.parametrize("body", [
    {"script": "ingest_film_monologues"},
    {"script": "../app/main"},
    {"script": "contact_log", "args": ["import"]},
    {"script": "contact_log"},
    {"script": "class_link", "args": ["plan", "x", "--apply"]},
    {"script": "conversion_brief", "args": ["--save"]},
])
def test_refuses_anything_else(client, ran, body):
    assert post(client, body).status_code == 400
    assert ran == []


def test_one_at_a_time(client, ran):
    loop_bridge._busy.acquire()
    try:
        assert post(client, {"script": "cue_report"}).status_code == 409
    finally:
        loop_bridge._busy.release()
    assert ran == []
