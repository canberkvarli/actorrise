#!/usr/bin/env python3
"""Compose the music bed for one story spec, timed to its scenes.

    python3 scripts/make_music.py specs/<id>.json   -> public/music/<id>.wav

Real instrument samples (FluidR3 GM, MIT, fetched by scripts/get_samples.sh) plus
synthesized drums. The spec chooses a style:

    "music": {"style": "sunny", "drop": "end", "volume": 0.45}

Styles follow what is working on Reels and TikTok right now (keep this list fresh, see
SKILL.md): lyric-free beds under on-screen text, a filtered intro that opens up on the
reveal, and seasonal sounds from November on.

  sunny     lofi Rhodes, upright bass, swung hats, vinyl. The default under text.
  pizzicato sneaky plucked strings, glockenspiel, timpani. Comedy, mischief, "bring something funny".
  build     piano ostinato, strings that swell, drums land on the payoff. Then vs now, late nights.
  festive   celesta, sleigh bells, music box. November and December.

The tempo is bent so the drop lands exactly on a scene start (default: the stage scene if
there is one, else the end card), and every camera move gets a short swell into the cut.
The seed is the spec id, so each video gets its own melody and a re-render is identical.
"""
import json, os, subprocess, sys, hashlib
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
FPS = 30
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, "samples", "FluidR3_GM")
NOTE = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
_cache = {}


def sample(instr, midi):
    key = (instr, midi)
    if key not in _cache:
        path = os.path.join(SAMPLES, f"{instr}-mp3", f"{NOTE[midi % 12]}{midi // 12 - 1}.mp3")
        raw = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
            capture_output=True, check=True,
        ).stdout
        s = np.frombuffer(raw, dtype=np.float32).copy()
        nz = np.nonzero(np.abs(s) > 0.002)[0]  # trim the mp3's leading silence so notes land on time
        _cache[key] = s[nz[0]:] if len(nz) else s
    return _cache[key]


def env_cut(sig, dur, fade=0.04):
    n = min(len(sig), int(dur * SR))
    out = sig[:n].copy()
    f = min(int(fade * SR), n)
    if f:
        out[-f:] *= np.linspace(1, 0, f)
    return out


class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR) + SR * 3
        self.bus = {}

    def add(self, bus, t, sig, gain=1.0, pan=0.0):
        if t < 0:
            sig = sig[int(-t * SR):]
            t = 0
        b = self.bus.setdefault(bus, np.zeros((2, self.n), np.float32))
        i = int(t * SR)
        j = min(self.n, i + len(sig))
        if j <= i:
            return
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        b[0, i:j] += sig[: j - i] * gain * l * 1.414
        b[1, i:j] += sig[: j - i] * gain * r * 1.414

    def note(self, bus, instr, midi, t, dur, gain=0.5, pan=0.0):
        self.add(bus, t, env_cut(sample(instr, midi), dur), gain, pan)

    def chord(self, bus, instr, notes, t, dur, gain=0.35, pan=0.0, strum=0.012):
        for k, m in enumerate(notes):
            self.note(bus, instr, m, t + k * strum, dur, gain, pan + (k - len(notes) / 2) * 0.12)


# ---------- synthesized drums and textures ----------
rng_noise = np.random.default_rng(7)


def _t(sec):
    return np.arange(int(sec * SR)) / SR


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output="sos"), x).astype(np.float32)


def kick(punch=1.0):
    t = _t(0.4)
    f = 46 + 90 * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8)
    s[:200] += rng_noise.normal(0, 0.3, 200) * np.linspace(1, 0, 200) * punch
    return (s * 0.9).astype(np.float32)


def snare(tight=False):
    t = _t(0.28)
    n = filt(rng_noise.normal(0, 1, len(t)), "band", [1200, 7000]) * np.exp(-t * (40 if tight else 20))
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30) * 0.6
    return ((n * 0.7 + tone) * 0.6).astype(np.float32)


def snap():
    t = _t(0.12)
    return (filt(rng_noise.normal(0, 1, len(t)), "band", [1800, 4500]) * np.exp(-t * 70) * 0.7).astype(np.float32)


def hat(open_=False):
    t = _t(0.35 if open_ else 0.07)
    return (filt(rng_noise.normal(0, 1, len(t)), "high", 7500) * np.exp(-t * (10 if open_ else 70)) * 0.35).astype(np.float32)


def crash():
    t = _t(2.4)
    n = filt(rng_noise.normal(0, 1, len(t)), "high", 3500)
    return (filt(n, "low", 12000) * np.exp(-t * 2.2) * 0.4).astype(np.float32)


def riser(sec):
    t = _t(sec)
    n = filt(rng_noise.normal(0, 1, len(t)), "band", [1500, 9000])
    return (n * (t / sec) ** 2.5 * 0.35).astype(np.float32)


def swell(sec=0.45):
    """Soft reversed air into a cut."""
    t = _t(sec)
    n = filt(rng_noise.normal(0, 1, len(t)), "band", [600, 5000])
    return (n * (t / sec) ** 3 * 0.18).astype(np.float32)


def bells():
    """Sleigh bell shake: a few grains of inharmonic metal."""
    out = np.zeros(int(0.16 * SR), np.float32)
    t = _t(0.07)
    for _ in range(6):
        g = sum(np.sin(2 * np.pi * f * t) for f in rng_noise.uniform(2800, 9500, 4)) * np.exp(-t * 60)
        i = int(rng_noise.uniform(0, 0.08) * SR)
        out[i:i + len(g)] += g.astype(np.float32) * 0.05
    return out


def vinyl(sec):
    n = int(sec * SR)
    hiss = filt(rng_noise.normal(0, 1, n), "band", [800, 6000]) * 0.005
    clicks = np.zeros(n, np.float32)
    idx = rng_noise.integers(0, n, int(sec * 9))
    clicks[idx] = rng_noise.uniform(0.05, 0.25, len(idx)) * rng_noise.choice([-1, 1], len(idx))
    return (hiss + filt(clicks, "low", 4000)).astype(np.float32)


def reverb(x, sec=1.6, wet=0.2):
    t = _t(sec)
    ir = rng_noise.normal(0, 1, len(t)) * np.exp(-t * 4.2 / sec)
    ir = filt(ir, "low", 6000) * 0.03
    out = np.stack([fftconvolve(x[c], ir)[: x.shape[1]] for c in range(2)])
    return x + wet * out


# ---------- melody ----------
RHYTHMS = [[0, 1, 2, 3], [0, 1.5, 2, 3.5], [0, 0.5, 1, 3], [0, 2, 2.5, 3], [0.5, 1, 2.5, 3], [0, 1.5, 3]]


def melody(rng, chord_tones, lo, hi, last):
    pool = sorted({m + 12 * o for m in chord_tones for o in range(-3, 4) if lo <= m + 12 * o <= hi})
    out = []
    for b in RHYTHMS[rng.integers(len(RHYTHMS))]:
        near = sorted(pool, key=lambda m: abs(m - last) + rng.uniform(0, 4))
        last = near[rng.integers(min(3, len(near)))]
        out.append((b, last))
    return out, last


# ---------- styles ----------
STYLES = {
    "sunny": dict(bpm=84, swing=0.16, prog=[[55, 58, 62, 65], [52, 55, 58, 62], [53, 57, 60, 64], [50, 53, 57, 60]],
                  bass=[43, 36, 41, 38]),
    "pizzicato": dict(bpm=112, swing=0.0, prog=[[50, 53, 57], [50, 53, 57], [55, 58, 62], [57, 61, 64, 67]],
                      bass=[38, 38, 43, 45]),
    "build": dict(bpm=78, swing=0.0, prog=[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
                  bass=[45, 41, 48, 43]),
    # felt: a soft solo piano, like the accompanist of a silent film. For real one-shot films:
    # no drums, no riser, no hiss; warm, slow, a little hopeful, resolving on the end card.
    # pulse: not a song. A soft low thum on the beat like a heartbeat in the room, and now and then
    # a single plucked or bell note (pin, pon). Natural, sparse, no chords, no melody. Real one-shot films.
    "pulse": dict(bpm=62, swing=0.0, prog=[[57, 64], [57, 64], [55, 62], [57, 64]], bass=[45, 45, 43, 45]),
    "felt": dict(bpm=64, swing=0.0, prog=[[57, 60, 64], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62]],
                 bass=[45, 41, 48, 43]),
    "festive": dict(bpm=118, swing=0.0, prog=[[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
                    bass=[48, 45, 41, 43]),
}


def compose(spec):
    m = spec.get("music") or {}
    style = m.get("style", "sunny")
    S = STYLES[style]
    rng = np.random.default_rng(int(hashlib.md5((m.get("seed") or spec["id"]).encode()).hexdigest()[:8], 16))

    if "beats" in spec:  # a reel: every beat is a cut, the drop lands on the first app screen
        kinds = {"title": "title", "broll": "broll", "screen": "screen", "scene": "screen", "end": "end"}
        spec = dict(spec, scenes=[{"type": kinds[b["kind"]], "seconds": b["seconds"]} for b in spec["beats"]])
        if "drop" not in m:
            m = dict(m, drop="screen" if any(b["kind"] == "screen" for b in spec["beats"]) else "end")
    frames, starts, acc = [], [], 0
    for sc in spec["scenes"]:
        starts.append(acc / FPS)
        f = round(sc["seconds"] * FPS)
        frames.append(f)
        acc += f
    total = acc / FPS
    types = [sc["type"] for sc in spec["scenes"]]
    moves = [i > 0 and not (types[i] == "phone" and types[i - 1] == "phone") for i in range(len(types))]

    drop = m.get("drop", "stage" if "stage" in types else "end")
    di = drop if isinstance(drop, int) else (types.index(drop) if drop in types else len(types) - 1)
    t_drop = starts[di]
    bar0 = 240 / S["bpm"]
    bars_pre = max(2, round(t_drop / bar0))
    bar = t_drop / bars_pre
    beat = bar / 4
    n_bars = int(np.ceil(total / bar)) + 1

    # Three levels: a filtered intro, the groove from the first camera move, everything from the drop.
    t_open = next((starts[i] for i in range(1, len(types)) if moves[i]), t_drop)
    open_bar = min(bars_pre, max(1, round(t_open / bar)))
    t_open = open_bar * bar
    mx = Mix(total)
    last = 72
    for b in range(n_bars):
        tb = b * bar
        if tb > total:
            break
        post = b >= bars_pre
        mid = b >= open_bar
        ch = S["prog"][b % 4]
        bs = S["bass"][b % 4]
        lift = b / max(1, bars_pre - 1)  # 0..1 across the intro
        sw = lambda x: x + (S["swing"] * beat if (x * 2) % 2 == 1 else 0)  # swing the off-beat 8ths

        if style == "sunny":
            mx.chord("keys", "electric_piano_1", ch, tb, beat * 1.6, 0.30)
            mx.chord("keys", "electric_piano_1", ch, tb + sw(1.5) * beat, beat * 1.4, 0.22)
            mx.note("bass", "acoustic_bass", bs, tb, beat * 1.8, 0.55)
            mx.note("bass", "acoustic_bass", bs + 7, tb + sw(2.5) * beat, beat * 0.9, 0.4)
            for k in range(8):
                if mid or k % 2 == 1:
                    mx.add("drums", tb + sw(k / 2) * beat, hat(), 0.5 if k % 2 else 0.35, 0.3)
            if mid:
                for x in (0, 2.5):
                    mx.add("drums", tb + x * beat, kick(), 0.8 if post else 0.6)
                for x in (1, 3):
                    mx.add("drums", tb + x * beat, snare(), 0.55 if post else 0.38, -0.1)
            if post:
                if b % 2 == 0:
                    mel, last = melody(rng, ch, 72, 86, last)
                    for x, n in mel:
                        mx.note("lead", "vibraphone", n, tb + sw(x) * beat, beat * 0.9, 0.28, 0.25)

        elif style == "pizzicato":
            pat = [ch[0], ch[0] + 7, ch[0] + 12, ch[0] + 7] * 2
            for k, n in enumerate(pat):
                if k == 7 and b % 2 == 1:
                    n = ch[0] + 11  # chromatic lean into the next bar
                mx.note("keys", "pizzicato_strings", n, tb + k * beat / 2, beat * 0.45, 0.5, -0.2 + 0.05 * k)
            mx.note("bass", "pizzicato_strings", bs, tb, beat * 0.6, 0.55)
            for x in (1, 3):
                mx.add("drums", tb + x * beat, snap(), 0.45 + 0.3 * lift, 0.2)
            if mid:
                mx.note("drums", "timpani", bs, tb, beat * 1.5, 0.45)
                for k in range(8):
                    mx.add("drums", tb + k * beat / 2, hat(), 0.3 if post else 0.18, -0.3)
            if post:
                mel, last = melody(rng, ch, 74, 91, last)
                for x, n in mel:
                    mx.note("lead", "glockenspiel", n, tb + x * beat, beat * 0.8, 0.22, 0.3)
            elif b == 0 or b == bars_pre - 1:
                mx.note("lead", "glockenspiel", ch[-1] + 12, tb, beat, 0.2, 0.3)

        elif style == "build":
            arp = [ch[0], ch[1] + 12, ch[2], ch[1] + 12] * 2
            for k, n in enumerate(arp):
                mx.note("keys", "acoustic_grand_piano", n, tb + k * beat / 2, beat * 0.9, 0.32 + 0.1 * lift, -0.15)
            mx.note("bass", "acoustic_grand_piano", bs - 12, tb, bar * 0.95, 0.35)
            if mid:
                mx.chord("pad", "string_ensemble_1", [n - 12 for n in ch] + ch, tb, bar, 0.12 + 0.12 * (1 if post else lift), strum=0)
            if b == bars_pre - 1:
                mx.chord("pad", "tremolo_strings", ch, tb, bar, 0.2, strum=0)
            if mid and not post:
                mx.add("drums", tb, kick(), 0.45)
            if post:
                for x in range(4):
                    mx.add("drums", tb + x * beat, kick(), 0.7 if x % 2 == 0 else 0.45)
                for x in (1, 3):
                    mx.add("drums", tb + x * beat, snare(), 0.5)
                mel, last = melody(rng, ch, 76, 88, last)
                for x, n in mel:
                    mx.note("lead", "acoustic_grand_piano", n, tb + x * beat, beat * 1.2, 0.3, 0.2)

        elif style == "pulse":
            # thum ... thum: a felt-soft low thump on beats 1 and 3, the second one quieter
            for x, g in ((0, 0.55), (2, 0.38)):
                th = kick(0.15)
                mx.add("drums", tb + x * beat, filt(th, "low", 260), g)
            # pin / pon: one or two single notes per bar at loose, natural moments (pentatonic, never a tune)
            pent = [69, 72, 74, 76, 79, 81, 84]
            for _ in range(int(rng.integers(1, 3))):
                at = tb + float(rng.choice([0.5, 1.5, 2.5, 3.25])) * beat + float(rng.uniform(-0.04, 0.04))
                note = int(rng.choice(pent))
                instr = str(rng.choice(["pizzicato_strings", "celesta", "vibraphone"]))
                mx.note("lead", instr, note, at, beat * 1.5, 0.16 if instr != "pizzicato_strings" else 0.22, float(rng.uniform(-0.5, 0.5)))

        elif style == "felt":
            # left hand: a low root and a fifth, held; right hand: a few chord tones, then a small melody
            mx.note("bass", "acoustic_grand_piano", bs - 12, tb, bar * 1.1, 0.30, -0.2)
            mx.note("bass", "acoustic_grand_piano", bs - 5, tb + beat * 2, bar * 0.6, 0.18, -0.15)
            for k, n in enumerate(sorted(ch)[:3]):
                mx.note("keys", "acoustic_grand_piano", n, tb + beat * (0.5 + k * 0.5), beat * 3, 0.17, 0.1 * k)
            if b >= 1:  # the melody enters in the second bar, whatever the cuts
                mel, last = melody(rng, ch, 69, 81, last)
                for x, n in mel[:3]:
                    mx.note("lead", "acoustic_grand_piano", n, tb + x * beat, beat * 1.8, 0.22, 0.2)
            if post:
                mx.chord("pad", "string_ensemble_1", [n - 12 for n in ch], tb, bar, 0.07, strum=0)

        elif style == "festive":
            arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12] * 2
            for k, n in enumerate(arp):
                mx.note("keys", "celesta", n, tb + k * beat / 2, beat * 0.7, 0.3, 0.15)
            for x in (0, 1, 2, 3):
                mx.note("bass", "pizzicato_strings", bs if x % 2 == 0 else bs + 7, tb + x * beat, beat * 0.5, 0.45)
            for k in range(8):
                mx.add("drums", tb + k * beat / 2, bells(), (0.6 if post else 0.45 if mid else 0.25) * (1.2 if k % 2 == 0 else 0.8), 0.35)
            if mid:
                for x in (0, 2):
                    mx.add("drums", tb + x * beat, kick(0.5), 0.55)
            if post:
                for x in (1, 3):
                    mx.add("drums", tb + x * beat, snare(tight=True), 0.35)
                mel, last = melody(rng, ch, 79, 93, last)
                for x, n in mel:
                    mx.note("lead", "music_box", n, tb + x * beat, beat * 1.1, 0.35, -0.25)

    # The drop: a riser into it, a hit on it (not for felt: the piano just resolves).
    if style not in ("felt", "pulse"):
        mx.add("fx", t_drop - bar, riser(bar), 0.4)
        mx.add("fx", t_drop, crash(), 0.45)
        mx.add("fx", t_drop, kick(1.3), 0.9)
    if style in ("build", "pizzicato"):
        mx.note("fx", "timpani", S["bass"][bars_pre % 4] - 12 if S["bass"][bars_pre % 4] > 40 else S["bass"][bars_pre % 4], t_drop, 1.5, 0.6)
    if style == "festive":
        mx.note("fx", "glockenspiel", S["prog"][0][0] + 24, t_drop, 1.2, 0.4)
    # No extra whoosh into the cuts: the template's camera slide is the only one (Canberk, 2026-11-02:
    # too much shoosh). The drop keeps its riser.
    # Last chord rings out under the end card.
    mx.chord("keys", {"sunny": "electric_piano_1", "pizzicato": "orchestral_harp", "build": "acoustic_grand_piano",
                      "festive": "music_box", "felt": "acoustic_grand_piano", "pulse": "celesta"}[style], [72, 79] if style == "pulse" else [60, 64, 67, 72] if style == "felt" else S["prog"][0], max(t_drop, total - 1.6), 1.8, 0.2 if style == "pulse" else 0.3)

    # Bus processing: the intro is filtered and opens up on the drop.
    n = mx.n
    t = np.arange(n) / SR
    out = np.zeros((2, n), np.float32)
    for name, b in mx.bus.items():
        if name in ("keys", "bass", "drums", "lead", "pad") and style in ("sunny", "festive"):
            dark = np.stack([filt(b[c], "low", 1100 if style == "sunny" else 2200) for c in range(2)])
            k = np.clip((t - (t_open - 0.6)) / 0.6, 0, 1)  # sweep open into the first move
            b = dark * (1 - k) + b * k
        out += b
    if style == "sunny":
        v = vinyl(total + 1)
        out[:, : len(v)] += v
    out = reverb(out, 1.4 if style != "build" else 2.2, 0.16 if style == "sunny" else 0.24)
    out = out[:, : int(total * SR)]
    f = int(0.05 * SR)  # sharp finish, no fade out (Canberk, 2026-11-04)
    out[:, -f:] *= np.linspace(1, 0, f) ** 1.5
    out /= max(1e-6, np.abs(out).max()) / 0.89
    return out, dict(style=style, bpm=round(240 / bar, 1), open=round(t_open, 2), drop=round(t_drop, 2), total=round(total, 2))


def write_wav(path, x):
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", path],
                   input=pcm, check=True)


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1]))
    if not os.path.isdir(SAMPLES):
        subprocess.run([os.path.join(ROOT, "scripts", "get_samples.sh")], check=True)
    audio, info = compose(spec)
    os.makedirs(os.path.join(ROOT, "public", "music"), exist_ok=True)
    out = os.path.join(ROOT, "public", "music", f"{spec['id']}.wav")
    write_wav(out, audio)
    print(out, info)
