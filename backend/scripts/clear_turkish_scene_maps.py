"""Clear the kept scene maps of Turkish scripts, so the next open reads them again.

A script's scene map (user_scripts.scene_map) is kept so an open does not read
the whole text again (api/scripts.py kept_scan). The key it is kept under is
the parser's version and a hash of the text, so a parser fix that does not bump
PARSER_VERSION leaves old maps standing. The Turkish fix (2026-11-03: Turkish
capitals as cues, PERDE and SAHNE as acts and scenes) is one: a Turkish script
mapped before it kept a map with no speakers and no structure.

Bumping PARSER_VERSION would re-read every script anyone opens, English
included, and an under-split one goes to the model each time. This clears only
the Turkish ones, told by the same rule the app uses everywhere
(services/rehearsal/language.script_language on the script's own text).

Clearing is all it does: the map is read again, from the stored text, the next
time the script's map is opened. Scenes already built are not touched.

Runs through Supabase REST (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), which a
cloud session can reach. A dry run by default; nothing is written without
--apply. Script text never leaves this process and is never printed.

    uv run python scripts/clear_turkish_scene_maps.py           # which ones
    uv run python scripts/clear_turkish_scene_maps.py --apply   # clear them
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
from pathlib import Path
from types import SimpleNamespace

import httpx
from dotenv import load_dotenv

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
# The laptop keeps the keys in backend/.env; a cloud session has them in its
# environment already, and load_dotenv never overrides those.
load_dotenv(backend_dir / ".env")

from app.services.rehearsal.language import script_language  # noqa: E402

PAGE = 50


def _rest():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (backend/.env or the environment).")
    base = url.rstrip("/") + "/rest/v1/"
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def call(method: str, path: str, body=None, prefer: str | None = None):
        h = dict(headers)
        if prefer:
            h["Prefer"] = prefer
        # httpx, not urllib: it carries its own certificate bundle (certifi).
        # A python.org Python on macOS ships with no trusted roots until its
        # "Install Certificates" step is run, and urllib then fails every
        # HTTPS call with CERTIFICATE_VERIFY_FAILED.
        data = json.dumps(body).encode() if body is not None else None
        r = httpx.request(method, base + path, content=data, headers=h, timeout=120)
        r.raise_for_status()
        return r.json() if r.content else None

    return call


def kept_maps(call) -> list[int]:
    """Ids of every script with a kept map, oldest first."""
    ids: list[int] = []
    offset = 0
    while True:
        rows = call("GET", f"user_scripts?select=id&scene_map=not.is.null&order=id&limit=500&offset={offset}")
        ids += [r["id"] for r in rows]
        if len(rows) < 500:
            return ids
        offset += 500


def turkish(call, ids: list[int]) -> list[dict]:
    """The Turkish ones among `ids`, with how many scenes their kept map holds."""
    out = []
    for i in range(0, len(ids), PAGE):
        batch = ",".join(str(x) for x in ids[i:i + PAGE])
        rows = call("GET", f"user_scripts?select=id,processing_status,raw_text,source_text,scene_map"
                           f"&id=in.({urllib.parse.quote(batch)})")
        for r in rows:
            script = SimpleNamespace(raw_text=r.get("raw_text"), source_text=r.get("source_text"))
            if script_language(None, script) != "tr":
                continue
            kept = r.get("scene_map") or {}
            scenes = ((kept.get("scan") or {}).get("scenes") or []) if isinstance(kept, dict) else []
            out.append({"id": r["id"], "status": r.get("processing_status"), "map_scenes": len(scenes),
                        "map_speakers": sum(1 for s in scenes if (s.get("characters") or []))})
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="clear them (default: only list)")
    args = ap.parse_args()

    call = _rest()
    ids = kept_maps(call)
    found = turkish(call, ids)
    print(f"{len(ids)} scripts have a kept scene map; {len(found)} are Turkish.")
    for f in found:
        print(f"  script {f['id']:>6}  {f['status'] or '-':<10}  kept map: {f['map_scenes']} scenes,"
              f" {f['map_speakers']} with speakers")
    if not found:
        return
    if not args.apply:
        print("Dry run: nothing changed. --apply clears these.")
        return

    target = ",".join(str(f["id"]) for f in found)
    call("PATCH", f"user_scripts?id=in.({urllib.parse.quote(target)})", {"scene_map": None}, prefer="return=minimal")
    left = call("GET", f"user_scripts?select=id&scene_map=not.is.null&id=in.({urllib.parse.quote(target)})")
    print(f"Cleared {len(found) - len(left)} of {len(found)}." + (f" Still kept: {[r['id'] for r in left]}" if left else ""))


if __name__ == "__main__":
    main()
