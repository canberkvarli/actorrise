"""Run a loop script on the API instead of here, for a cloud session.

A Claude Code cloud session cannot open a database connection (its proxy only
passes web traffic), so the loop's database scripts run on the API through
app/api/loop_bridge.py and print here as if they ran locally:

  uv run python scripts/remote.py conversion_brief --save
  uv run python scripts/remote.py contact_log check someone@example.com --org "Some School"
  uv run python scripts/remote.py opt_out someone@example.com "OPT-OUT: ..."

Needs LOOP_TOKEN (the same value as on Render) and optionally LOOP_URL
(default https://api.actorrise.com). `--save` on the brief is handled here: the
brief comes back and is written to outputs/conversion/<today>.md like the
local run does.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def call(script: str, args: list[str]) -> dict:
    url = os.environ.get("LOOP_URL", "https://api.actorrise.com").rstrip("/") + "/api/loop/run"
    token = os.environ.get("LOOP_TOKEN", "")
    if not token:
        raise SystemExit("LOOP_TOKEN is not set in this environment")
    body = json.dumps({"script": script, "args": args}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=330) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"bridge said {e.code}: {e.read().decode(errors='replace')[:500]}")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    script, args = sys.argv[1].removesuffix(".py").removeprefix("scripts/"), sys.argv[2:]
    save = script == "conversion_brief" and "--save" in args
    if save:
        args = [a for a in args if a != "--save"]
    res = call(script, args)
    if res.get("stderr"):
        print(res["stderr"], file=sys.stderr, end="")
    out = res.get("stdout", "")
    if save and res.get("returncode") == 0:
        path = ROOT / "outputs" / "conversion" / f"{date.today():%Y-%m-%d}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(out, encoding="utf-8")
        print(f"saved {path}")
        for line in re.findall(r"^\| (?:saw a price|started checkout|started a trial|paid) \|.*$", out, re.M):
            print(line)
    else:
        print(out, end="")
    sys.exit(res.get("returncode", 1))


if __name__ == "__main__":
    main()
