"""Rebuild lib/fonts/files from the Google Fonts source repo.

Why: the files used to be Google's served `latin` subset, which has no ş, ğ,
ı or İ, so every Turkish word drew those letters from a fallback face (CAN-18,
2026-11-02). This cuts each family from its full source TTF down to Latin-1
plus the six Turkish letters, unhinted, as woff2.

    uv tool run --from 'fonttools[woff]' python scripts/subset_fonts.py <download dir> lib/fonts/files

The download dir is a scratch folder: the TTFs are cached there between runs.
"""
import urllib.request, urllib.parse, pathlib, subprocess, sys
SRC = pathlib.Path(sys.argv[1]); OUT = pathlib.Path(sys.argv[2]); SRC.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
MAP = {
 "montserrat-normal-100-900": ("montserrat", "Montserrat[wght].ttf"),
 "jetbrains-mono-normal-100-800": ("jetbrainsmono", "JetBrainsMono[wght].ttf"),
 "cormorant-garamond-normal-300-700": ("cormorantgaramond", "CormorantGaramond[wght].ttf"),
 "playfair-display-normal-400-900": ("playfairdisplay", "PlayfairDisplay[wght].ttf"),
 "big-shoulders-normal-100-900": ("bigshoulders", "BigShoulders[opsz,wght].ttf"),
 "instrument-serif-normal-400": ("instrumentserif", "InstrumentSerif-Regular.ttf"),
 "instrument-serif-italic-400": ("instrumentserif", "InstrumentSerif-Italic.ttf"),
 "bricolage-grotesque-normal-200-800": ("bricolagegrotesque", "BricolageGrotesque[opsz,wdth,wght].ttf"),
 "courier-prime-normal-400": ("courierprime", "CourierPrime-Regular.ttf"),
 "courier-prime-normal-700": ("courierprime", "CourierPrime-Bold.ttf"),
 "courier-prime-italic-400": ("courierprime", "CourierPrime-Italic.ttf"),
 "courier-prime-italic-700": ("courierprime", "CourierPrime-BoldItalic.ttf"),
}
# Google Fonts' latin + latin-ext ranges (Turkish ş ğ ı İ are in latin-ext / U+0131).
# Google's latin range plus Latin Extended-A (U+0100-017F): every Turkish
# letter (ş ğ ı İ) and most of Europe, without Vietnamese and phonetics.
UNI = ("U+0000-00FF,U+011E-011F,U+0130-0131,U+0152-0153,U+015E-015F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
       "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")
for name, (fam, fn) in MAP.items():
    src = SRC / fn
    if not src.exists():
        url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{fam}/" + urllib.parse.quote(fn)
        src.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    out = OUT / f"{name}.woff2"
    subprocess.run(["pyftsubset", str(src), f"--unicodes={UNI}", "--layout-features=*",
                    "--flavor=woff2", "--no-hinting", "--desubroutinize", f"--output-file={out}"], check=True)
    print(name, out.stat().st_size)
