#!/usr/bin/env python3
"""Voices for a reel: narration and scene partner lines from ElevenLabs, with word timings.

    python3 scripts/voice.py specs/<id>.json      (render.sh runs it when ELEVENLABS_API_KEY is set)

What it voices:
  spec "voice": {"lines": [{"text": "...", "at": 1.2, "voice": "narrator"}], "subtitles": true}
      narration over the whole film; `at` is seconds from the start of the video.
  a "scene" beat's lines with "who": "PARTNER" (and "YOU" lines only if "voice_you": true)
      the scene partner reading; their timing inside the beat is laid out from the audio.

Each voiced line gets "audio" (a path under public/voice/<id>/) and "words":
[{"w": "word", "s": 0.12, "e": 0.40}] in seconds from the start of that line. The spec file is
updated in place, so a re-render never pays twice; delete "audio" from a line to re-voice it.

Needs ELEVENLABS_API_KEY and api.elevenlabs.io allowed. Exit code 2 = not available here (the
film renders without voices, and the subtitles fall back to the beat text).
Voices (ElevenLabs premade, commercial use on paid plans): narrator George, partner Lily. Override
per line with "voice": "<name or voice_id>", or per spec with "voices": {"narrator": id, "partner": id}.
"""
import base64, json, os, re, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.elevenlabs.io/v1"
VOICES = {"narrator": "JBFqnCBsd6RMkjVDRZzb", "george": "JBFqnCBsd6RMkjVDRZzb", "partner": "pFZP5JQG7iQjIQuC4Bku", "lily": "pFZP5JQG7iQjIQuC4Bku"}
MODEL = os.environ.get("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")


def tts(text, voice_id, key, settings=None):
    body = {"text": text, "model_id": MODEL,
            "voice_settings": settings or {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35, "use_speaker_boost": True}}
    req = urllib.request.Request(f"{API}/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs TTS failed: {e.code} {e.read()[:300]!r}")
    except Exception as e:
        print(f"ElevenLabs unreachable: {e}", file=sys.stderr)
        sys.exit(2)


def words_from_alignment(al):
    """Character timings -> word timings."""
    chars, starts, ends = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    out, cur, s0 = [], "", None
    for c, s, e in zip(chars, starts, ends):
        if c.isspace():
            if cur:
                out.append({"w": cur, "s": round(s0, 3), "e": round(prev_e, 3)})
            cur, s0 = "", None
            continue
        if s0 is None:
            s0 = s
        cur += c
        prev_e = e
    if cur:
        out.append({"w": cur, "s": round(s0, 3), "e": round(prev_e, 3)})
    return out


def voice_line(line, spec, idx, key, default):
    if line.get("audio") and os.path.exists(os.path.join(ROOT, "public", line["audio"])):
        return False
    vid = line.get("voice") or default
    vid = (spec.get("voices") or {}).get(vid, VOICES.get(vid.lower(), vid))
    res = tts(line["text"], vid, key)
    rel = f"voice/{spec['id']}/{idx:02d}.mp3"
    path = os.path.join(ROOT, "public", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(base64.b64decode(res["audio_base64"]))
    al = res.get("normalized_alignment") or res.get("alignment")
    line["audio"] = rel
    line["words"] = words_from_alignment(al)
    line["dur"] = round(line["words"][-1]["e"] + 0.15, 3) if line["words"] else 1.0
    return True


def main(spec_path):
    key = os.environ.get("ELEVENLABS_API_KEY") or (open(os.environ["ELEVENLABS_KEY_FILE"]).read().strip() if os.environ.get("ELEVENLABS_KEY_FILE") else "")
    if not key:
        print("ELEVENLABS_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    spec = json.load(open(spec_path))
    n, changed = 0, False
    for line in (spec.get("voice") or {}).get("lines", []):
        changed |= voice_line(line, spec, n, key, "narrator"); n += 1
    for b in spec.get("beats", []):
        if b.get("kind") != "scene":
            continue
        for line in b.get("lines", []):
            if line.get("who", "").upper() == "PARTNER" or b.get("voice_you"):
                changed |= voice_line(line, spec, n, key, "partner" if line.get("who", "").upper() == "PARTNER" else "narrator")
            n += 1
    # Scene beats end right after the last line (Canberk, 2026-11-04: it waited about 3 seconds).
    # Same timeline as sceneTimeline in ReelVideo.tsx: start 0.7, each line its length plus 0.45.
    for b in spec.get("beats", []):
        if b.get("kind") != "scene" or not b.get("lines"):
            continue
        t = b.get("start", 0.7)
        for i, l in enumerate(b["lines"]):
            d = l.get("dur") or (l["words"][-1]["e"] + 0.15 if l.get("words") else len(l["text"].split()) * 0.36 + 0.4)
            t += d + (0.45 if i < len(b["lines"]) - 1 else 0)
        secs = round(t + 0.6, 2)
        if b.get("seconds") != secs:
            b["seconds"] = secs; changed = True
    # Drawn films: the narration should run through the film, not two short lines (Canberk, 2026-11-04).
    if spec.get("scenes") and (spec.get("voice") or {}).get("lines"):
        total = sum(sc.get("seconds", 0) for sc in spec["scenes"])
        spoken = sum(l.get("dur", 0) for l in spec["voice"]["lines"])
        if total and spoken < 0.6 * total:
            print(f"WARNING: narration covers {spoken:.1f}s of {total:.1f}s; write a continuous voice-over", file=sys.stderr)
    if changed:
        json.dump(spec, open(spec_path, "w"), indent=2, ensure_ascii=False)
    print(spec_path, "voiced" if changed else "already voiced")


if __name__ == "__main__":
    main(sys.argv[1])
