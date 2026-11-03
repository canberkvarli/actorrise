#!/usr/bin/env python3
"""Free stock footage from Pexels (free for commercial use, no attribution required, credit kept anyway).

    python3 scripts/pexels.py search "actor rehearsing script" [n]   -> lists portrait clips (id, seconds, author, preview)
    python3 scripts/pexels.py get <id> public/reel/<video-id>/<name>.mp4   -> downloads the best portrait file <= 1080 wide

Needs PEXELS_API_KEY in the environment and api.pexels.com + videos.pexels.com allowed.
Rules: never AI-generated people; a stock person is never shown as a user, never quoted, never
given a testimonial. Type over footage speaks as Ghost Light / ActorRise.
"""
import json, os, sys, urllib.parse, urllib.request

API = "https://api.pexels.com/videos"


def call(url):
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        sys.exit("PEXELS_API_KEY is not set")
    req = urllib.request.Request(url, headers={"Authorization": key, "User-Agent": "actorrise-content-engine"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def search(q, n=10):
    d = call(f"{API}/search?query={urllib.parse.quote(q)}&orientation=portrait&size=medium&per_page={n}")
    for v in d.get("videos", []):
        print(json.dumps({"id": v["id"], "seconds": v["duration"], "author": v["user"]["name"], "url": v["url"], "image": v["image"]}))


def get(vid, out):
    v = call(f"{API}/videos/{vid}")
    files = [f for f in v["video_files"] if f.get("height") and f["height"] > f["width"] and f["width"] <= 1080]
    files.sort(key=lambda f: f["width"], reverse=True)
    if not files:
        sys.exit("no portrait file for this clip")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    req = urllib.request.Request(files[0]["link"], headers={"User-Agent": "actorrise-content-engine"})
    with urllib.request.urlopen(req, timeout=300) as r, open(out, "wb") as fh:
        fh.write(r.read())
    print(json.dumps({"saved": out, "width": files[0]["width"], "height": files[0]["height"],
                      "credit": f'{v["user"]["name"]} on Pexels', "page": v["url"]}))


if __name__ == "__main__":
    if sys.argv[1] == "search":
        search(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 10)
    elif sys.argv[1] == "get":
        get(sys.argv[2], sys.argv[3])
