"""The daily loop's way into the database from a Claude Code cloud session.

A cloud session reaches the web and nothing else: its proxy drops a raw Postgres
connection on any port (checked 2026-11-02, 5432 and 6543 both time out). The
API already talks to the database, so the session asks the API to run the
loop's own scripts and hands back what they printed.

Only the scripts and subcommands below, as a separate process (its own
connections, never the request pool; see second-connection-inside-a-request),
one at a time. Without LOOP_TOKEN set on the server the route does not exist.
The client is scripts/remote.py.
"""
from __future__ import annotations

import hmac
import os
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/loop", tags=["loop"])

BACKEND = Path(__file__).resolve().parents[2]
TIMEOUT_S = 300
MAX_OUT = 1_000_000

# script -> subcommands allowed as the first argument (None: any arguments).
ALLOWED: dict[str, set[str] | None] = {
    "conversion_brief": set(),           # no arguments: the brief comes back on stdout
    "contact_log": {"check", "add"},
    "opt_out": None,
    "class_link": {"make", "invite", "list", "off", "on"},
    "grant_comp": None,
    "cue_report": None,
}

_busy = threading.Lock()


class Job(BaseModel):
    script: str
    args: list[str] = Field(default_factory=list, max_length=40)


def _token() -> str:
    return os.environ.get("LOOP_TOKEN", "")


def check_token(authorization: str | None) -> None:
    expected = _token()
    if len(expected) < 32:
        raise HTTPException(status_code=404)
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401)


def validate(job: Job) -> list[str]:
    if job.script not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"not a loop script: {job.script}")
    subs = ALLOWED[job.script]
    if subs is not None:
        if not subs and job.args:
            raise HTTPException(status_code=400, detail=f"{job.script} takes no arguments here")
        if subs and (not job.args or job.args[0] not in subs):
            raise HTTPException(status_code=400, detail=f"{job.script}: first argument must be one of {sorted(subs)}")
    if any(len(a) > 2000 or "\x00" in a for a in job.args):
        raise HTTPException(status_code=400, detail="argument too long")
    return [sys.executable, str(BACKEND / "scripts" / f"{job.script}.py"), *job.args]


@router.post("/run")
def run(job: Job, authorization: str | None = Header(default=None)) -> dict:
    check_token(authorization)
    cmd = validate(job)
    if not _busy.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="another loop script is running, try again shortly")
    try:
        # A list, never a shell: arguments are data.
        # The scripts find `app` from the repo layout (<repo>/backend); the image is
        # the backend folder alone, at /app, so hand them the path.
        env = {**os.environ, "PYTHONPATH": str(BACKEND)}
        p = subprocess.run(cmd, cwd=BACKEND, env=env, capture_output=True, text=True, timeout=TIMEOUT_S)
        return {"returncode": p.returncode, "stdout": p.stdout[-MAX_OUT:], "stderr": p.stderr[-MAX_OUT:]}
    except subprocess.TimeoutExpired:
        return {"returncode": 124, "stdout": "", "stderr": f"timed out after {TIMEOUT_S}s"}
    finally:
        _busy.release()
