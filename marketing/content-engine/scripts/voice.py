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
Voices (ElevenLabs premade, commercial use on paid plans): narrator George (the Dora film voice, Canberk 2026-11-10) with Liam as the second voice ("explainer"), partner Lily. Override
per line with "voice": "<name or voice_id>", or per spec with "voices": {"narrator": id, "partner": id}.
"""
import base64, json, os, re, sys, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.elevenlabs.io/v1"
VOICES = {"narrator": "JBFqnCBsd6RMkjVDRZzb", "explainer": "JBFqnCBsd6RMkjVDRZzb", "liam": "TX3LPaxmHKxFdv7VOQHJ", "george": "JBFqnCBsd6RMkjVDRZzb", "partner": "pFZP5JQG7iQjIQuC4Bku", "lily": "pFZP5JQG7iQjIQuC4Bku"}
# eleven_v3 acts: it reads audio tags like [amused], [warmly], [whispers], [sighs], [excited]
# (Canberk, 2026-11-04: emotion and tone in every voice-over, never monotone).
MODEL = os.environ.get("ELEVENLABS_TTS_MODEL", "eleven_v3")


def tts(text, voice_id, key, settings=None):
    body = {"text": text, "model_id": MODEL,
            "voice_settings": settings or ({"stability": 0.0, "similarity_boost": 0.8} if MODEL.startswith("eleven_v3")
                                           else {"stability": 0.3, "similarity_boost": 0.8, "style": 0.6, "use_speaker_boost": True})}
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
    out, cur, s0, tag = [], "", None, 0
    for c, s, e in zip(chars, starts, ends):
        # audio tags ([amused], [speaking softly]) are acted, not shown
        if c == "[":
            tag += 1; continue
        if c == "]":
            tag = max(0, tag - 1); continue
        if tag:
            continue
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
    # `say` is the acted script with audio tags; `text` stays clean for what is shown on screen.
    res = tts(line.get("say") or line["text"], vid, key)
    rel = f"voice/{spec['id']}/{idx:02d}.mp3"
    path = os.path.join(ROOT, "public", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(base64.b64decode(res["audio_base64"]))
    al = res.get("normalized_alignment") or res.get("alignment")
    line["audio"] = rel
    line["words"] = words_from_alignment(al)
    line["dur"] = round(line["words"][-1]["e"] + 0.15, 3) if line["words"] else 1.0
    return True


def voice_take(spec, key):
    """Drawn films: the whole narration in ONE take (Canberk, 2026-11-09: line by line it lost energy and
    left gaps). One ElevenLabs request for all lines, so the read keeps its pace and energy; the word
    timings are split back per line for the captions, and the scenes are fitted to the lines."""
    v = spec.get("voice") or {}
    lines = v.get("lines") or []
    if not spec.get("scenes") or not lines or v.get("continuous") is False:
        return False
    if v.get("takes") and all(os.path.exists(os.path.join(ROOT, "public", x["audio"])) for x in v["takes"]):
        return False
    lead = float(v.get("take_at", 0.3))
    # Two voices can trade lines (Canberk, 2026-11-10: "him and another one switching"): each run of
    # consecutive lines in the same voice is one take; the runs follow each other with a short breath.
    runs = []
    for l in lines:
        who = l.get("voice") or v.get("voice") or "narrator"
        if runs and runs[-1][0] == who:
            runs[-1][1].append(l)
        else:
            runs.append([who, [l]])
    t, takes = lead, []
    for k, (who, group) in enumerate(runs):
        vid = (spec.get("voices") or {}).get(who, VOICES.get(who.lower(), who))
        res = tts(" ".join((l.get("say") or l["text"]).strip() for l in group), vid, key)
        rel = f"voice/{spec['id']}/take{k:02d}.mp3"
        path = os.path.join(ROOT, "public", rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(base64.b64decode(res["audio_base64"]))
        words = words_from_alignment(res.get("normalized_alignment") or res.get("alignment"))
        i = 0
        for l in group:
            n = len(l["text"].split())
            ws = words[i:i + n] or words[-1:]
            i += n
            s0 = ws[0]["s"]
            l["at"] = round(t + s0, 3)
            l["words"] = [{"w": w["w"], "s": round(w["s"] - s0, 3), "e": round(w["e"] - s0, 3)} for w in ws]
            l["dur"] = round(ws[-1]["e"] - s0 + 0.15, 3)
            l.pop("audio", None)
        takes.append({"audio": rel, "at": round(t, 3), "voice": who})
        t += (words[-1]["e"] if words else 1.0) + 0.12
    v["takes"], v["take_at"] = takes, lead
    v.pop("take", None)
    spec["voice"] = v
    # Fit the scenes to the read: scene k starts as its line starts, so the picture follows the voice.
    sc = spec["scenes"]
    narrated = sc[:-1] if sc and sc[-1].get("type") == "end" and len(lines) == len(sc) - 1 else sc
    if len(lines) == len(narrated):
        for k, scene in enumerate(narrated):
            start = 0 if k == 0 else lines[k]["at"] - 0.1
            end = lines[k + 1]["at"] - 0.1 if k + 1 < len(lines) else lines[k]["at"] + lines[k]["dur"] + (0.5 if narrated is sc else 0.35)
            scene["seconds"] = round(max(1.2, end - start), 2)
        if narrated is not sc:
            sc[-1]["seconds"] = sc[-1].get("seconds", 2.4)
    else:
        print(f"WARNING: {len(lines)} voice lines for {len(sc)} scenes; write one line per scene so the picture follows the voice", file=sys.stderr)
    return True


def main(spec_path):
    key = os.environ.get("ELEVENLABS_API_KEY") or (open(os.environ["ELEVENLABS_KEY_FILE"]).read().strip() if os.environ.get("ELEVENLABS_KEY_FILE") else "")
    if not key:
        print("ELEVENLABS_API_KEY not set", file=sys.stderr)
        sys.exit(2)
    spec = json.load(open(spec_path))
    n, changed = 0, False
    if spec.get("scenes") and (spec.get("voice") or {}).get("continuous") is not False:
        changed |= voice_take(spec, key)
    else:
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
