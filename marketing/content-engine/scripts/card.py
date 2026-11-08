#!/usr/bin/env python3
"""Build the picture in picture app card for a film from a real app recording.

    python3 scripts/card.py specs/<id>.json

Reads the first beat with a "pip" that has "segments" and writes pip.src (under public/). Each segment
maps film time to recording time, so the app's own state (the partner's line lit, the actor's line the
cue) lands on the person in the footage:
    {"f": [0, 5.0], "r": 12.25}       film seconds 0 to 5.0 play the recording from second 12.25
    {"f": [5.0, 5.76], "hold": 17.24} film seconds 5.0 to 5.76 hold the recording's frame at 17.24
"crop" is a list of [y, h] strips of the recording (device pixels at 1080 wide), stacked top to bottom,
e.g. the app's header and the part of the page the lines run in. The card is "width" px wide.
Nothing is drawn on the recording: what the card shows is the app as it ran.
"""
import json, subprocess, sys, os

spec = json.load(open(sys.argv[1]))
beat = next(b for b in spec["beats"] if b.get("pip", {}).get("segments"))
pip = beat["pip"]
rec, out = pip["rec"], os.path.join("public", pip["src"])
W, fps = pip.get("width", 410), 30
parts = []
for i, s in enumerate(pip["segments"]):
    a, b = s["f"]; d = b - a
    if "hold" in s:
        parts.append(f"[0:v]trim=start={s['hold']}:duration={1/fps:.4f},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={d:.4f},trim=duration={d:.4f}[s{i}]")
    else:
        parts.append(f"[0:v]trim=start={s['r']}:duration={d:.4f},setpts=PTS-STARTPTS[s{i}]")
n = len(pip["segments"])
crops = pip.get("crop", [[0, 2338]])
f = ";".join(parts) + ";" + "".join(f"[s{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0,fps={fps},split={len(crops)}" + "".join(f"[c{k}]" for k in range(len(crops)))
f += ";" + ";".join(f"[c{k}]crop=1080:{h}:0:{y}[k{k}]" for k, (y, h) in enumerate(crops))
f += ";" + "".join(f"[k{k}]" for k in range(len(crops))) + (f"vstack=inputs={len(crops)}" if len(crops) > 1 else "null") + f",scale={W}:-2:flags=lanczos,format=yuv420p[v]"
os.makedirs(os.path.dirname(out), exist_ok=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", rec, "-filter_complex", f, "-map", "[v]", "-c:v", "libx264", "-crf", "14", "-preset", "veryfast", out], check=True)
print(json.dumps({"card": out, "seconds": pip["segments"][-1]["f"][1]}))
