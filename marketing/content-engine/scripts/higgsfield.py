#!/usr/bin/env python3
"""Generate a clip with the Higgsfield API (https://docs.higgsfield.ai).

    python3 scripts/higgsfield.py "<prompt>" out.mp4 [--model bytedance/seedance-2.0/text-to-video]
                                  [--aspect 9:16] [--res 1080p] [--seconds 5] [--image <url>]

Needs HIGGSFIELD_KEY = "<key id>:<key secret>" in the environment (the cloud environment's secrets, never a
file in the repo) and api.higgsfield.ai on the environment's network allowlist. Every request is paid from
Canberk's Higgsfield balance: make each clip count, never loop retries blindly.
Flow: POST the model endpoint -> request_id + status_url -> poll until completed | failed | nsfw | canceled
-> download the first video URL in the result.
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

API = "https://api.higgsfield.ai"
DONE = {"completed", "failed", "nsfw", "canceled", "cancelled"}


def call(url, key, body=None, timeout=120):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Key {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Higgsfield error {e.code}: {e.read().decode()[:600]}")


def find_video(o):
    """The first http(s) URL that looks like a video, wherever the result keeps it."""
    if isinstance(o, str):
        return o if o.startswith("http") and any(x in o.lower() for x in (".mp4", ".mov", "video")) else None
    if isinstance(o, dict):
        for k in ("video", "videos", "url", "output", "outputs", "result", "results", "media"):
            if k in o and (v := find_video(o[k])):
                return v
        o = list(o.values())
    if isinstance(o, list):
        for v in o:
            if (u := find_video(v)):
                return u
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt"); ap.add_argument("out")
    ap.add_argument("--model", default=os.environ.get("HIGGSFIELD_MODEL", "bytedance/seedance-2.0/text-to-video"))
    ap.add_argument("--aspect", default="9:16"); ap.add_argument("--res", default="1080p")
    ap.add_argument("--seconds", type=int, default=5); ap.add_argument("--image")
    a = ap.parse_args()
    key = os.environ.get("HIGGSFIELD_KEY") or sys.exit("HIGGSFIELD_KEY is not set (format: id:secret)")
    body = {"prompt": a.prompt, "aspect_ratio": a.aspect, "resolution": a.res, "duration": a.seconds}
    if a.image:
        body["image_url"] = a.image
    sub = call(f"{API}/{a.model.strip('/')}", key, body)
    rid = sub.get("request_id") or sub.get("id")
    status_url = sub.get("status_url") or (rid and f"{API}/requests/{rid}/status")
    if not status_url:
        sys.exit(f"no request id in the response: {json.dumps(sub)[:600]}")
    print(f"submitted {rid}", file=sys.stderr)
    st = sub
    for _ in range(120):  # up to ~20 minutes
        if str(st.get("status", "")).lower() in DONE:
            break
        time.sleep(10)
        st = call(status_url, key)
    status = str(st.get("status", "")).lower()
    if status != "completed":
        sys.exit(f"ended as {status or 'unknown'}: {json.dumps(st)[:600]}")
    url = find_video(st)
    if not url:
        sys.exit(f"completed but no video URL found: {json.dumps(st)[:800]}")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(a.out, "wb") as fh:
        fh.write(r.read())
    print(json.dumps({"saved": a.out, "model": a.model, "request_id": rid}))


if __name__ == "__main__":
    main()
