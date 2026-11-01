"""Synthesize the sound kit for the story videos. No samples, no licenses.

Run: python3 scripts/make_sfx.py  ->  writes public/sfx/*.wav (44.1k mono)
"""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sfx")
rng = np.random.default_rng(7)


def t(sec):
    return np.arange(int(SR * sec)) / SR


def band(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def low(x, hz, order=4):
    return sosfilt(butter(order, hz, btype="low", fs=SR, output="sos"), x)


def norm(x, peak):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def fade(x, a=0.004, b=0.02):
    n_a, n_b = int(SR * a), int(SR * b)
    env = np.ones_like(x)
    if n_a:
        env[:n_a] = np.linspace(0, 1, n_a)
    if n_b:
        env[-n_b:] = np.linspace(1, 0, n_b)
    return x * env


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    wavfile.write(os.path.join(OUT, name), SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))


def pencil(sec, strokes_per_sec=5.0, peak=0.32):
    """Graphite on paper: grainy band noise shaped into individual strokes."""
    n = int(SR * sec)
    grain = band(rng.standard_normal(n), 1800, 7500)
    # paper tooth: fast random amplitude flicker
    tooth = low(np.abs(rng.standard_normal(n)), 180)
    tooth = 0.55 + 0.45 * tooth / (tooth.max() or 1)
    env = np.zeros(n)
    pos = 0.0
    while pos < sec:
        dur = rng.uniform(0.12, 0.34)
        a, b = int(pos * SR), min(n, int((pos + dur) * SR))
        if b > a:
            k = np.linspace(0, np.pi, b - a)
            env[a:b] = np.maximum(env[a:b], np.sin(k) ** 0.7 * rng.uniform(0.6, 1.0))
        pos += dur + rng.uniform(0.0, 1.0 / strokes_per_sec)
    return fade(norm(grain * tooth * env, peak), 0.01, 0.06)


def boop(f0, f1, sec=0.16, peak=0.42):
    """Soft rounded blip, gentle pitch drop, like a calm UI confirmation."""
    tt = t(sec)
    freq = f0 + (f1 - f0) * (1 - np.exp(-tt * 30))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) + 0.18 * np.sin(2 * phase) + 0.06 * np.sin(3 * phase)
    env = (1 - np.exp(-tt * 900)) * np.exp(-tt * 22)
    return fade(norm(tone * env, peak), 0.001, 0.02)


def tick(peak=0.18):
    tt = t(0.018)
    x = band(rng.standard_normal(len(tt)), 2500, 6000) * np.exp(-tt * 380)
    x += 0.4 * np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 500)
    return norm(x, peak)


def typing(chars=40, every=1.3 / 30, peak=0.16):
    n = int(SR * (chars * every + 0.1))
    out = np.zeros(n)
    for i in range(chars):
        k = tick(peak * rng.uniform(0.7, 1.0))
        a = int((i * every + rng.uniform(-0.004, 0.004)) * SR)
        a = max(0, a)
        out[a : a + len(k)] += k[: max(0, n - a)]
    return out


def pop(peak=0.4):
    tt = t(0.11)
    freq = 320 + 700 * (1 - np.exp(-tt * 60))
    tone = np.sin(2 * np.pi * np.cumsum(freq) / SR)
    env = (1 - np.exp(-tt * 1200)) * np.exp(-tt * 30)
    thump = np.sin(2 * np.pi * 110 * tt) * np.exp(-tt * 45) * 0.6
    return fade(norm(tone * env + thump, peak), 0.001, 0.02)


def chime(peak=0.38):
    """Warm mallet chord for 'lights up'. C major add 9, staggered."""
    sec = 2.4
    tt = t(sec)
    out = np.zeros_like(tt)
    for i, (f, amp) in enumerate([(523.25, 1.0), (659.25, 0.7), (783.99, 0.6), (1174.66, 0.35)]):
        d = int(i * 0.06 * SR)
        tl = tt[: len(tt) - d]
        mallet = np.sin(2 * np.pi * f * tl) + 0.12 * np.sin(2 * np.pi * f * 3.9 * tl) * np.exp(-tl * 9)
        env = (1 - np.exp(-tl * 400)) * np.exp(-tl * (1.6 + i * 0.3))
        out[d:] += amp * mallet * env
    return fade(norm(out, peak), 0.002, 0.3)


def slide(sec=0.5, peak=0.22):
    """Paper sliding across a desk: noise swell, lowpass sweep."""
    n = int(SR * sec)
    noise = rng.standard_normal(n)
    tt = np.arange(n) / SR
    env = np.sin(np.pi * tt / sec) ** 1.5
    # crude sweep: blend a dark and a bright band by position
    dark, bright = band(noise, 200, 1500), band(noise, 1500, 5000)
    mix = np.sin(np.pi * tt / sec)
    return fade(norm((dark * (1 - mix) + bright * mix * 0.6) * env, peak), 0.01, 0.05)


def toss(peak=0.25):
    return slide(0.32, peak)


def thud(peak=0.35):
    tt = t(0.14)
    x = np.sin(2 * np.pi * 95 * tt) * np.exp(-tt * 38) + 0.3 * band(rng.standard_normal(len(tt)), 300, 1200) * np.exp(-tt * 70)
    return fade(norm(x, peak), 0.001, 0.02)


if __name__ == "__main__":
    save("pencil_short.wav", pencil(0.9))
    save("pencil_long.wav", pencil(1.8))
    save("boop_lo.wav", boop(620, 520))
    save("boop_hi.wav", boop(880, 740))
    save("typing.wav", typing(48))
    save("pop.wav", pop())
    save("chime.wav", chime())
    save("slide.wav", slide())
    save("toss.wav", toss())
    save("thud.wav", thud())
    print("ok", sorted(os.listdir(OUT)))
