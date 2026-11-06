#!/usr/bin/env python3
"""Generate a short clip (with sound, lip-synced speech) with Gemini Omni through the Interactions API.

    python3 scripts/omni.py "<prompt>" out.mp4 [--model gemini-omni-1.2-flash] [--aspect 9:16] [--res 1080p]

Needs GEMINI_API_KEY and generativelanguage.googleapis.com on the allowlist. Canberk approved AI actors
on 2026-11-06 for feature demos: ordinary looking, natural, never a model. Every post that uses one is
labelled as AI on each platform AND says so in the caption ("The actor is AI generated.").
Prompt tips that worked: say "portrait video with sound, N seconds, one continuous take", describe a
regular person (not a model), give timed beats "[0-1s] He says: ...", end with "no music, no subtitles,
no text on screen". The opening word can come out in a different voice: check, and patch it from a
later line of the same speaker if needed.
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error

API = "https://generativelanguage.googleapis.com/v1beta"


def req(url, key, body=None, timeout=600):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                               headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as f:
            return f.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"Gemini error {e.code}: {e.read().decode()[:600]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt"); ap.add_argument("out")
    ap.add_argument("--model", default=os.environ.get("OMNI_MODEL", "gemini-omni-1.2-flash"))
    ap.add_argument("--aspect", default="9:16"); ap.add_argument("--res", default="1080p")
    a = ap.parse_args()
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("GEMINI_API_KEY is not set")
    body = {"model": a.model, "input": a.prompt,
            "response_format": {"type": "video", "aspect_ratio": a.aspect, "resolution": a.res, "delivery": "uri"}}
    d = json.loads(req(f"{API}/interactions", key, body))
    uris = [c["uri"] for s in d.get("steps", []) if s.get("type") == "model_output" for c in s.get("content", []) if c.get("uri")]
    if not uris:
        sys.exit(f"no video in the response: {json.dumps(d)[:600]}")
    uri = uris[0]
    fid = re.search(r"/files/([^:/?]+)", uri).group(1)
    for _ in range(60):
        st = json.loads(req(f"{API}/files/{fid}", key)).get("state")
        if st == "ACTIVE":
            break
        if st == "FAILED":
            sys.exit("generation failed")
        time.sleep(10)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    open(a.out, "wb").write(req(uri, key, timeout=300))
    print(json.dumps({"saved": a.out, "model": a.model}))


if __name__ == "__main__":
    main()
