"""Turkish search vocabulary (CAN-19).

Turkish actors search in Turkish: "komik monolog kadın", "2 dakikadan kısa",
"20'li yaşlarda erkek". Multi-word queries go to the tier-3 LLM parser, which
reads Turkish fine. This file is for the cheap paths that are pure keyword
work: a single word ("komik", "kadın") classified as tier 1, the filter-only
check, and durations, which are patterns rather than judgements.

Turkish is agglutinative, so "kadın" arrives as kadına, kadının, kadınlar.
Rather than list every form, `tr_stem` strips common case and plural endings,
and only ever lands on a stem that is in THIS vocabulary. It never touches
English words: none of the stems below is an English word.

Normalisation: Python's lower() turns "İ" into "i" plus a combining dot, which
then matches nothing. `tr_lower` maps İ to i first. "I" is left alone because
the same box takes English queries, where I lowers to i.
"""

from __future__ import annotations

import re
from typing import Dict, Optional

# dimension -> {turkish word: value}. Values use the same vocabulary as the
# English KEYWORD_MAPPINGS in query_optimizer.py.
TR_MAPPINGS: Dict[str, dict] = {
    "emotions": {
        "üzgün": "sadness", "hüzünlü": "sadness", "hüzün": "sadness",
        "mutsuz": "sadness", "melankolik": "melancholy",
        "mutlu": "joy", "neşeli": "joy", "komik": "joy", "eğlenceli": "joy",
        "kızgın": "anger", "öfkeli": "anger", "sinirli": "anger", "öfke": "anger",
        "korkmuş": "fear", "korku": "fear", "endişeli": "fear", "gergin": "fear",
        "umutlu": "hope", "umut": "hope",
        "umutsuz": "despair", "çaresiz": "despair",
        "özlem": "longing", "hasret": "longing",
        "kararlı": "determination",
    },
    "gender": {
        "erkek": "male", "adam": "male", "oğlan": "male", "delikanlı": "male",
        "kadın": "female", "kız": "female", "bayan": "female",
    },
    "age_range": {
        "çocuk": "child",
        "genç": "teens", "ergen": "teens", "lise": "teens",
        "yaşlı": "60+",
    },
    "themes": {
        "aşk": "love", "sevgi": "love", "ayrılık": "love", "evlilik": "love",
        "boşanma": "love", "flört": "love",
        "ölüm": "death",
        "güç": "power", "iktidar": "power",
        "ihanet": "betrayal",
        "intikam": "revenge",
        "aile": "family", "anne": "family", "baba": "family",
        "kimlik": "identity",
        # not "yas" (mourning): "yasa" (law) would stem onto it.
        "kayıp": "loss",
        "onur": "honor", "namus": "honor", "sadakat": "honor",
        "özgürlük": "freedom",
        "delilik": "madness",
        "kader": "fate",
        "kıskançlık": "jealousy",
        "hırs": "ambition",
        "yalnızlık": "isolation",
        "affetmek": "redemption", "bağışlama": "redemption",
    },
    "character_type": {
        "kötü": ["power", "revenge"],
        "kahraman": ["honor", "redemption", "identity"],
    },
    "category": {
        "klasik": "classical", "antik": "classical", "yunan": "classical",
        "çağdaş": "contemporary", "güncel": "contemporary",
    },
    "author": {
        "şekspir": "William Shakespeare",
        "çehov": "Anton Chekhov",
        "molyer": "Molière",
    },
    "tone": {
        "komik": "comedic", "komedi": "comedic", "güldürü": "comedic",
        "eğlenceli": "comedic", "esprili": "comedic", "alaycı": "comedic",
        "iğneleyici": "comedic",
        "dramatik": "dramatic", "dram": "dramatic", "ciddi": "dramatic",
        "trajik": "dramatic", "yoğun": "dramatic", "ağır": "dramatic",
        "karanlık": "dark",
        "romantik": "romantic",
        "felsefi": "philosophical",
        "asi": "defiant", "isyankar": "defiant", "isyankâr": "defiant",
    },
    "source_type": {
        "film": ["film"], "sinema": ["film"],
        "dizi": ["tv"], "televizyon": ["tv"],
    },
}

#: Every Turkish key, so tr_stem can refuse to land anywhere else.
_TR_WORDS = frozenset(w for dim in TR_MAPPINGS.values() for w in dim)

# Longest first, so "kadınların" loses "ların" before it could lose "ın".
# Plural, genitive, dative, ablative, locative, accusative, possessive,
# plus the buffer consonants (n, y) that join them.
_SUFFIXES = sorted(
    {
        "ların", "lerin", "ları", "leri", "lar", "ler",
        "ının", "inin", "unun", "ünün", "nın", "nin", "nun", "nün",
        "ına", "ine", "una", "üne", "ya", "ye", "na", "ne",
        "dan", "den", "tan", "ten", "ndan", "nden",
        "da", "de", "ta", "te", "nda", "nde",
        "ını", "ini", "unu", "ünü", "yı", "yi", "yu", "yü",
        "ın", "in", "un", "ün", "ı", "i", "u", "ü", "a", "e",
        "sı", "si", "su", "sü",
    },
    key=len,
    reverse=True,
)

# Consonant softening at a suffix boundary: monolog -> monoloğu,
# erkek -> erkeği, çocuk -> çocuğu. Undo it on the stem.
_SOFTENED = {"ğ": "k", "b": "p", "c": "ç", "d": "t"}


def tr_lower(text: str) -> str:
    return (text or "").replace("İ", "i").lower()


def tr_stem(word: str) -> Optional[str]:
    """The vocabulary word this inflected form belongs to, or None."""
    if word in _TR_WORDS:
        return word
    for suffix in _SUFFIXES:
        if len(word) - len(suffix) < 2 or not word.endswith(suffix):
            continue
        stem = word[: -len(suffix)]
        if stem in _TR_WORDS:
            return stem
        if stem and stem[-1] in _SOFTENED:
            hard = stem[:-1] + _SOFTENED[stem[-1]]
            if hard in _TR_WORDS:
                return hard
    return None


def tr_lookup(dimension: str, word: str):
    """Value for a (possibly inflected) Turkish word in one dimension."""
    stem = tr_stem(word)
    if stem is None:
        return None
    return TR_MAPPINGS.get(dimension, {}).get(stem)


#: Words a Turkish query is padded with that say nothing about the piece.
#: Feeds is_filter_only_query, exactly like the English _FILTER_WORDS.
TR_FILLER_WORDS = frozenset(
    """
    bir ve veya ile için gibi bana beni bu şu çok daha en az fazla
    monolog monologu monoloğu monologlar monologları parça parçası parçalar
    oyun oyunu oyundan sahne sahnesi tirat tiradı replik
    dakika dakikalık dakikadan saniye saniyelik saniyeden altı üstü kısa uzun
    yaş yaşında yaşlarında yaşlı li lı lu lü
    istiyorum lazım arıyorum bul öner seçmeler seçme konservatuvar sınav sınavı
    """.split()
)


_NUM = r"(\d+(?:[.,]\d+)?)"
_DK = r"(?:dakika|dk)"
_SN = r"(?:saniye|sn)"


def _secs(num: str, unit_is_min: bool) -> int:
    n = float(num.replace(",", "."))
    return round(n * 60) if unit_is_min else round(n)


def tr_duration_bounds(query_lower: str) -> Dict[str, int]:
    """min_duration / max_duration (seconds) from Turkish duration phrases.

    Turkish puts the bound AFTER the number: "2 dakikadan kısa" is under 2
    minutes, "1 dakikadan uzun" is over 1. Also "en fazla 2 dakika" (at most),
    "en az 90 saniye" (at least), "1-2 dakika", a bare "3 dakikalık" (a window
    up to 3 min, like the English bare target), and "kısa" / "uzun".
    """
    q = query_lower
    out: Dict[str, int] = {}

    for unit, is_min in ((_DK, True), (_SN, False)):
        m = re.search(_NUM + r"\s*" + unit + r"\w*\s+(?:altı|altında)", q) or re.search(
            _NUM + r"\s*" + unit + r"(?:dan|den|tan|ten)\s+(?:kısa|az)", q
        ) or re.search(r"\ben\s+(?:fazla|çok)\s+" + _NUM + r"\s*" + unit, q)
        if m and "max_duration" not in out:
            out["max_duration"] = _secs(m.group(1), is_min)

        m = re.search(_NUM + r"\s*" + unit + r"(?:dan|den|tan|ten)\s+(?:uzun|fazla)", q) or re.search(
            r"\ben\s+az\s+" + _NUM + r"\s*" + unit, q
        ) or re.search(_NUM + r"\s*" + unit + r"\w*\s+(?:üstü|üzeri)", q)
        if m and "min_duration" not in out:
            out["min_duration"] = _secs(m.group(1), is_min)

    if out:
        return out

    rng = re.search(_NUM + r"\s*(?:-|–|ile)\s*" + _NUM + r"\s*" + _DK, q)
    if rng:
        lo, hi = _secs(rng.group(1), True), _secs(rng.group(2), True)
        return {"min_duration": min(lo, hi), "max_duration": max(lo, hi)}

    target = re.search(_NUM + r"\s*" + _DK, q)
    if target:
        secs = _secs(target.group(1), True)
        return {"min_duration": round(secs * 0.5), "max_duration": secs}

    sec = re.search(_NUM + r"\s*" + _SN, q)
    if sec:
        return {"max_duration": _secs(sec.group(1), False)}

    if re.search(r"(?<!\w)kısa(?!\w)", q):
        return {"max_duration": 90}
    if re.search(r"(?<!\w)uzun(?!\w)", q):
        return {"min_duration": 180}
    return {}


def tr_age_range(query_lower: str) -> Optional[str]:
    """Decades and ages: "20'li yaşlar", "30lu", "25 yaşında", "18 yaş altı"."""
    q = query_lower
    # The lookahead keeps English out: "a 10 line speech" is not "10'lu".
    m = re.search(r"\b([1-6])0\s*['’]?\s*l[ıiuü](?![a-zçğıöşü])", q)
    if m:
        decade = int(m.group(1))
        return {1: "teens", 2: "20s", 3: "30s", 4: "40s", 5: "50s", 6: "60+"}[decade]

    m = re.search(r"\b(\d{1,2})\s*yaş(?:ın|in)?\s+(?:altı|altında)", q)
    if m:
        age = int(m.group(1))
        return "teens" if age <= 20 else "20s" if age <= 30 else "30s" if age <= 40 else "40s" if age <= 50 else "50s" if age <= 60 else "60+"

    m = re.search(r"\b(\d{1,2})\s*yaş(?:ında|larında|ındaki|lık)\b", q)
    if m:
        age = int(m.group(1))
        return "teens" if age < 20 else "20s" if age < 30 else "30s" if age < 40 else "40s" if age < 50 else "50s" if age < 60 else "60+"

    if "orta yaş" in q:
        return "40s"
    return None
