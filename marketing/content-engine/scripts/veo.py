#!/usr/bin/env python3
"""Generate a short video clip with Google Veo through the Gemini API.

    python3 scripts/veo.py "<prompt>" out.mp4 [--model veo-3.1-generate-preview] [--aspect 9:16] [--res 1080p]

Needs GEMINI_API_KEY (from the actorrise environment, never committed) and the domain
generativelanguage.googleapis.com on the account's allowlist. Veo makes about 8 seconds with sound
(voice, lip sync, room tone) in one go. Canberk, 2026-11-06: allowed for the Tape room film (an
actor saying action, a few lines, then cut). Posts made with it are labelled as AI on every platform.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

API = "https://generativelanguage.googleapis.com/v1beta"


def call(url, key, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Veo error {e.code}: {e.read().decode()[:600]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt"); ap.add_argument("out")
    ap.add_argument("--model", default=os.environ.get("VEO_MODEL", "veo-3.1-generate-preview"))
    ap.add_argument("--aspect", default="9:16"); ap.add_argument("--res", default="1080p")
    ap.add_argument("--negative", default="subtitles, captions, text on screen, watermark, logo, cartoon, distorted hands, extra fingers")
    a = ap.parse_args()
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("GEMINI_API_KEY is not set")
    params = {"aspectRatio": a.aspect, "resolution": a.res, "negativePrompt": a.negative, "personGeneration": "allow_all"}
    op = None
    # Some model versions refuse a parameter (1080p in portrait, personGeneration): drop it and retry.
    for drop in ([], ["personGeneration"], ["personGeneration", "resolution"]):
        p = {k: v for k, v in params.items() if k not in drop}
        req = urllib.request.Request(f"{API}/models/{a.model}:predictLongRunning",
                                     data=json.dumps({"instances": [{"prompt": a.prompt}], "parameters": p}).encode(),
                                     headers={"x-goog-api-key": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                op = json.load(r); print(f"started with {p}", file=sys.stderr); break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            print(f"refused with {p}: {e.code} {msg}", file=sys.stderr)
            if e.code not in (400,):
                sys.exit(1)
    if not op:
        sys.exit("Veo refused every parameter set")
    name = op["name"]
    for _ in range(90):  # up to ~15 minutes
        time.sleep(10)
        op = call(f"{API}/{name}", key)
        if op.get("done"):
            break
    if not op.get("done"):
        sys.exit(f"still running after 15 minutes: {name}")
    if "error" in op:
        sys.exit(f"Veo failed: {op['error']}")
    samples = op["response"]["generateVideoResponse"].get("generatedSamples") or []
    if not samples:
        sys.exit(f"no video returned (often a safety filter): {json.dumps(op['response'])[:600]}")
    uri = samples[0]["video"]["uri"]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    req = urllib.request.Request(uri, headers={"x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=300) as r, open(a.out, "wb") as fh:
        fh.write(r.read())
    print(json.dumps({"saved": a.out, "model": a.model}))


if __name__ == "__main__":
    main()
