#!/usr/bin/env python3
"""ElevenLabs sound for the content engine (commercial license on paid plans).

    python3 scripts/eleven.py sfx                 # build/extend the sound library once -> public/sfx/eleven/*.wav (committed)
    python3 scripts/eleven.py music specs/<id>.json   # music bed for one video -> public/music/<id>.wav

Needs ELEVENLABS_API_KEY in the environment and api.elevenlabs.io allowed on the network.
Never paste the key into a chat or a file in the repo; it lives in the environment settings.
Exit code 2 means "not available here" so render.sh can fall back to make_music.py.
"""
import json, os, subprocess, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.elevenlabs.io/v1"
FPS = 30

# The library. Short, dry, close-miked, one action each, so every sound is "to the point".
SFX = {
    "pencil_mark": ("one quick pencil check mark on paper, a single short stroke, close mic, dry, no room", 0.6),
    "highlighter": ("a highlighter marker swiped once across paper, crisp felt tip squeak, dry", 0.8),
    "paper_slide": ("a sheet of paper sliding quickly across a wooden desk, short soft whoosh", 0.7),
    "page_flip": ("a single book page turned quickly, crisp paper flip", 0.6),
    "crumple": ("a sheet of paper crumpled into a ball by hand, quick", 0.9),
    "toss_bin": ("a crumpled paper ball landing in a metal waste bin, light clang", 0.7),
    "phone_tap": ("a soft single tap on a glass phone screen, subtle click", 0.5),
    "ui_pop": ("a soft friendly user interface pop, rounded, warm", 0.5),
    "notif": ("a gentle warm phone notification ding, two soft notes", 1.0),
    "typing": ("quiet fast typing on a phone keyboard with soft haptic clicks", 3.0),
    "stamp": ("a rubber stamp thumped onto paper on a desk, solid thud", 0.7),
    "whoosh": ("a soft quick swish, air movement transition, clean", 0.6),
    "spotlight": ("an old theatre spotlight switching on, heavy mechanical clunk and hum", 1.2),
    "clock_tick": ("a wall clock ticking steadily, close, dry", 3.0),
    "applause": ("a small audience giving short polite applause in a small theatre", 2.5),
    "laugh": ("a few people in a small theatre laughing warmly for a moment", 2.0),
    "gasp": ("a small audience gasping together, short", 1.2),
    "chalk": ("one quick chalk stroke on a blackboard", 0.6),
    "door": ("an audition room door opening, wooden, short creak and click", 1.4),
    "heartbeat": ("two nervous heartbeats, deep, close", 1.5),
}

STYLE_PROMPTS = {
    "sunny": "warm lofi hip hop instrumental, mellow Rhodes chords, upright bass, dusty swung drums, vinyl crackle, cozy and hopeful, light",
    "pizzicato": "playful sneaky pizzicato strings and glockenspiel, comedic tiptoe rhythm, light timpani, cartoon mischief, witty",
    "build": "cinematic piano ostinato with strings slowly swelling, emotional and determined, drums enter for a big payoff, nostalgic",
    "festive": "cheerful holiday instrumental, celesta, sleigh bells, music box and pizzicato, sparkling and warm, winter",
}


def key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k:
        print("ELEVENLABS_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    return k


def post(path, body, out_mp3):
    req = urllib.request.Request(
        f"{API}{path}", data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": key(), "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = r.read()
            cost = r.headers.get("character-cost")
    except urllib.error.HTTPError as e:
        print(f"ElevenLabs {path} failed: {e.code} {e.read()[:300]!r}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:  # network blocked, DNS, proxy
        print(f"ElevenLabs unreachable: {e}", file=sys.stderr)
        sys.exit(2)
    open(out_mp3, "wb").write(data)
    return cost


def to_wav(mp3, wav, trim=True):
    af = ["-af", "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-18:TP=-2"] if trim else []
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", mp3, *af, "-ar", "48000", "-ac", "2", wav], check=True)
    os.remove(mp3)


def build_sfx():
    d = os.path.join(ROOT, "public", "sfx", "eleven")
    os.makedirs(d, exist_ok=True)
    for name, (text, dur) in SFX.items():
        wav = os.path.join(d, f"{name}.wav")
        if os.path.exists(wav):
            continue
        cost = post("/sound-generation", {"text": text, "duration_seconds": max(0.5, dur), "prompt_influence": 0.6},
                    wav + ".mp3")
        to_wav(wav + ".mp3", wav)
        print(f"{name}: ok (cost {cost})")


def build_music(spec_path):
    spec = json.load(open(spec_path))
    m = spec.get("music") or {}
    total_ms = sum(round(sc["seconds"] * FPS) for sc in spec["scenes"]) * 1000 // FPS
    types = [sc["type"] for sc in spec["scenes"]]
    prompt = m.get("prompt") or STYLE_PROMPTS.get(m.get("style", "sunny"), STYLE_PROMPTS["sunny"])
    # Tell it where the payoff is, so the lift lands near the right second.
    acc = 0
    for sc in spec["scenes"]:
        if sc["type"] == ("stage" if "stage" in types else "end"):
            break
        acc += round(sc["seconds"] * FPS)
    # The track is asked for 4 seconds longer and cut sharp at the film's end (Canberk, 2026-11-04: sharp
    # finish, no fade out). Asked to end on a chord at the film's length, it rang out to silence about two
    # seconds early (2026-11-09, off-book-by-ten, three tries out of three).
    prompt += f". Starts gentle, opens up after 3 seconds, a clear lift at {acc / FPS:.0f} seconds, keeps its full energy and keeps playing past {total_ms / 1000 + 3:.0f} seconds, no ending, no fade out. No vocals."
    os.makedirs(os.path.join(ROOT, "public", "music"), exist_ok=True)
    wav = os.path.join(ROOT, "public", "music", f"{spec['id']}.wav")
    body = {"prompt": prompt, "music_length_ms": total_ms + 4000, "force_instrumental": True,
            "model_id": os.environ.get("ELEVENLABS_MUSIC_MODEL", "music_v1")}
    post("/music", body, wav + ".mp3")
    end = total_ms / 1000
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav + ".mp3", "-af",
                    f"atrim=0:{end:.3f},afade=t=out:st={end - 0.05:.3f}:d=0.05", "-ar", "48000", "-ac", "2", wav], check=True)
    os.remove(wav + ".mp3")
    print(wav, {"engine": "elevenlabs", "ms": total_ms})


if __name__ == "__main__":
    if sys.argv[1] == "sfx":
        build_sfx()
    elif sys.argv[1] == "music":
        build_music(sys.argv[2])
