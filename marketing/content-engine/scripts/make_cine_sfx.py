#!/usr/bin/env python3
"""Cinematic sound effects for the reels: few, heavy, exactly on the cut.

    python3 scripts/make_cine_sfx.py   -> public/sfx/cine/*.wav (committed)

Canberk, 2026-11-03: "super super powerful and on point", not music, not whooshes.
So: one deep hit where a line lands, a piano and timpani chord when the brand appears, a light
switch for a lights-up moment, a clock tick for waiting, a heartbeat for nerves, quiet room tone
under silence. Built from real piano and timpani samples (FluidR3, MIT) plus synthesized sub bass.
"""
import os, sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_music as mm  # sample loader, filters, wav writer

SR = mm.SR
OUT = os.path.join(mm.ROOT, "public", "sfx", "cine")
rng = np.random.default_rng(11)


def t(sec):
    return np.arange(int(sec * SR)) / SR


def lp(x, f):
    return sosfilt(butter(2, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f):
    return sosfilt(butter(2, f, btype="high", fs=SR, output="sos"), x)


def verb(x, sec=2.5, wet=0.35):
    tt = t(sec)
    ir = lp(rng.normal(0, 1, len(tt)) * np.exp(-tt * 4.0 / sec), 5000) * 0.025
    y = fftconvolve(x, ir)[: len(x) + len(ir)]
    out = np.zeros(len(y))
    out[: len(x)] += x
    return out + wet * y


def pad(x, sec):
    out = np.zeros(int(sec * SR))
    out[: min(len(x), len(out))] += x[: len(out)]
    return out


def norm(x, peak=0.95):
    return x / max(1e-9, np.abs(x).max()) * peak


def stereo(x, width=0.0):
    d = int(0.012 * SR * width)
    r = np.concatenate([np.zeros(d), x])[: len(x)] if d else x
    return np.stack([x, r])


def save(name, x, width=0.4):
    os.makedirs(OUT, exist_ok=True)
    mm.write_wav(os.path.join(OUT, f"{name}.wav"), stereo(norm(x), width))
    print(name, f"{len(x) / SR:.2f}s")


def sample(instr, midi, sec):
    s = mm.sample(instr, midi)[: int(sec * SR)].astype(float)
    return pad(s, sec)


def sub(sec=1.6, f0=70, f1=32):
    tt = t(sec)
    f = f1 + (f0 - f1) * np.exp(-tt * 6)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.6)


def impact():
    """The line lands: sub drop, a body thump, a little grit, a long dark tail."""
    sec = 3.0
    body = pad(sub(1.8), sec)
    tt = t(0.25)
    thump = pad(lp(rng.normal(0, 1, len(tt)), 900) * np.exp(-tt * 22) * 0.9, sec)
    click = pad(hp(rng.normal(0, 1, 300), 2000) * np.linspace(1, 0, 300) * 0.4, sec)
    timp = sample("timpani", 38, sec) * 0.8
    return verb(body * 1.0 + thump + click + timp, 2.8, 0.3)[: int(sec * SR)]


def reveal():
    """The brand appears: low piano octave and timpani, sub under it, ringing out."""
    sec = 4.0
    x = sum(sample("acoustic_grand_piano", m, sec) for m in (33, 45, 52, 57)) * 0.5
    x += sample("timpani", 45, sec) * 0.7 + pad(sub(2.4, 60, 30), sec) * 0.8
    return verb(x, 3.2, 0.4)[: int(sec * SR)]


def note():
    """One quiet sustained piano note: the emotional beat before the turn."""
    sec = 3.5
    x = sample("acoustic_grand_piano", 57, sec) + 0.5 * sample("acoustic_grand_piano", 45, sec)
    return verb(x, 3.0, 0.45)[: int(sec * SR)]


def switch():
    """A heavy theatre light switching on: clack, then a low hum swelling in."""
    sec = 1.8
    tt = t(0.06)
    clack = pad(lp(hp(rng.normal(0, 1, len(tt)), 600), 6000) * np.exp(-tt * 90), sec)
    tt2 = t(sec)
    hum = (np.sin(2 * np.pi * 60 * tt2) * 0.5 + np.sin(2 * np.pi * 120 * tt2) * 0.3) * np.clip(tt2 / 0.4, 0, 1) * np.exp(-tt2 * 1.2) * 0.25
    thud = pad(sub(0.4, 110, 50) * 0.6, sec)
    return verb(clack + hum + thud, 1.2, 0.2)[: int(sec * SR)]


def tick():
    """One wall clock tick, close."""
    sec = 0.3
    tt = t(0.02)
    k = pad(hp(rng.normal(0, 1, len(tt)), 1500) * np.exp(-tt * 300), sec)
    k += pad(np.sin(2 * np.pi * 2400 * tt) * np.exp(-tt * 250) * 0.5, sec)
    return verb(k, 0.4, 0.15)[: int(sec * SR)]


def heartbeat():
    """Two deep beats."""
    sec = 1.2
    tt = t(0.18)
    b = np.sin(2 * np.pi * 48 * tt) * np.exp(-tt * 18)
    x = pad(b, sec)
    i = int(0.28 * SR)
    x[i: i + len(b)] += b * 0.7
    return lp(x, 300)


def room():
    """Quiet room tone, 8 seconds, for silence that should not feel empty."""
    sec = 8
    x = lp(rng.normal(0, 1, int(sec * SR)), 700) * 0.04 + lp(rng.normal(0, 1, int(sec * SR)), 180) * 0.05
    f = int(0.5 * SR)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    return x


def riser():
    """Tension into the reveal, 1.5s: rising tone and air, cut dead at the end."""
    sec = 1.5
    tt = t(sec)
    f = 80 * (2 ** (tt / sec * 3))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * (tt / sec) ** 2 * 0.4
    air = hp(rng.normal(0, 1, len(tt)), 3000) * (tt / sec) ** 3 * 0.25
    return tone + air


def chime():
    """The happy close (Canberk, 2026-11-03: "a happy one ping chime, no need to be super dark").
    One bright bell ping, a fifth above it a beat later, synthesized (inharmonic bell partials)."""
    sec = 2.6
    tt = t(sec)
    def bell(f, at, amp):
        y = np.zeros_like(tt)
        n0 = int(at * SR)
        u = tt[: len(tt) - n0]
        for ratio, a, d in ((1.0, 1.0, 1.6), (2.0, 0.45, 0.9), (2.76, 0.25, 0.6), (5.4, 0.12, 0.25)):
            y[n0:] += a * np.sin(2 * np.pi * f * ratio * u) * np.exp(-u / d)
        y[n0:] *= np.minimum(1, u / 0.004)
        return y * amp
    x = bell(1046.5, 0.0, 1.0) + bell(1568.0, 0.11, 0.55)
    return verb(x, 2.0, 0.3)[: int(sec * SR)]


if __name__ == "__main__":
    only = sys.argv[1:]  # e.g. `make_cine_sfx.py chime` builds just that one
    if only == ["chime"]:
        save("chime", chime(), 0.4)
        sys.exit(0)
    if not os.path.isdir(mm.SAMPLES):
        import subprocess
        subprocess.run([os.path.join(mm.ROOT, "scripts", "get_samples.sh")], check=True)
    for name, fn, w in [("impact", impact, 0.5), ("reveal", reveal, 0.6), ("note", note, 0.5), ("switch", switch, 0.2),
                        ("tick", tick, 0.0), ("heartbeat", heartbeat, 0.0), ("room", room, 0.8), ("riser", riser, 0.4), ("chime", chime, 0.4)]:
        save(name, fn(), w)
