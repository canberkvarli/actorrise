# Font files

Latin-1 plus the Turkish letters (Ğ ğ İ ı Ş ş), cut from the full source
fonts in github.com/google/fonts on 2026-11-02 by `scripts/subset_fonts.py`,
and served from here through `next/font/local` (`app/layout.tsx`,
`lib/fonts/theatre.ts`). They replaced `next/font/google`, which fetches
from Google at build time: the Vercel build box could not reach it on
2026-10-03 and 2026-10-06 and both deploys failed.

All eight families are under the SIL Open Font License. Variable files carry
their whole weight range in one file; Instrument Serif and Courier Prime are
static and have one file per style.

| family | file(s) | axes |
|---|---|---|
| Montserrat | montserrat-normal-100-900 | wght |
| JetBrains Mono | jetbrains-mono-normal-100-800 | wght |
| Cormorant Garamond | cormorant-garamond-normal-300-700 | wght |
| Playfair Display | playfair-display-normal-400-900 | wght |
| Big Shoulders | big-shoulders-normal-100-900 | opsz, wght |
| Instrument Serif | instrument-serif-{normal,italic}-400 | static |
| Bricolage Grotesque | bricolage-grotesque-normal-200-800 | opsz, wdth, wght |
| Courier Prime | courier-prime-{normal,italic}-{400,700} | static |

Until 2026-11-02 these were Google's served `latin` subset, which has no ş, ğ
or İ: Turkish text drew those letters from a fallback face. Do not go back to
that subset. To refresh, run `scripts/subset_fonts.py` (see its docstring).
