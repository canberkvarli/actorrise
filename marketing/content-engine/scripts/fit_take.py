#!/usr/bin/env python3
"""Story + how-to films: fit a one-take narration to the film and split off the end card's line.

    python3 scripts/fit_take.py specs/<id>.json [speed]      (after scripts/voice.py has voiced the take)

The spec has one voice line per scene plus a LAST line for the Ghost Light end card (its own spec,
specs/<id>-end.json, joined with scripts/join.sh). This speeds the take up (default 1.15, George reads
slowly), rescales every word timing, fits each scene to its line (scene k starts 0.1s before line k),
cuts the end line out of the take into public/voice/<id>-end/end.mp3 and writes the end spec's line.
The original read is kept next to the take as take00.orig.mp3 (not committed).
"""
import json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path, speed = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 1.15
spec = json.load(open(path)); v = spec["voice"]; lines = v["lines"]; sc = spec["scenes"]
assert len(v["takes"]) == 1 and len(lines) == len(sc) + 1, "one take, one line per scene plus the end line"
take = os.path.join(ROOT, "public", v["takes"][0]["audio"]); orig = take.replace(".mp3", ".orig.mp3")
if v.get("speed"): sys.exit("already fitted")
lead = v["takes"][0]["at"]
os.replace(take, orig)
for l in lines:
    l["at"] = round(lead + (l["at"] - lead) / speed, 3); l["dur"] = round(l["dur"] / speed, 3)
    l["words"] = [{"w": w["w"], "s": round(w["s"] / speed, 3), "e": round(w["e"] / speed, 3)} for w in l["words"]]
end = lines[-1]; cut = end["at"] - lead - 0.15  # seconds into the sped take where the end line starts
ff = ["ffmpeg", "-loglevel", "error", "-y", "-i", orig, "-af"]
subprocess.check_call(ff + [f"atempo={speed},atrim=0:{cut:.3f},afade=t=out:st={cut - 0.05:.3f}:d=0.05", take])
edir = os.path.join(ROOT, "public", "voice", spec["id"] + "-end"); os.makedirs(edir, exist_ok=True)
subprocess.check_call(ff + [f"atempo={speed},atrim={cut:.3f},asetpts=PTS-STARTPTS", os.path.join(edir, "end.mp3")])
for k, scene in enumerate(sc):
    start = 0 if k == 0 else lines[k]["at"] - 0.1
    scene["seconds"] = round(lines[k + 1]["at"] - 0.1 - start, 3) if k + 1 < len(sc) else round(end["at"] - 0.15 - start, 3)
v["speed"] = speed
json.dump(spec, open(path, "w"), indent=2, ensure_ascii=False)
ep = path.replace(".json", "-end.json")
if os.path.exists(ep):
    e = json.load(open(ep)); el = e["voice"]["lines"][0]
    el.update({"text": end["text"], "at": 0.0, "audio": f"voice/{spec['id']}-end/end.mp3", "dur": round(end["dur"] + 0.15, 3),
               "words": [{"w": w["w"], "s": round(w["s"] + 0.15, 3), "e": round(w["e"] + 0.15, 3)} for w in end["words"]]})
    json.dump(e, open(ep, "w"), indent=2, ensure_ascii=False)
print("fitted:", [s["seconds"] for s in sc], "total", round(sum(s["seconds"] for s in sc), 2), "end line", end["dur"])
