# ScenePartner v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the rehearsal loop so the browser runs the whole scene on one audio clock, the server only caches partner audio and keeps an event journal, and nothing crosses the wire between one line and the next.

**Architecture:** Partner lines are synthesised once per unique `(vendor, voice, direction, text)` into a private Supabase bucket and fetched + decoded before they are needed. A pure TypeScript engine (`lib/rehearsal/engine.ts`) owns turn state and schedules every handover on `AudioContext.currentTime`; React only renders its snapshots. A run is an append-only journal (`rehearsal_runs` + `rehearsal_events`) flushed fire-and-forget; every read (resume, stats, trial rule) is derived from it.

**Tech Stack:** FastAPI + SQLAlchemy + Postgres (Supabase) on Render; Supabase Storage; OpenAI `gpt-4o-mini-tts` (default vendor) with ElevenLabs behind the same interface; OpenAI `gpt-live-transcribe` over WebRTC (kept); Next.js App Router, React, TypeScript, Tailwind v4, framer-motion, vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-scenepartner-v2-design.md`. Read it first.

**Conventions you must follow**
- Backend tests: `cd backend && .venv/bin/python -m pytest tests/<file> -q`. DB tests use `tests/dbfixture.py` (`memory_db(models)` → `(db, saved)`, and `restore(saved)` in `tearDown`). Look at `tests/test_trial_length.py` for the pattern.
- Frontend tests: `npm test -- lib/rehearsal` (vitest). Pure modules only; no DOM.
- Commit after every task. Commit messages: one plain sentence about what changed, then the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. No PRs (solo dev); work on branch `feat/scenepartner-v2`.
- No em dashes in user-facing copy. First person singular is for emails only; UI copy is plain.
- Never add a Web Speech / `SpeechRecognition` fallback. Never add a spinner.
- Brand colour is never hardcoded; use the `--t-*` tokens.

---

## File map

**Backend (create)**
- `backend/scripts/add_rehearsal_v2_tables.py` — migration (3 tables)
- `backend/app/models/rehearsal.py` — `PartnerAudio`, `RehearsalRun`, `RehearsalEvent`
- `backend/app/services/rehearsal/__init__.py`
- `backend/app/services/rehearsal/contract.py` — `RehearsalLine`, `lines_for(db, scene_id)`, `partner_characters`
- `backend/app/services/rehearsal/voices.py` — the voice list, defaults per character
- `backend/app/services/rehearsal/synth.py` — `synthesize(vendor, voice, text, direction) -> bytes`
- `backend/app/services/rehearsal/partner_audio.py` — key, ensure rows, worker, signed URLs
- `backend/app/services/rehearsal/journal.py` — runs, events, derived reads
- `backend/app/services/rehearsal/access.py` — the Plus gate moved out of `scenes.py`
- `backend/app/api/rehearsal.py` — the router
- `backend/scripts/warm_partner_audio.py` — pre-synthesise library scenes
- `backend/scripts/bench_tts.py` — the vendor benchmark
- `backend/tests/test_rehearsal_v2_*.py`

**Backend (modify)**
- `backend/app/main.py` — register router
- `backend/app/core/config.py` — `elevenlabs_api_key`, `partner_tts_vendor`, `partner_audio_bucket`
- `backend/app/services/trial_length.py` — journal + old rows
- `backend/app/api/scenes.py` — delete `/rehearse/*`, `/{id}/resumable-session`, LangGraph import
- `backend/app/api/admin_sessions.py` — regenerate endpoint (small addition)

**Frontend (create)**
- `lib/rehearsal/contract.ts`, `script.ts`, `voices.ts`, `timeline.ts`, `journal.ts`, `engine.ts` + `*.test.ts`
- `lib/rehearsal/browser/audio-player.ts`, `line-loader.ts`, `gestures.ts`
- `hooks/useRehearsal.ts`
- `app/(platform)/scenes/[id]/rehearse/{page,RehearseScreen,Curtain,Stage,Line,PauseSheet,Ending,FirstRunHint}.tsx`

**Frontend (modify / delete)**
- `hooks/useLiveTranscription.ts` — `prime()` split out of `beginTurn`
- `app/globals.css` — replace the `.theatre-rehearsal` block
- `components/practice/GuidedInvitation.tsx`, `app/(platform)/practice/[id]/scenes/[sceneId]/page.tsx`, `components/practice/WhatsNext.tsx`, `components/rehearse/ColdReadPrep.tsx`, `components/scenepartner/ScenePreviewTooltip.tsx`, `components/practice/PracticeScenePanel.tsx`, `app/(platform)/scenes/[id]/memorize/page.tsx` — links go to `/scenes/{id}/rehearse` with no `session=` param
- Delete: old `rehearse/page.tsx` (3,654 lines), `hooks/useOpenAITTS.ts`, `hooks/useSpeechRecognition.ts`, `lib/scene-voice.ts` + test (after grepping for other users)

---

## Phase 0: branch and benchmark

### Task 0: Branch

- [ ] **Step 1:** `cd /Users/canberkvarli/Development/actorrise && git checkout -b feat/scenepartner-v2`

### Task 1: TTS vendor benchmark (Canberk listens, then picks)

**Files:**
- Create: `backend/scripts/bench_tts.py`
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Add settings**

In `backend/app/core/config.py`, next to `openai_api_key` (line ~55), add:

```python
    elevenlabs_api_key: str | None = os.getenv("ELEVENLABS_API_KEY")
    # "openai" (gpt-4o-mini-tts) or "elevenlabs". Decided by scripts/bench_tts.py.
    partner_tts_vendor: str = os.getenv("PARTNER_TTS_VENDOR", "openai")
    partner_audio_bucket: str = os.getenv("PARTNER_AUDIO_BUCKET", "partner-lines")
```

- [ ] **Step 2: Write the benchmark script**

`backend/scripts/bench_tts.py`:

```python
#!/usr/bin/env python
"""Four lines through both vendors, into outputs/bench_tts/, for Canberk to hear.

Usage:
    cd backend && OPENAI_API_KEY=... ELEVENLABS_API_KEY=... uv run python scripts/bench_tts.py

Prices to check by hand before deciding (October 2026):
  gpt-4o-mini-tts  https://openai.com/api/pricing       (per 1M chars)
  ElevenLabs v3    https://elevenlabs.io/pricing         (per 1k chars, plan-dependent)
Print the per-line character counts so the per-scene cost can be worked out.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.rehearsal.synth import synthesize  # noqa: E402

LINES = [
    ("short", "Get out.", None),
    ("name", "Anita, I told you twice. The Fergusons are not coming.", None),
    ("directed", "I never wanted any of this.", "whispering"),
    ("long", " ".join([
        "You think I don't know what you did? I was there. I stood in that hallway",
        "for an hour listening to you lie to her, and every word of it was a word",
        "you had already said to me, in this kitchen, the night we buried him.",
        "You don't get to come here and ask me to be kind. Kindness is what I had",
        "before you taught me what it costs. So no. I won't sit down. I won't lower",
        "my voice. I will stand here until you say it, out loud, in front of me,",
        "the way you should have said it twenty years ago, and then I will leave",
        "and you will never see me again. Say it. Say what you did. Say it now.",
    ]), None),
]

VOICES = {"openai": "coral", "elevenlabs": "Rachel"}

out = backend_dir.parent / "outputs" / "bench_tts"
out.mkdir(parents=True, exist_ok=True)

for vendor, voice in VOICES.items():
    for name, text, direction in LINES:
        t0 = time.perf_counter()
        try:
            audio = synthesize(vendor, voice, text, direction)
        except Exception as exc:  # noqa: BLE001
            print(f"{vendor:10} {name:9} FAILED {exc}")
            continue
        dt = time.perf_counter() - t0
        path = out / f"{vendor}-{name}.mp3"
        path.write_bytes(audio)
        print(f"{vendor:10} {name:9} {len(text):4d} chars  {dt:5.2f}s  {len(audio):7d} bytes  {path.name}")
```

This script depends on Task 5 (`synth.py`). Run it after Task 5 and hand `outputs/bench_tts/*.mp3` to Canberk. Until he picks, `PARTNER_TTS_VENDOR` stays `openai`.

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/config.py backend/scripts/bench_tts.py
git commit -m "Partner audio settings and the TTS vendor benchmark script"
```

---

## Phase 1: Backend

### Task 2: Migration and models

**Files:**
- Create: `backend/scripts/add_rehearsal_v2_tables.py`
- Create: `backend/app/models/rehearsal.py`
- Test: `backend/tests/test_rehearsal_v2_models.py`

- [ ] **Step 1: Write the failing test**

```python
"""The v2 rehearsal tables stand up in the test database."""
import unittest

from app.models.actor import Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import PartnerAudio, RehearsalEvent, RehearsalRun
from app.models.user import User
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent, PartnerAudio)


class Models(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)

    def tearDown(self):
        self.db.close()
        restore(self._saved)

    def test_event_seq_is_unique_per_run(self):
        user = User(email="a@example.com", supabase_id="s1")
        play = Play(title="P", author="A", source_type="play")
        self.db.add_all([user, play]); self.db.flush()
        scene = Scene(play_id=play.id, title="S", character_1_name="A", character_2_name="B", line_count=0, estimated_duration_seconds=0)
        self.db.add(scene); self.db.flush()
        run = RehearsalRun(user_id=user.id, scene_id=scene.id, character="A", voices={}, is_guided=False)
        self.db.add(run); self.db.flush()
        self.db.add(RehearsalEvent(run_id=run.id, seq=0, type="started", line_index=None, at_ms=0, payload={}))
        self.db.flush()
        self.db.add(RehearsalEvent(run_id=run.id, seq=0, type="started", line_index=None, at_ms=0, payload={}))
        with self.assertRaises(Exception):
            self.db.flush()
```

- [ ] **Step 2: Run it**

`cd backend && .venv/bin/python -m pytest tests/test_rehearsal_v2_models.py -q` → fails: `No module named 'app.models.rehearsal'`.

- [ ] **Step 3: Models**

`backend/app/models/rehearsal.py`:

```python
"""ScenePartner v2: the partner-audio cache and the rehearsal journal.

A run is append-only. Nothing here is a counter; every number a screen shows
is derived from the events (see services/rehearsal/journal.py). That is the
lesson of RehearsalSession, whose hand-kept counters never once agreed.
"""
from sqlalchemy import (JSON, Boolean, Column, DateTime, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy import text as sql_text
from sqlalchemy.orm import relationship

from app.core.database import Base


class PartnerAudio(Base):
    """One synthesised partner line, keyed by what was said and who said it,
    never by scene, so a line shared by two scenes is one file."""
    __tablename__ = "partner_audio"

    key = Column(String(64), primary_key=True)  # sha256 hex, see partner_audio.audio_key
    vendor = Column(String(16), nullable=False)
    voice = Column(String(64), nullable=False)
    storage_path = Column(String(128), nullable=True)
    status = Column(String(8), nullable=False, server_default="pending")  # pending | ready | failed
    error = Column(Text, nullable=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))


class RehearsalRun(Base):
    __tablename__ = "rehearsal_runs"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False, index=True)
    character = Column(String, nullable=False)  # the actor's part
    voices = Column(JSON, nullable=False, default=dict)  # {character: voice}
    is_guided = Column(Boolean, nullable=False, default=False)
    started_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    events = relationship("RehearsalEvent", back_populates="run", cascade="all, delete-orphan")


class RehearsalEvent(Base):
    __tablename__ = "rehearsal_events"
    __table_args__ = (UniqueConstraint("run_id", "seq", name="uq_rehearsal_event_seq"),)

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("rehearsal_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    seq = Column(Integer, nullable=False)
    type = Column(String(24), nullable=False)
    line_index = Column(Integer, nullable=True)
    at_ms = Column(Integer, nullable=False)  # audio-clock ms since the run began
    payload = Column(JSON, nullable=False, default=dict)
    received_at = Column(DateTime(timezone=True), server_default=sql_text("now()"))

    run = relationship("RehearsalRun", back_populates="events")


EVENT_TYPES = frozenset({
    "started", "line_reached", "actor_line_read", "partner_line_played",
    "paused", "resumed", "jumped", "completed", "abandoned",
})
```

Also import the module in `backend/app/models/__init__.py` the way the other model modules are (open it and add `from app.models.rehearsal import PartnerAudio, RehearsalEvent, RehearsalRun  # noqa: F401` beside the others).

- [ ] **Step 4: Migration script**

`backend/scripts/add_rehearsal_v2_tables.py`:

```python
#!/usr/bin/env python
"""Migration: ScenePartner v2 tables (partner_audio, rehearsal_runs, rehearsal_events).

Usage:
    cd backend && uv run python scripts/add_rehearsal_v2_tables.py
"""
from __future__ import annotations

import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import text

from app.core.database import engine

STATEMENTS = [
    text("""
        CREATE TABLE IF NOT EXISTS partner_audio (
            key VARCHAR(64) PRIMARY KEY,
            vendor VARCHAR(16) NOT NULL,
            voice VARCHAR(64) NOT NULL,
            storage_path VARCHAR(128),
            status VARCHAR(8) NOT NULL DEFAULT 'pending',
            error TEXT,
            claimed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """),
    text("""
        CREATE TABLE IF NOT EXISTS rehearsal_runs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
            character VARCHAR NOT NULL,
            voices JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_guided BOOLEAN NOT NULL DEFAULT FALSE,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """),
    text("CREATE INDEX IF NOT EXISTS ix_rehearsal_runs_user_scene ON rehearsal_runs (user_id, scene_id, started_at DESC)"),
    text("""
        CREATE TABLE IF NOT EXISTS rehearsal_events (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES rehearsal_runs(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            type VARCHAR(24) NOT NULL,
            line_index INTEGER,
            at_ms INTEGER NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_rehearsal_event_seq UNIQUE (run_id, seq)
        )
    """),
    text("CREATE INDEX IF NOT EXISTS ix_rehearsal_events_run ON rehearsal_events (run_id)"),
    # Enable RLS like every other table (see docs: RLS lockdown 2026-08-23). The
    # backend connects with the service role, which bypasses it.
    text("ALTER TABLE partner_audio ENABLE ROW LEVEL SECURITY"),
    text("ALTER TABLE rehearsal_runs ENABLE ROW LEVEL SECURITY"),
    text("ALTER TABLE rehearsal_events ENABLE ROW LEVEL SECURITY"),
]

if __name__ == "__main__":
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(stmt)
    print("ok: partner_audio, rehearsal_runs, rehearsal_events")
```

- [ ] **Step 5: Run the test** → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/rehearsal.py backend/app/models/__init__.py backend/scripts/add_rehearsal_v2_tables.py backend/tests/test_rehearsal_v2_models.py
git commit -m "ScenePartner v2 tables: the partner audio cache and the run journal"
```

### Task 3: The line contract

**Files:**
- Create: `backend/app/services/rehearsal/__init__.py` (empty)
- Create: `backend/app/services/rehearsal/contract.py`
- Test: `backend/tests/test_rehearsal_v2_contract.py`

- [ ] **Step 1: Failing test**

```python
"""The shape rehearsal reads from the extractor, and nothing more."""
import unittest

from app.models.actor import Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.user import User
from app.services.rehearsal.contract import RehearsalLine, lines_for, partner_characters
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, Play, UserScript, Scene, SceneLine)


class Contract(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        play = Play(title="P", author="A", source_type="play")
        self.db.add(play); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", character_1_name="ANNA", character_2_name="BEN",
                           line_count=3, estimated_duration_seconds=60)
        self.db.add(self.scene); self.db.flush()
        for i, (who, text, sd) in enumerate([
            ("BEN", "Where were you?", None),
            ("ANNA", "Out.", "(not looking at him)"),
            ("MAID", "Dinner, madam.", None),
        ]):
            self.db.add(SceneLine(scene_id=self.scene.id, line_order=i, character_name=who, text=text,
                                  stage_direction=sd, word_count=len(text.split())))
        self.db.flush()

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def test_lines_in_order_with_only_contract_fields(self):
        lines = lines_for(self.db, self.scene.id)
        self.assertEqual([l.index for l in lines], [0, 1, 2])
        self.assertEqual(lines[1], RehearsalLine(index=1, character="ANNA", text="Out.", direction="(not looking at him)"))
        self.assertIsNone(lines[0].direction)

    def test_partner_characters_is_everyone_but_the_actor(self):
        lines = lines_for(self.db, self.scene.id)
        self.assertEqual(partner_characters(lines, "ANNA"), ["BEN", "MAID"])
        self.assertEqual(partner_characters(lines, "anna"), ["BEN", "MAID"])
```

- [ ] **Step 2: Run** → `No module named 'app.services.rehearsal'`.

- [ ] **Step 3: Implement**

`backend/app/services/rehearsal/contract.py`:

```python
"""What rehearsal reads from the extractor. Four fields, in order, and no more.

The extractor (services/extraction, scene_map, script_structure) is a separate
subsystem and is not touched by v2. If rehearsal ever needs a field it does not
produce (character gender for third parts, say), that is a request to it, not
a reach into it.
"""
from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.actor import SceneLine


class RehearsalLine(BaseModel):
    index: int
    character: str
    text: str
    direction: str | None = None


def lines_for(db: Session, scene_id: int) -> list[RehearsalLine]:
    rows = (
        db.query(SceneLine)
        .filter(SceneLine.scene_id == scene_id)
        .order_by(SceneLine.line_order)
        .all()
    )
    return [
        RehearsalLine(index=i, character=r.character_name.strip(), text=r.text,
                      direction=(r.stage_direction or None))
        for i, r in enumerate(rows)
    ]


def same_character(a: str, b: str) -> bool:
    return a.strip().casefold() == b.strip().casefold()


def partner_characters(lines: list[RehearsalLine], actor: str) -> list[str]:
    """Everyone who is not the actor, in order of first appearance. The partner
    reads them all (decision 10)."""
    seen: list[str] = []
    for line in lines:
        if same_character(line.character, actor):
            continue
        if not any(same_character(line.character, s) for s in seen):
            seen.append(line.character)
    return seen
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git add backend/app/services/rehearsal backend/tests/test_rehearsal_v2_contract.py && git commit -m "The rehearsal line contract: four fields read from the extractor"`.

### Task 4: Voices

**Files:**
- Create: `backend/app/services/rehearsal/voices.py`
- Test: `backend/tests/test_rehearsal_v2_voices.py`

- [ ] **Step 1: Failing test**

```python
import unittest
from types import SimpleNamespace

from app.services.rehearsal.contract import RehearsalLine
from app.services.rehearsal.voices import VOICES, default_voices


def _scene(g1=None, g2=None):
    return SimpleNamespace(character_1_name="ANNA", character_2_name="BEN", character_1_gender=g1, character_2_gender=g2)


LINES = [RehearsalLine(index=0, character="BEN", text="Hi"), RehearsalLine(index=1, character="ANNA", text="Hi"),
         RehearsalLine(index=2, character="MAID", text="Dinner")]


class Voices(unittest.TestCase):
    def test_four_voices_two_of_each(self):
        self.assertEqual(len(VOICES), 4)
        self.assertEqual(sorted(v.gender for v in VOICES), ["female", "female", "male", "male"])

    def test_gender_from_scene_picks_first_voice_of_that_gender(self):
        v = default_voices(_scene("female", "male"), LINES, actor="ANNA")
        self.assertEqual(v["BEN"], next(x.id for x in VOICES if x.gender == "male"))

    def test_unknown_gender_alternates_and_never_repeats_within_a_scene(self):
        v = default_voices(_scene(), LINES, actor="ANNA")
        self.assertEqual(set(v), {"BEN", "MAID"})
        self.assertNotEqual(v["BEN"], v["MAID"])

    def test_actor_gets_no_voice(self):
        self.assertNotIn("ANNA", default_voices(_scene(), LINES, actor="ANNA"))
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

```python
"""The short voice list (decision 3) and the default per character.

Scene already carries character_1_gender / character_2_gender from the
extractor; a third part has none and takes the next unused voice.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings
from app.services.rehearsal.contract import RehearsalLine, partner_characters, same_character


@dataclass(frozen=True)
class Voice:
    id: str
    label: str
    gender: str  # "female" | "male"
    vendor: str


_OPENAI = [
    Voice("coral", "Coral", "female", "openai"),
    Voice("ash", "Ash", "male", "openai"),
    Voice("sage", "Sage", "female", "openai"),
    Voice("echo", "Echo", "male", "openai"),
]
# Filled in after scripts/bench_tts.py; ids are ElevenLabs voice ids.
_ELEVENLABS = [
    Voice("21m00Tcm4TlvDq8ikWAM", "Rachel", "female", "elevenlabs"),
    Voice("TxGEqnHWrfWFTfGW9XjX", "Josh", "male", "elevenlabs"),
    Voice("EXAVITQu4vr4xnSDxMaL", "Bella", "female", "elevenlabs"),
    Voice("VR6AewLTigWG4xSOukaG", "Arnold", "male", "elevenlabs"),
]

VOICES: list[Voice] = _ELEVENLABS if settings.partner_tts_vendor == "elevenlabs" else _OPENAI


def voice_by_id(voice_id: str) -> Voice | None:
    return next((v for v in VOICES if v.id == voice_id), None)


def _gender_of(scene, name: str) -> str | None:
    if same_character(name, scene.character_1_name or ""):
        return (scene.character_1_gender or "").lower() or None
    if same_character(name, scene.character_2_name or ""):
        return (scene.character_2_gender or "").lower() or None
    return None


def default_voices(scene, lines: list[RehearsalLine], actor: str) -> dict[str, str]:
    """{partner character: voice id}. A known gender takes the first unused
    voice of that gender; unknown alternates. No two parts share a voice while
    the list lasts."""
    used: set[str] = set()
    out: dict[str, str] = {}
    toggle = ["female", "male"]
    for i, name in enumerate(partner_characters(lines, actor)):
        gender = _gender_of(scene, name)
        if gender not in ("female", "male"):
            gender = toggle[i % 2]
        pick = next((v for v in VOICES if v.gender == gender and v.id not in used), None) \
            or next((v for v in VOICES if v.id not in used), None) or VOICES[0]
        used.add(pick.id)
        out[name] = pick.id
    return out
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"Partner voices: a list of four and a default per character"`.

### Task 5: Synthesis behind one function

**Files:**
- Create: `backend/app/services/rehearsal/synth.py`
- Test: `backend/tests/test_rehearsal_v2_synth.py`

- [ ] **Step 1: Failing test**

```python
import unittest
from unittest import mock

from app.services.rehearsal import synth


class Synth(unittest.TestCase):
    def test_openai_passes_direction_as_instructions(self):
        with mock.patch.object(synth, "_openai_tts") as tts:
            tts.return_value.synthesize_speech.return_value = b"mp3"
            out = synth.synthesize("openai", "coral", "Out.", "(not looking at him)")
        self.assertEqual(out, b"mp3")
        tts.return_value.synthesize_speech.assert_called_once_with(
            "Out.", voice="coral", instructions="Deliver this line not looking at him.", response_format="mp3")

    def test_openai_neutral_without_direction(self):
        with mock.patch.object(synth, "_openai_tts") as tts:
            tts.return_value.synthesize_speech.return_value = b"x"
            synth.synthesize("openai", "coral", "Out.", None)
        self.assertEqual(tts.return_value.synthesize_speech.call_args.kwargs["instructions"], "")

    def test_elevenlabs_prefixes_direction_tag(self):
        with mock.patch.object(synth.httpx, "post") as post:
            post.return_value.status_code = 200
            post.return_value.content = b"mp3"
            synth.synthesize("elevenlabs", "vid", "Out.", "(whispering)")
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["text"], "[whispering] Out.")

    def test_unknown_vendor(self):
        with self.assertRaises(ValueError):
            synth.synthesize("nope", "v", "t", None)
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

```python
"""One function, two vendors. Quality per line is what is being bought; latency
is not, because every line is synthesised ahead of time and cached."""
from __future__ import annotations

import re

import httpx

from app.core.config import settings


def _clean_direction(direction: str | None) -> str:
    if not direction:
        return ""
    return re.sub(r"^[\[\(]|[\]\)]$", "", direction.strip()).strip()


def _openai_tts():
    from app.services.tts_service import TTSService
    return TTSService()


def _openai(voice: str, text: str, direction: str | None) -> bytes:
    d = _clean_direction(direction)
    instructions = f"Deliver this line {d}." if d else ""
    return _openai_tts().synthesize_speech(text, voice=voice, instructions=instructions, response_format="mp3")


def _elevenlabs(voice: str, text: str, direction: str | None) -> bytes:
    if not settings.elevenlabs_api_key:
        raise ValueError("ELEVENLABS_API_KEY is not set")
    d = _clean_direction(direction)
    spoken = f"[{d}] {text}" if d else text
    res = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
        params={"output_format": "mp3_44100_64"},
        headers={"xi-api-key": settings.elevenlabs_api_key},
        json={"text": spoken, "model_id": "eleven_v3"},
        timeout=60,
    )
    if res.status_code != 200:
        raise RuntimeError(f"ElevenLabs {res.status_code}: {res.text[:200]}")
    return res.content


def synthesize(vendor: str, voice: str, text: str, direction: str | None) -> bytes:
    if vendor == "openai":
        return _openai(voice, text, direction)
    if vendor == "elevenlabs":
        return _elevenlabs(voice, text, direction)
    raise ValueError(f"unknown TTS vendor {vendor!r}")
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"synthesize(): one function over gpt-4o-mini-tts and ElevenLabs"`.

- [ ] **Step 6: Run the benchmark now** (`uv run python scripts/bench_tts.py` with both keys) and tell Canberk where the files are. Do not block on his answer.

### Task 6: The partner audio cache

**Files:**
- Create: `backend/app/services/rehearsal/partner_audio.py`
- Test: `backend/tests/test_rehearsal_v2_partner_audio.py`

- [ ] **Step 1: Failing test**

```python
"""Keyed by what is said, synthesised once, claimed so two openers do not race."""
import unittest
from unittest import mock

from app.models.rehearsal import PartnerAudio
from app.services.rehearsal import partner_audio as pa
from tests.dbfixture import memory_db, restore


class Key(unittest.TestCase):
    def test_key_ignores_whitespace_and_case_of_nothing_else(self):
        a = pa.audio_key("openai", "coral", None, "Out.  ")
        b = pa.audio_key("openai", "coral", None, "Out.")
        c = pa.audio_key("openai", "coral", "(quiet)", "Out.")
        self.assertEqual(a, b); self.assertNotEqual(a, c); self.assertEqual(len(a), 64)


class Cache(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db((PartnerAudio,))

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def test_ensure_creates_pending_once(self):
        k1 = pa.ensure(self.db, "openai", "coral", None, "Out.")
        k2 = pa.ensure(self.db, "openai", "coral", None, "Out.")
        self.assertEqual(k1, k2)
        self.assertEqual(self.db.query(PartnerAudio).count(), 1)

    def test_worker_synthesises_uploads_and_marks_ready(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        with mock.patch.object(pa, "synthesize", return_value=b"mp3") as syn, \
             mock.patch.object(pa, "_upload") as up:
            pa.synthesise_pending(self.db, [key], text_for={key: ("Out.", None)})
        syn.assert_called_once_with("openai", "coral", "Out.", None)
        up.assert_called_once()
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "ready")
        self.assertEqual(row.storage_path, f"{key[:2]}/{key}.mp3")

    def test_claimed_row_is_skipped_by_a_second_worker(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        self.assertTrue(pa._claim(self.db, key))
        self.assertFalse(pa._claim(self.db, key))

    def test_failure_is_recorded_and_row_released(self):
        key = pa.ensure(self.db, "openai", "coral", None, "Out.")
        with mock.patch.object(pa, "synthesize", side_effect=RuntimeError("boom")):
            pa.synthesise_pending(self.db, [key], text_for={key: ("Out.", None)})
        row = self.db.get(PartnerAudio, key)
        self.assertEqual(row.status, "failed"); self.assertIn("boom", row.error)
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

```python
"""The permanent partner-line cache.

Library scenes are public domain and shared by every actor, so the second
actor to run a scene pays nothing and waits for nothing. Only a user upload on
its very first run is cold, and the client hides that by fetching N+1 while N
plays.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.rehearsal import PartnerAudio
from app.services.rehearsal.synth import synthesize
from app.services.storage import get_supabase_client

logger = logging.getLogger(__name__)

SIGNED_URL_SECONDS = 6 * 3600
# A claim older than this is a worker that died mid-line; the row is retaken.
STALE_CLAIM = timedelta(minutes=5)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def audio_key(vendor: str, voice: str, direction: str | None, text: str) -> str:
    raw = "|".join([vendor, voice, _norm(direction or ""), _norm(text)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def storage_path(key: str) -> str:
    return f"{key[:2]}/{key}.mp3"


def ensure(db: Session, vendor: str, voice: str, direction: str | None, text: str) -> str:
    """Make sure a row exists for this line. Returns the key. Does not synthesise."""
    key = audio_key(vendor, voice, direction, text)
    if db.get(PartnerAudio, key) is None:
        db.add(PartnerAudio(key=key, vendor=vendor, voice=voice, status="pending"))
        db.flush()
    return key


def _claim(db: Session, key: str) -> bool:
    now = datetime.now(timezone.utc)
    row = db.get(PartnerAudio, key)
    if row is None or row.status == "ready":
        return False
    if row.claimed_at is not None:
        claimed = row.claimed_at if row.claimed_at.tzinfo else row.claimed_at.replace(tzinfo=timezone.utc)
        if now - claimed < STALE_CLAIM:
            return False
    row.claimed_at = now
    row.status = "pending"
    row.error = None
    db.commit()
    return True


def _upload(path: str, audio: bytes) -> None:
    client = get_supabase_client()
    if client is None:
        raise RuntimeError("Supabase storage is not configured")
    client.storage.from_(settings.partner_audio_bucket).upload(
        path, audio, file_options={"content-type": "audio/mpeg", "upsert": "true"},
    )


def synthesise_pending(db: Session, keys: list[str], text_for: dict[str, tuple[str, str | None]]) -> None:
    """Synthesise each key in order. `text_for` maps key -> (text, direction).
    Safe to call from several workers at once: a row is claimed before work."""
    for key in keys:
        if not _claim(db, key):
            continue
        row = db.get(PartnerAudio, key)
        text, direction = text_for[key]
        try:
            audio = synthesize(row.vendor, row.voice, text, direction)
            path = storage_path(key)
            _upload(path, audio)
            row.storage_path = path
            row.status = "ready"
            row.error = None
        except Exception as exc:  # noqa: BLE001
            logger.warning("partner audio %s failed: %s", key[:8], exc)
            row.status = "failed"
            row.error = str(exc)[:500]
        row.claimed_at = None
        db.commit()


def signed_url(path: str) -> str | None:
    client = get_supabase_client()
    if client is None:
        return None
    res = client.storage.from_(settings.partner_audio_bucket).create_signed_url(path, SIGNED_URL_SECONDS)
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl")
    return None


def delete_row(db: Session, key: str) -> None:
    row = db.get(PartnerAudio, key)
    if row is None:
        return
    if row.storage_path:
        client = get_supabase_client()
        if client is not None:
            try:
                client.storage.from_(settings.partner_audio_bucket).remove([row.storage_path])
            except Exception as exc:  # noqa: BLE001
                logger.warning("could not remove %s: %s", row.storage_path, exc)
    db.delete(row)
    db.commit()
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"The partner audio cache: keyed by the line, claimed before synthesis"`.

### Task 7: The journal

**Files:**
- Create: `backend/app/services/rehearsal/journal.py`
- Test: `backend/tests/test_rehearsal_v2_journal.py`

- [ ] **Step 1: Failing test**

```python
"""Append-only events; every number is derived."""
import unittest

from app.models.actor import Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.rehearsal import journal
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent)


def ev(seq, type, line_index=None, at_ms=0, **payload):
    return {"seq": seq, "type": type, "line_index": line_index, "at_ms": at_ms, "payload": payload}


class Journal(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="a@example.com", supabase_id="s1")
        play = Play(title="P", author="A", source_type="play")
        self.db.add_all([self.user, play]); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", character_1_name="A", character_2_name="B", line_count=4, estimated_duration_seconds=0)
        self.db.add(self.scene); self.db.flush()

    def tearDown(self):
        self.db.close(); restore(self._saved)

    def start(self, **kw):
        return journal.create_run(self.db, self.user.id, self.scene.id, character="A", voices={"B": "ash"}, **kw)

    def test_append_is_idempotent(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0)])
        journal.append(self.db, run.id, self.user.id, [ev(1, "line_reached", 0), ev(2, "line_reached", 1)])
        self.assertEqual(self.db.query(RehearsalEvent).filter_by(run_id=run.id).count(), 3)

    def test_append_refuses_another_users_run(self):
        run = self.start()
        with self.assertRaises(PermissionError):
            journal.append(self.db, run.id, self.user.id + 1, [ev(0, "started")])

    def test_unknown_type_is_dropped_not_fatal(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "dance")])
        self.assertEqual(self.db.query(RehearsalEvent).count(), 1)

    def test_furthest_and_finished(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0), ev(2, "line_reached", 3)])
        self.assertEqual(journal.furthest_line(self.db, run.id), 3)
        self.assertFalse(journal.is_finished(self.db, run.id))
        journal.append(self.db, run.id, self.user.id, [ev(3, "completed", 3)])
        self.assertTrue(journal.is_finished(self.db, run.id))
        self.assertTrue(journal.user_has_finished_a_scene(self.db, self.user.id))

    def test_resumable_is_an_open_run_past_line_zero(self):
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0)])
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))
        journal.append(self.db, run.id, self.user.id, [ev(2, "line_reached", 2)])
        self.assertEqual(journal.resumable(self.db, self.user.id, self.scene.id), {"run_id": run.id, "line_index": 2})
        journal.append(self.db, run.id, self.user.id, [ev(3, "abandoned", 2)])
        self.assertIsNone(journal.resumable(self.db, self.user.id, self.scene.id))

    def test_summary_for_sessions_list(self):
        run = self.start()
        journal.append(self.db, run.id, self.user.id, [ev(0, "started"), ev(1, "line_reached", 0),
                                                     ev(2, "actor_line_read", 0, 900, handover_ms=31), ev(3, "completed", 3, 5000)])
        s = journal.summaries(self.db, self.user.id)[0]
        self.assertEqual((s["run_id"], s["scene_id"], s["finished"], s["furthest_line"], s["duration_ms"]), (run.id, self.scene.id, True, 3, 5000))
        self.assertEqual(s["median_handover_ms"], 31)
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

```python
"""The run journal. Writes are appends; reads are queries. No counters.

Idempotency is the (run_id, seq) unique constraint: the client numbers every
event once and may send a batch twice (a retry, a sendBeacon on top of a fetch),
and the second copy is a no-op.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.rehearsal import EVENT_TYPES, RehearsalEvent, RehearsalRun

RESUME_WINDOW = timedelta(hours=24)


def create_run(db: Session, user_id: int, scene_id: int, character: str, voices: dict, is_guided: bool = False) -> RehearsalRun:
    run = RehearsalRun(user_id=user_id, scene_id=scene_id, character=character, voices=voices, is_guided=is_guided)
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _insert_ignore(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    dialect = db.bind.dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    stmt = insert(RehearsalEvent).values(rows).on_conflict_do_nothing(index_elements=["run_id", "seq"])
    db.execute(stmt)


def append(db: Session, run_id: int, user_id: int, events: list[dict]) -> int:
    """Append a batch. Unknown types are dropped. Returns rows attempted."""
    run = db.get(RehearsalRun, run_id)
    if run is None or run.user_id != user_id:
        raise PermissionError("not your run")
    rows = []
    for e in events:
        if e.get("type") not in EVENT_TYPES or not isinstance(e.get("seq"), int):
            continue
        rows.append({
            "run_id": run_id,
            "seq": e["seq"],
            "type": e["type"],
            "line_index": e.get("line_index"),
            "at_ms": int(e.get("at_ms") or 0),
            "payload": e.get("payload") or {},
        })
    _insert_ignore(db, rows)
    db.commit()
    return len(rows)


def furthest_line(db: Session, run_id: int) -> int | None:
    return db.query(func.max(RehearsalEvent.line_index)).filter(
        RehearsalEvent.run_id == run_id, RehearsalEvent.type == "line_reached").scalar()


def _has(db: Session, run_id: int, *types: str) -> bool:
    return db.query(RehearsalEvent.id).filter(
        RehearsalEvent.run_id == run_id, RehearsalEvent.type.in_(types)).first() is not None


def is_finished(db: Session, run_id: int) -> bool:
    return _has(db, run_id, "completed")


def is_closed(db: Session, run_id: int) -> bool:
    return _has(db, run_id, "completed", "abandoned")


def user_has_finished_a_scene(db: Session, user_id: int) -> bool:
    return (
        db.query(RehearsalEvent.id)
        .join(RehearsalRun, RehearsalRun.id == RehearsalEvent.run_id)
        .filter(RehearsalRun.user_id == user_id, RehearsalEvent.type == "completed")
        .first() is not None
    )


def resumable(db: Session, user_id: int, scene_id: int) -> dict | None:
    since = datetime.now(timezone.utc) - RESUME_WINDOW
    run = (
        db.query(RehearsalRun)
        .filter(RehearsalRun.user_id == user_id, RehearsalRun.scene_id == scene_id)
        .order_by(RehearsalRun.started_at.desc(), RehearsalRun.id.desc())
        .first()
    )
    if run is None or is_closed(db, run.id):
        return None
    started = run.started_at
    if started is not None and started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if started is not None and started < since:
        return None
    line = furthest_line(db, run.id)
    if not line:  # None or 0: nothing worth resuming
        return None
    return {"run_id": run.id, "line_index": line}


def summaries(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    """One dict per run for the sessions list, newest first."""
    runs = (
        db.query(RehearsalRun).filter(RehearsalRun.user_id == user_id)
        .order_by(RehearsalRun.started_at.desc(), RehearsalRun.id.desc()).limit(limit).all()
    )
    out = []
    for run in runs:
        events = db.query(RehearsalEvent).filter(RehearsalEvent.run_id == run.id).order_by(RehearsalEvent.seq).all()
        handovers = [e.payload.get("handover_ms") for e in events
                     if e.type == "actor_line_read" and isinstance(e.payload.get("handover_ms"), (int, float))]
        reached = [e.line_index for e in events if e.type == "line_reached" and e.line_index is not None]
        out.append({
            "run_id": run.id,
            "scene_id": run.scene_id,
            "character": run.character,
            "is_guided": run.is_guided,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished": any(e.type == "completed" for e in events),
            "abandoned": any(e.type == "abandoned" for e in events),
            "furthest_line": max(reached) if reached else None,
            "duration_ms": max((e.at_ms for e in events), default=0),
            "lines_read": sum(1 for e in events if e.type == "actor_line_read"),
            "median_handover_ms": statistics.median(handovers) if handovers else None,
        })
    return out


def stats(db: Session, user_id: int) -> dict:
    rows = summaries(db, user_id, limit=1000)
    return {
        "runs": len(rows),
        "finished": sum(1 for r in rows if r["finished"]),
        "lines_read": sum(r["lines_read"] for r in rows),
        "scenes": len({r["scene_id"] for r in rows}),
    }
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"The rehearsal journal: appends, and every read derived from them"`.

### Task 8: The access gate, moved out of scenes.py

**Files:**
- Create: `backend/app/services/rehearsal/access.py`
- Modify: `backend/app/api/scenes.py` (import from the new module; keep behaviour)
- Test: `backend/tests/test_rehearsal_v2_access.py`

- [ ] **Step 1: Failing test**

```python
import unittest
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

from app.services.rehearsal import access


class Access(unittest.TestCase):
    def _check(self, benefits, scene, script=None, user_id=1):
        with mock.patch.object(access, "get_effective_benefits", return_value=benefits), \
             mock.patch.object(access, "_subscription", return_value=None):
            access.assert_can_rehearse(db=None, user=SimpleNamespace(id=user_id), scene=scene, script=script)

    def test_plus_can_rehearse_anything(self):
        self._check({"scene_partner_trial_only": False}, SimpleNamespace(is_library=True, title="X"))

    def test_free_starter_library_scene_allowed(self):
        title = next(iter(access.FREE_LIBRARY_SCENE_TITLES))
        self._check({"scene_partner_trial_only": True}, SimpleNamespace(is_library=True, title=title))

    def test_free_full_library_scene_refused(self):
        with self.assertRaises(HTTPException) as cm:
            self._check({"scene_partner_trial_only": True}, SimpleNamespace(is_library=True, title="Not in the set"))
        self.assertEqual(cm.exception.detail["error"], "library_upgrade_required")

    def test_free_own_script_allowed(self):
        self._check({"scene_partner_trial_only": True}, SimpleNamespace(is_library=False, title="Mine"),
                    script=SimpleNamespace(is_sample=False, title="Mine", user_id=1))
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

Move `FREE_LIBRARY_SCENE_TITLES` and `_is_free_library_scene` from `scenes.py` (around line 80-90) into:

```python
"""Who may rehearse which scene. Copied out of scenes.start_rehearsal so both
the old router (until it is deleted) and the v2 router share one rule."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.models.billing import UserSubscription
from app.services.benefits import get_effective_benefits

# <paste the FREE_LIBRARY_SCENE_TITLES set from scenes.py here, unchanged>


def is_free_library_scene(scene) -> bool:
    return bool(scene.is_library) and scene.title in FREE_LIBRARY_SCENE_TITLES


def _subscription(db, user_id: int):
    return db.query(UserSubscription).filter(UserSubscription.user_id == user_id).first()


def assert_can_rehearse(db, user, scene, script=None) -> None:
    benefits = get_effective_benefits(db, user.id, _subscription(db, user.id))
    if not benefits.get("scene_partner_trial_only", False):
        return
    library_allowed = is_free_library_scene(scene)
    sample_allowed = script is not None and (script.is_sample or script.title.startswith("Example:"))
    own_script_allowed = script is not None and script.user_id == user.id
    if library_allowed or sample_allowed or own_script_allowed:
        return
    if scene.is_library:
        detail = {
            "error": "library_upgrade_required",
            "message": "This scene is part of the full library. Your free plan includes a starter set of scenes to rehearse. Upgrade to Plus for the whole catalog.",
            "upgrade_url": "/pricing",
        }
    else:
        detail = {
            "error": "trial_example_only",
            "message": "Free rehearsal is limited to the example script. Upgrade to Plus to rehearse your own scripts.",
            "upgrade_url": "/pricing",
        }
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
```

In `scenes.py`, replace the local set and `_is_free_library_scene` with `from app.services.rehearsal.access import FREE_LIBRARY_SCENE_TITLES, is_free_library_scene as _is_free_library_scene`. Run the whole suite: `.venv/bin/python -m pytest tests -q -x`.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"The rehearsal access rule lives in one module"`.

### Task 9: The router

**Files:**
- Create: `backend/app/api/rehearsal.py`
- Modify: `backend/app/main.py` (import + include)
- Test: `backend/tests/test_rehearsal_v2_api.py`

- [ ] **Step 1: Failing test (FastAPI TestClient with overrides)**

```python
"""The v2 endpoints, end to end against the in-memory database."""
import unittest
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import rehearsal as api
from app.api.auth import get_current_user
from app.core.database import get_db
from app.middleware.burst_limiter import BurstLimiter
from app.middleware.rate_limiting import require_scene_partner
from app.models.actor import Play, Scene, SceneLine, UserScript
from app.models.organization import Organization
from app.models.rehearsal import PartnerAudio, RehearsalEvent, RehearsalRun
from app.models.user import User
from app.services.rehearsal import partner_audio
from tests.dbfixture import memory_db, restore

_TABLES = (Organization, User, Play, UserScript, Scene, SceneLine, RehearsalRun, RehearsalEvent, PartnerAudio)


class Api(unittest.TestCase):
    def setUp(self):
        self.db, self._saved = memory_db(_TABLES)
        self.user = User(email="a@example.com", supabase_id="s1")
        play = Play(title="P", author="A", source_type="play")
        self.db.add_all([self.user, play]); self.db.flush()
        self.scene = Scene(play_id=play.id, title="S", is_library=True, character_1_name="ANNA", character_2_name="BEN",
                           character_1_gender="female", character_2_gender="male", line_count=2, estimated_duration_seconds=10)
        self.db.add(self.scene); self.db.flush()
        self.db.add_all([
            SceneLine(scene_id=self.scene.id, line_order=0, character_name="BEN", text="Where were you?", word_count=3),
            SceneLine(scene_id=self.scene.id, line_order=1, character_name="ANNA", text="Out.", word_count=1),
        ])
        self.db.commit()

        app = FastAPI()
        app.include_router(api.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[require_scene_partner] = lambda: True
        self.client = TestClient(app)
        self.patches = [
            mock.patch.object(api, "assert_can_rehearse"),
            mock.patch.object(api, "schedule_synthesis"),
            mock.patch.object(partner_audio, "signed_url", side_effect=lambda p: f"https://signed/{p}"),
        ]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.db.close(); restore(self._saved)

    def test_scene_payload_has_contract_lines_voices_and_audio_slots(self):
        r = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}")
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual([l["character"] for l in body["lines"]], ["BEN", "ANNA"])
        self.assertEqual(body["characters"], ["BEN", "ANNA"])
        self.assertEqual(len(body["voices"]), 4)
        self.assertEqual(body["defaults"]["ANNA"]["BEN"], next(v["id"] for v in body["voices"] if v["gender"] == "male"))
        self.assertEqual(body["audio"]["0"], {"key": mock.ANY, "url": None})
        self.assertIsNone(body["resume"])

    def test_audio_endpoint_202_then_200(self):
        key = partner_audio.ensure(self.db, "openai", "ash", None, "Where were you?")
        self.db.commit()
        self.assertEqual(self.client.get(f"/api/rehearsal/audio/{key}").status_code, 202)
        row = self.db.get(PartnerAudio, key); row.status = "ready"; row.storage_path = "ab/x.mp3"; self.db.commit()
        r = self.client.get(f"/api/rehearsal/audio/{key}")
        self.assertEqual((r.status_code, r.json()["url"]), (200, "https://signed/ab/x.mp3"))
        self.assertEqual(self.client.get("/api/rehearsal/audio/" + "0" * 64).status_code, 404)

    def test_run_then_events_then_resume(self):
        r = self.client.post("/api/rehearsal/runs", json={"scene_id": self.scene.id, "character": "ANNA", "voices": {"BEN": "ash"}})
        self.assertEqual(r.status_code, 200, r.text)
        run_id = r.json()["run_id"]
        evs = [{"seq": 0, "type": "started", "line_index": None, "at_ms": 0, "payload": {}},
               {"seq": 1, "type": "line_reached", "line_index": 1, "at_ms": 10, "payload": {}}]
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/events", json={"events": evs}).status_code, 204)
        # sendBeacon sends text/plain
        self.assertEqual(self.client.post(f"/api/rehearsal/runs/{run_id}/events", content='{"events": []}',
                                          headers={"content-type": "text/plain"}).status_code, 204)
        body = self.client.get(f"/api/rehearsal/scenes/{self.scene.id}").json()
        self.assertEqual(body["resume"], {"run_id": run_id, "line_index": 1})

    def test_bad_character_is_422(self):
        r = self.client.post("/api/rehearsal/runs", json={"scene_id": self.scene.id, "character": "NOBODY", "voices": {}})
        self.assertEqual(r.status_code, 422)
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

`backend/app/api/rehearsal.py`:

```python
"""ScenePartner v2. Three jobs, none in the loop: hand out the scene and its
audio, start a run, take the journal. Nothing here is called between one line
and the next; see docs/superpowers/specs/2026-10-12-scenepartner-v2-design.md.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.middleware.burst_limiter import BurstLimiter
from app.middleware.rate_limiting import require_scene_partner
from app.models.actor import Scene, UserScript
from app.models.rehearsal import PartnerAudio
from app.models.user import User
from app.services.events import record_user_event
from app.services.rehearsal import journal, partner_audio
from app.services.rehearsal.access import assert_can_rehearse
from app.services.rehearsal.contract import RehearsalLine, lines_for, partner_characters, same_character
from app.services.rehearsal.voices import VOICES, default_voices, voice_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rehearsal", tags=["rehearsal"])


# ── scene ────────────────────────────────────────────────────────────────────

def _load_scene(db: Session, scene_id: int, user: User) -> tuple[Scene, UserScript | None]:
    scene = db.get(Scene, scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    script = db.get(UserScript, scene.user_script_id) if scene.user_script_id else None
    if script is not None and script.user_id != user.id and not script.is_sample:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene, script


def _audio_plan(lines: list[RehearsalLine], actor: str, voices: dict[str, str]) -> list[tuple[int, str, str, str | None]]:
    """(line index, voice, text, direction) for every partner line, in order."""
    out = []
    for line in lines:
        if same_character(line.character, actor):
            continue
        voice = next((v for c, v in voices.items() if same_character(c, line.character)), None) or VOICES[0].id
        out.append((line.index, voice, line.text, line.direction))
    return out


def schedule_synthesis(keys: list[str], text_for: dict[str, tuple[str, str | None]]) -> None:
    """Runs in a BackgroundTask with its own session: the request is long gone."""
    db = SessionLocal()
    try:
        partner_audio.synthesise_pending(db, keys, text_for)
    finally:
        db.close()


@router.get("/scenes/{scene_id}")
def get_rehearsal_scene(
    scene_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    scene, script = _load_scene(db, scene_id, user)
    lines = lines_for(db, scene.id)
    characters = []
    for line in lines:
        if not any(same_character(line.character, c) for c in characters):
            characters.append(line.character)

    # Defaults for whichever part the actor picks, and the audio slots for the
    # part the extractor calls character 1 (the common pick). Audio for another
    # pick, or another voice, comes through GET /audio/{key} as it is needed.
    defaults = {c: default_voices(scene, lines, c) for c in characters}
    first = scene.character_1_name if any(same_character(scene.character_1_name or "", c) for c in characters) else characters[0] if characters else ""
    plan = _audio_plan(lines, first, defaults.get(first, {})) if first else []

    keys: list[str] = []
    text_for: dict[str, tuple[str, str | None]] = {}
    audio: dict[str, dict[str, Any]] = {}
    for index, voice, text, direction in plan:
        key = partner_audio.ensure(db, settings.partner_tts_vendor, voice, direction, text)
        keys.append(key)
        text_for[key] = (text, direction)
        row = db.get(PartnerAudio, key)
        url = partner_audio.signed_url(row.storage_path) if row.status == "ready" and row.storage_path else None
        audio[str(index)] = {"key": key, "url": url}
    db.commit()
    missing = [k for k in keys if db.get(PartnerAudio, k).status != "ready"]
    if missing:
        background.add_task(schedule_synthesis, missing, {k: text_for[k] for k in missing})

    return {
        "scene": {
            "id": scene.id, "title": scene.title, "act": scene.act, "scene_number": scene.scene_number,
            "play_title": scene.play.title if scene.play else (script.title if script else None),
            "is_library": bool(scene.is_library),
        },
        "lines": [l.model_dump() for l in lines],
        "characters": characters,
        "voices": [{"id": v.id, "label": v.label, "gender": v.gender} for v in VOICES],
        "defaults": defaults,
        "vendor": settings.partner_tts_vendor,
        "audio": audio,
        "resume": journal.resumable(db, user.id, scene.id),
    }


# ── audio ────────────────────────────────────────────────────────────────────

class AudioFor(BaseModel):
    scene_id: int
    line_index: int
    voice: str


@router.post("/audio")
def audio_for_line(
    req: AudioFor,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The key (and URL if ready) for one line in one voice. Used after a voice
    switch or for a part other than character 1. Queues synthesis if missing."""
    scene, _ = _load_scene(db, req.scene_id, user)
    if voice_by_id(req.voice) is None:
        raise HTTPException(status_code=422, detail="Unknown voice")
    lines = lines_for(db, scene.id)
    if not 0 <= req.line_index < len(lines):
        raise HTTPException(status_code=404, detail="No such line")
    line = lines[req.line_index]
    key = partner_audio.ensure(db, settings.partner_tts_vendor, req.voice, line.direction, line.text)
    db.commit()
    row = db.get(PartnerAudio, key)
    if row.status == "ready" and row.storage_path:
        return {"key": key, "url": partner_audio.signed_url(row.storage_path)}
    background.add_task(schedule_synthesis, [key], {key: (line.text, line.direction)})
    return {"key": key, "url": None}


@router.get("/audio/{key}")
def get_audio(key: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(PartnerAudio, key)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown line")
    if row.status == "ready" and row.storage_path:
        return {"key": key, "url": partner_audio.signed_url(row.storage_path)}
    if row.status == "failed":
        raise HTTPException(status_code=502, detail="This line could not be synthesised")
    return Response(status_code=202)


# ── runs ─────────────────────────────────────────────────────────────────────

class StartRun(BaseModel):
    scene_id: int
    character: str
    voices: dict[str, str] = Field(default_factory=dict)
    is_guided: bool = False


@router.post("/runs")
def start_run(
    req: StartRun,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _meter: bool = Depends(require_scene_partner),
    _burst: bool = Depends(BurstLimiter("scene_partner")),
):
    scene, script = _load_scene(db, req.scene_id, user)
    if not req.is_guided:
        assert_can_rehearse(db, user, scene, script)
    lines = lines_for(db, scene.id)
    if not any(same_character(l.character, req.character) for l in lines):
        raise HTTPException(status_code=422, detail="That character has no lines in this scene")
    for c, v in req.voices.items():
        if voice_by_id(v) is None:
            raise HTTPException(status_code=422, detail=f"Unknown voice for {c}")
    voices = {**default_voices(scene, lines, req.character), **req.voices}
    run = journal.create_run(db, user.id, scene.id, req.character, voices, is_guided=req.is_guided)
    if req.is_guided:
        record_user_event(user.id, "guided_scene_started", {"platform": "web"})
    return {"run_id": run.id, "voices": voices}


@router.post("/runs/{run_id}/events", status_code=204)
async def append_events(
    run_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fire-and-forget from the client. Parses the raw body so sendBeacon's
    text/plain is accepted. Never returns a body: the client never reads it."""
    raw = await request.body()
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return Response(status_code=204)
    events = body.get("events") if isinstance(body, dict) else None
    if not isinstance(events, list):
        return Response(status_code=204)
    try:
        journal.append(db, run_id, user.id, events[:500])
    except PermissionError:
        raise HTTPException(status_code=404, detail="Run not found")
    if any(e.get("type") == "completed" for e in events):
        run = journal.db_run(db, run_id)
        if run is not None and run.is_guided:
            record_user_event(user.id, "guided_scene_finished", {"lines_heard": journal.furthest_line(db, run_id)})
    return Response(status_code=204)


@router.get("/runs")
def list_runs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return journal.summaries(db, user.id)


@router.get("/stats")
def run_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return journal.stats(db, user.id)


@router.get("/guided")
def guided(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Which scene and which part the guided first run uses."""
    from app.services.guided_scene import GUIDED_ACTOR, guided_scene
    scene = guided_scene(db)
    if scene is None:
        raise HTTPException(status_code=404, detail="The guided scene is not seeded")
    return {"scene_id": scene.id, "character": GUIDED_ACTOR}
```

Add to `journal.py`:

```python
def db_run(db: Session, run_id: int) -> RehearsalRun | None:
    return db.get(RehearsalRun, run_id)
```

In `backend/app/main.py`: `from app.api.rehearsal import router as rehearsal_router` beside line 38, and `app.include_router(rehearsal_router)` after `app.include_router(scenes_router)`.

- [ ] **Step 4: Run** → PASS. Also `pytest tests -q -x` for the whole suite.

- [ ] **Step 5: Commit** `"The rehearsal router: scene with audio slots, runs, and the journal"`.

### Task 10: Trial rule over the journal

**Files:**
- Modify: `backend/app/services/trial_length.py:33-52`
- Test: `backend/tests/test_trial_length.py` (add one test)

- [ ] **Step 1: Add the failing test** to the existing `Fixture` class in `tests/test_trial_length.py` (add `RehearsalRun, RehearsalEvent` to `_TABLES` and import them from `app.models.rehearsal`):

```python
    def test_a_completed_v2_run_earns_the_long_trial(self):
        from app.services.rehearsal import journal
        self.db.add(self.user); self.db.flush()
        scene = self.db.query(Scene).first()
        run = journal.create_run(self.db, self.user.id, scene.id, "ALEX", {})
        journal.append(self.db, run.id, self.user.id, [{"seq": 0, "type": "completed", "line_index": 3, "at_ms": 1, "payload": {}}])
        self.assertEqual(trial_length.trial_days_for(self.db, self.user.id), trial_length.EARNED_TRIAL_DAYS)
```

(If the fixture has no Scene seeded by then, create one as the other tests in the file do.)

- [ ] **Step 2: Run** → fails (7 days).

- [ ] **Step 3: Implement** in `trial_length.py`, inside `has_finished_a_scene`'s `try`, before the old query:

```python
        from app.services.rehearsal import journal
        if journal.user_has_finished_a_scene(db, user_id):
            return True
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"A finished v2 run earns the two-week trial; old completed rows still count"`.

### Task 11: Admin regenerate + warm script

**Files:**
- Modify: `backend/app/api/admin_sessions.py` (add one endpoint using that file's admin dependency)
- Create: `backend/scripts/warm_partner_audio.py`

- [ ] **Step 1: Endpoint** (append to `admin_sessions.py`, using the same admin `Depends` the file already uses for its other routes):

```python
class Regenerate(BaseModel):
    key: str


@router.post("/rehearsal/audio/regenerate", status_code=202)
def regenerate_partner_audio(req: Regenerate, background: BackgroundTasks, db: Session = Depends(get_db),
                             _admin: User = Depends(<the file's admin dependency>)):
    """Throw one cached partner line away and make it again, for every actor."""
    from app.services.rehearsal import partner_audio
    row = db.get(PartnerAudio, req.key)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown key")
    vendor, voice = row.vendor, row.voice
    partner_audio.delete_row(db, req.key)
    # The text is not stored on the row (the key is its hash), so the caller
    # supplies it on the next GET /api/rehearsal/scenes/{id}, which re-ensures
    # and re-queues the line. 202: the row is gone; the next open rebuilds it.
    return {"deleted": req.key, "vendor": vendor, "voice": voice}
```

- [ ] **Step 2: Warm script**

```python
#!/usr/bin/env python
"""Synthesise every partner line of every library scene for its default voices,
so the first actor to open any library scene pays nothing.

Usage:
    cd backend && uv run python scripts/warm_partner_audio.py [--limit N]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.actor import Scene
from app.services.rehearsal import partner_audio
from app.services.rehearsal.contract import lines_for, same_character
from app.services.rehearsal.voices import default_voices

ap = argparse.ArgumentParser()
ap.add_argument("--limit", type=int, default=None)
args = ap.parse_args()

db = SessionLocal()
scenes = db.query(Scene).filter(Scene.is_library == True).order_by(Scene.id)  # noqa: E712
if args.limit:
    scenes = scenes.limit(args.limit)
total = 0
for scene in scenes:
    lines = lines_for(db, scene.id)
    for actor in (scene.character_1_name, scene.character_2_name):
        if not actor:
            continue
        voices = default_voices(scene, lines, actor)
        keys, text_for = [], {}
        for line in lines:
            if same_character(line.character, actor):
                continue
            voice = next((v for c, v in voices.items() if same_character(c, line.character)), None)
            if not voice:
                continue
            key = partner_audio.ensure(db, settings.partner_tts_vendor, voice, line.direction, line.text)
            keys.append(key); text_for[key] = (line.text, line.direction)
        db.commit()
        partner_audio.synthesise_pending(db, keys, text_for)
        total += len(keys)
    print(f"scene {scene.id} {scene.title!r}: done ({total} lines so far)")
db.close()
```

- [ ] **Step 3: Commit** `"Admin regenerate for one partner line, and a warm script for the library"`.

### Task 12: Delete the old rehearsal endpoints

**Files:**
- Modify: `backend/app/api/scenes.py`
- Delete tests that only exercise deleted endpoints.

- [ ] **Step 1:** In `scenes.py` delete these functions and their routes: `get_resumable_session`, `start_rehearsal`, `start_guided_rehearsal`, `get_guided_scene`, `_duration_seconds`, `_compute_completion`, `deliver_line`, `abandon_session`, `get_session_feedback`, `list_rehearsal_sessions`, `rehearsal_stats`, `get_rehearsal_session`, and the models `RehearsalSessionResponse`, `DeliverLineRequest/Response`, `SessionFeedbackResponse`. Remove the `ScenePartnerGraph` import and `require_scene_partner` / `client_browser` imports if nothing else in the file uses them. Keep `resolve_rehearsal_characters`, `session_user_characters`, `_as_role_list`, `resolve_delivered_line_index`, `count_user_lines_delivered`, `_get_ai_voice_id` only if `grep -rn "<name>" backend/app backend/scripts backend/tests` finds a user outside `scenes.py`; otherwise delete them.

- [ ] **Step 2:** Run `pytest tests -q`. For each failing test module, decide: if it tests a deleted endpoint or helper and nothing else, delete the module (`test_rehearsal_completion.py`, `test_rehearsal_failure.py`, `test_rehearsal_line_attribution.py`, `test_rehearsal_roles.py`, `test_rehearsal_character_resolution.py`, `test_guided_scene.py`'s start-session tests, `test_recut_clears_rehearsal_history.py` if it only targets `rehearsal_sessions`). If it tests something that survives (e.g. `test_first_rehearsal.py`), fix the import.

- [ ] **Step 3:** `wc -l backend/app/api/scenes.py` should be well under 900. Commit `"The old rehearsal lifecycle is gone from scenes.py"`.

---

## Phase 2: Frontend pure modules (`lib/rehearsal/`)

### Task 13: contract.ts + script.ts

**Files:**
- Create: `lib/rehearsal/contract.ts`, `lib/rehearsal/script.ts`, `lib/rehearsal/script.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildScript } from './script';
import type { RehearsalLine } from './contract';

const L = (index: number, character: string, text: string, direction: string | null = null): RehearsalLine =>
  ({ index, character, text, direction });

const LINES = [L(0, 'BEN', 'Where were you?'), L(1, 'BEN', 'I waited.'), L(2, 'ANNA', 'Out. Twenty-four hours.'),
  L(3, 'MAID', 'Dinner, madam.'), L(4, 'ANNA', 'Go.')];

describe('buildScript', () => {
  it('groups consecutive partner lines into one beat', () => {
    const s = buildScript(LINES, 'ANNA');
    expect(s.turns.map(t => t.kind)).toEqual(['partner', 'actor', 'partner', 'actor']);
    expect(s.turns[0].kind === 'partner' && s.turns[0].lineIndices).toEqual([0, 1]);
  });
  it('actor turns carry tokenised words', () => {
    const s = buildScript(LINES, 'anna');
    const t = s.turns[1];
    expect(t.kind === 'actor' && t.words).toEqual(['out', 'twenty', 'four', 'hours']);
  });
  it('maps any line index to its turn', () => {
    const s = buildScript(LINES, 'ANNA');
    expect(s.turnOfLine[1]).toBe(0);
    expect(s.turnOfLine[4]).toBe(3);
  });
  it('keywords for an actor turn are the proper nouns in the scene plus the line words', () => {
    const s = buildScript(LINES, 'ANNA');
    const t = s.turns[1];
    expect(t.kind === 'actor' && t.keywords).toContain('Anna');
    expect(t.kind === 'actor' && t.keywords).toContain('Ben');
  });
});
```

- [ ] **Step 2: Run** `npm test -- lib/rehearsal` → fails.

- [ ] **Step 3: Implement**

`lib/rehearsal/contract.ts`:

```ts
/** The server shapes. `RehearsalLine` is the extractor contract: four fields. */
export interface RehearsalLine {
  index: number;
  character: string;
  text: string;
  direction: string | null;
}

export interface Voice { id: string; label: string; gender: 'female' | 'male' }

export interface ScenePayload {
  scene: { id: number; title: string; act: string | null; scene_number: string | null; play_title: string | null; is_library: boolean };
  lines: RehearsalLine[];
  characters: string[];
  voices: Voice[];
  defaults: Record<string, Record<string, string>>;
  vendor: string;
  audio: Record<string, { key: string; url: string | null }>;
  resume: { run_id: number; line_index: number } | null;
}

export type EventType =
  | 'started' | 'line_reached' | 'actor_line_read' | 'partner_line_played'
  | 'paused' | 'resumed' | 'jumped' | 'completed' | 'abandoned';

export interface JournalEvent {
  seq: number;
  type: EventType;
  line_index: number | null;
  at_ms: number;
  payload: Record<string, unknown>;
}

export const sameCharacter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
```

`lib/rehearsal/script.ts`:

```ts
/**
 * A scene, from the actor's side of it.
 *
 * Consecutive partner lines become one beat so they play as one continuous
 * thing, not two clips with a seam. Actor lines carry their words, tokenised
 * once here so the page and the matcher cannot disagree about what a word is.
 */
import { lineWords } from '@/lib/live-read';
import { type RehearsalLine, sameCharacter } from './contract';

export interface PartnerTurn { kind: 'partner'; index: number; lineIndices: number[] }
export interface ActorTurn { kind: 'actor'; index: number; lineIndex: number; words: string[]; keywords: string[] }
export type Turn = PartnerTurn | ActorTurn;

export interface Script {
  lines: RehearsalLine[];
  actor: string;
  turns: Turn[];
  /** line index → turn index */
  turnOfLine: number[];
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

/** Character names and capitalised words the transcriber would otherwise mangle. */
function sceneKeywords(lines: RehearsalLine[]): string[] {
  const names = new Set<string>();
  for (const l of lines) names.add(titleCase(l.character));
  for (const l of lines) {
    for (const w of l.text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []) names.add(w);
  }
  return [...names].slice(0, 60);
}

export function buildScript(lines: RehearsalLine[], actor: string): Script {
  const turns: Turn[] = [];
  const turnOfLine: number[] = [];
  const shared = sceneKeywords(lines);
  for (const line of lines) {
    const mine = sameCharacter(line.character, actor);
    const last = turns[turns.length - 1];
    if (mine) {
      const words = lineWords(line.text);
      const own = [...new Set(line.text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])];
      turns.push({ kind: 'actor', index: turns.length, lineIndex: line.index, words,
        keywords: [...new Set([...shared, ...own])].slice(0, 100) });
    } else if (last && last.kind === 'partner') {
      last.lineIndices.push(line.index);
    } else {
      turns.push({ kind: 'partner', index: turns.length, lineIndices: [line.index] });
    }
    turnOfLine[line.index] = turns.length - 1;
  }
  return { lines, actor, turns, turnOfLine };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `"lib/rehearsal: the contract and the script as turns"`.

### Task 14: timeline.ts

**Files:** `lib/rehearsal/timeline.ts`, `lib/rehearsal/timeline.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { Timeline } from './timeline';

describe('Timeline', () => {
  it('reports handover as scheduled start minus last delta, in ms', () => {
    const t = new Timeline();
    t.mark('delta', 10.000);
    t.mark('delta', 10.420);
    t.mark('partner_scheduled', 10.441);
    expect(t.handoverMs()).toBe(21);
  });
  it('is null without both marks', () => {
    const t = new Timeline();
    t.mark('delta', 1);
    expect(t.handoverMs()).toBeNull();
  });
  it('resets per line', () => {
    const t = new Timeline();
    t.mark('delta', 1); t.mark('partner_scheduled', 1.1);
    t.reset();
    expect(t.handoverMs()).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```ts
/** The per-line latency marks, on the audio clock (seconds). */
export type Mark = 'delta' | 'handover' | 'partner_scheduled' | 'partner_end' | 'mic_open' | 'first_delta';

export class Timeline {
  private marks: Partial<Record<Mark, number>> = {};
  mark(m: Mark, t: number) { this.marks[m] = t; }
  get(m: Mark) { return this.marks[m]; }
  reset() { this.marks = {}; }
  /** Last delta → partner scheduled, ms. The number the contract is about. */
  handoverMs(): number | null {
    const a = this.marks.delta, b = this.marks.partner_scheduled;
    if (a === undefined || b === undefined) return null;
    return Math.round((b - a) * 1000);
  }
}
```

- [ ] **Step 3: Run → PASS. Commit** `"lib/rehearsal/timeline: the marks behind handover_ms"`.

### Task 15: journal.ts

**Files:** `lib/rehearsal/journal.ts`, `lib/rehearsal/journal.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Journal } from './journal';

const make = () => {
  const sent: unknown[][] = [];
  const transport = { send: vi.fn(async (events: unknown[]) => { sent.push(events); }), beacon: vi.fn(() => true) };
  return { j: new Journal(transport), sent, transport };
};

describe('Journal', () => {
  it('numbers events from zero', () => {
    const { j } = make();
    j.emit('started', null, 0);
    j.emit('line_reached', 0, 5);
    expect(j.pending().map(e => e.seq)).toEqual([0, 1]);
  });
  it('flush sends everything pending once', async () => {
    const { j, sent } = make();
    j.emit('started', null, 0);
    await j.flush();
    await j.flush();
    expect(sent).toHaveLength(1);
    expect(j.pending()).toHaveLength(0);
  });
  it('a failed flush keeps the events for the next one', async () => {
    const { j, transport, sent } = make();
    transport.send.mockRejectedValueOnce(new Error('offline'));
    j.emit('started', null, 0);
    await j.flush();
    expect(j.pending()).toHaveLength(1);
    j.emit('line_reached', 0, 1);
    await j.flush();
    expect(sent[0]).toHaveLength(2);
  });
  it('beacon hands everything pending to the transport synchronously', () => {
    const { j, transport } = make();
    j.emit('abandoned', 2, 9);
    j.beacon();
    expect(transport.beacon).toHaveBeenCalledWith([expect.objectContaining({ type: 'abandoned', seq: 0 })]);
    expect(j.pending()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement**

```ts
/**
 * The run journal, client side. Appends locally, flushes in batches, never
 * blocks anything: the loop calls `emit` and moves on. The server dedupes on
 * (run, seq), so a batch that is sent twice costs nothing.
 */
import type { EventType, JournalEvent } from './contract';

export interface JournalTransport {
  send: (events: JournalEvent[]) => Promise<void>;
  /** navigator.sendBeacon, or false if it could not be queued. */
  beacon: (events: JournalEvent[]) => boolean;
}

export class Journal {
  private seq = 0;
  private queue: JournalEvent[] = [];
  private inflight: JournalEvent[] = [];
  private flushing = false;

  constructor(private transport: JournalTransport) {}

  emit(type: EventType, lineIndex: number | null, atMs: number, payload: Record<string, unknown> = {}) {
    this.queue.push({ seq: this.seq++, type, line_index: lineIndex, at_ms: Math.round(atMs), payload });
  }

  pending(): JournalEvent[] { return [...this.inflight, ...this.queue]; }

  async flush(): Promise<void> {
    if (this.flushing || (this.queue.length === 0 && this.inflight.length === 0)) return;
    this.flushing = true;
    const batch = [...this.inflight, ...this.queue];
    this.inflight = batch;
    this.queue = [];
    try {
      await this.transport.send(batch);
      this.inflight = [];
    } catch {
      // Keep them; the next flush (or the beacon) carries them.
    } finally {
      this.flushing = false;
    }
  }

  beacon(): void {
    const batch = [...this.inflight, ...this.queue];
    if (!batch.length) return;
    if (this.transport.beacon(batch)) { this.inflight = []; this.queue = []; }
  }
}
```

- [ ] **Step 3: Run → PASS. Commit** `"lib/rehearsal/journal: numbered, batched, never awaited by the loop"`.

### Task 16: engine.ts (the heart)

**Files:** `lib/rehearsal/engine.ts`, `lib/rehearsal/engine.test.ts`

- [ ] **Step 1: Failing tests** (the fakes are the spec of the ports)

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BREATH_S, Engine, type EnginePorts } from './engine';
import { buildScript } from './script';
import type { RehearsalLine } from './contract';

const L = (index: number, character: string, text: string): RehearsalLine => ({ index, character, text, direction: null });
const LINES = [L(0, 'BEN', 'Where were you?'), L(1, 'BEN', 'I waited.'), L(2, 'ANNA', 'Out. Twenty-four hours.'),
  L(3, 'BEN', 'Fine.'), L(4, 'ANNA', 'Go.')];

function fakePorts() {
  let now = 100;
  const scheduled: { line: number; at: number }[] = [];
  const durations: Record<number, number> = { 0: 1.0, 1: 0.5, 3: 0.4 };
  const ports: EnginePorts & { now: () => number; tick: (s: number) => void; scheduled: typeof scheduled } = {
    now: () => now,
    tick: (s) => { now += s; },
    scheduled,
    clock: { now: () => now, outputLatency: () => 0.02 },
    player: {
      duration: (line) => durations[line] ?? null,
      play: (line, at) => { scheduled.push({ line, at }); return true; },
      stopAll: vi.fn(),
    },
    mic: { prime: vi.fn(), open: vi.fn(), close: vi.fn() },
    journal: { emit: vi.fn() },
    schedule: vi.fn((_at: number, fn: () => void) => { timers.push({ at: _at, fn }); return () => {}; }),
  };
  return ports;
}
let timers: { at: number; fn: () => void }[] = [];
const fire = (upTo: number) => { const due = timers.filter(t => t.at <= upTo); timers = timers.filter(t => t.at > upTo); due.forEach(t => t.fn()); };

describe('Engine', () => {
  let ports: ReturnType<typeof fakePorts>;
  let engine: Engine;
  beforeEach(() => { timers = []; ports = fakePorts(); engine = new Engine(buildScript(LINES, 'ANNA'), ports); });

  it('begin plays the first beat as one continuous thing with a breath between lines', () => {
    engine.begin();
    expect(ports.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }]);
    expect(engine.snapshot().state).toBe('partner');
  });

  it('opens the mic exactly at the end of the beat and primes it at the start', () => {
    engine.begin();
    expect(ports.mic.prime).toHaveBeenCalledWith(expect.arrayContaining(['Anna', 'Ben']));
    const end = 100 + 1.0 + BREATH_S + 0.5;
    expect(ports.mic.open).not.toHaveBeenCalled();
    ports.tick(end - 100); fire(end);
    expect(ports.mic.open).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().state).toBe('actor');
    expect(engine.snapshot().lineIndex).toBe(2);
  });

  it('hands over on the last word with no wait, and schedules the partner now', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    ports.tick(1); engine.delta('out twenty four');
    expect(engine.snapshot().state).toBe('actor');
    ports.tick(0.4); engine.delta('out twenty four hours');
    expect(ports.mic.close).toHaveBeenCalled();
    expect(ports.scheduled.at(-1)).toEqual({ line: 3, at: ports.now() });
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number),
      expect.objectContaining({ ended_by: 'last_word', matched: [0, 1, 2, 3], handover_ms: 0 }));
  });

  it('a delta before the mic is open is ignored', () => {
    engine.begin();
    engine.delta('out twenty four hours');
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.mic.close).not.toHaveBeenCalled();
  });

  it('quiet after some words hands over; quiet after nothing does not', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.quiet();
    expect(engine.snapshot().state).toBe('actor');
    engine.delta('out twenty');
    engine.quiet();
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number), expect.objectContaining({ ended_by: 'quiet' }));
  });

  it('the last actor line ends the scene', () => {
    engine.begin(); let t = 100 + 1.5 + BREATH_S; ports.tick(t - 100); fire(t);
    engine.delta('out twenty four hours');
    t = ports.now() + 0.4; ports.tick(0.4); fire(t);
    expect(engine.snapshot().state).toBe('actor'); expect(engine.snapshot().lineIndex).toBe(4);
    engine.delta('go');
    expect(engine.snapshot().state).toBe('ended');
    expect(ports.journal.emit).toHaveBeenCalledWith('completed', 4, expect.any(Number), {});
  });

  it('skip moves on with ended_by skipped; back returns to the previous actor line', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.skip();
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number), expect.objectContaining({ ended_by: 'skipped' }));
    expect(engine.snapshot().state).toBe('partner');
    engine.back();
    expect(engine.snapshot().lineIndex).toBe(2);
    expect(engine.snapshot().state).toBe('actor');
    expect(ports.player.stopAll).toHaveBeenCalled();
  });

  it('pause stops audio and the mic; resume restarts the current turn', () => {
    engine.begin();
    engine.pause();
    expect(engine.snapshot().state).toBe('paused');
    expect(ports.player.stopAll).toHaveBeenCalled();
    expect(ports.mic.close).toHaveBeenCalled();
    engine.resume();
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.scheduled.length).toBe(4); // first beat scheduled twice
  });

  it('jumpTo any line starts that turn', () => {
    engine.begin();
    engine.jumpTo(4);
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 4 });
    expect(ports.journal.emit).toHaveBeenCalledWith('jumped', 4, expect.any(Number), { from: 0 });
  });

  it('a partner line whose audio is missing waits for it, then plays', () => {
    const p = fakePorts(); const dur: Record<number, number | null> = { 0: null, 1: 0.5 };
    p.player.duration = (l) => dur[l] ?? null;
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin();
    expect(p.scheduled).toEqual([]);
    expect(e.snapshot().state).toBe('partner');
    dur[0] = 1.0; e.audioReady(0);
    expect(p.scheduled[0]).toEqual({ line: 0, at: p.now() });
  });
});
```

- [ ] **Step 2: Run** → fails on import.

- [ ] **Step 3: Implement**

```ts
/**
 * The rehearsal engine. Pure: every clock, speaker, microphone and network it
 * touches is a port handed in, so this file runs under vitest with none of
 * them. The React layer renders `snapshot()` and forwards inputs. It never
 * decides anything.
 *
 * Time is the audio clock, in seconds. A partner beat is scheduled on it to
 * the sample; the microphone opens at the beat's exact end; the handover
 * fires on the delta that completes the actor's line, not after a wait.
 */
import { liveRead, shouldHandOver, type LiveRead, EMPTY_READ } from '@/lib/live-read';
import type { EventType } from './contract';
import type { ActorTurn, PartnerTurn, Script, Turn } from './script';
import { Timeline } from './timeline';

/** The pause between two partner lines in one beat. */
export const BREATH_S = 0.3;

export interface EnginePorts {
  clock: { now: () => number; outputLatency: () => number };
  player: {
    /** Decoded length in seconds, or null if the line is not ready yet. */
    duration: (lineIndex: number) => number | null;
    /** Schedule the line at `at` on the audio clock. */
    play: (lineIndex: number, at: number) => boolean;
    stopAll: () => void;
  };
  mic: {
    /** Tell the transcriber what is coming. Sent when the partner starts. */
    prime: (keywords: string[]) => void;
    open: () => void;
    close: () => void;
  };
  journal: { emit: (type: EventType, lineIndex: number | null, atMs: number, payload?: Record<string, unknown>) => void };
  /** Run `fn` when the audio clock reaches `at`. Returns a cancel. */
  schedule: (at: number, fn: () => void) => () => void;
}

export type EngineState = 'ready' | 'partner' | 'actor' | 'paused' | 'ended';

export interface Snapshot {
  state: EngineState;
  turnIndex: number;
  /** The line the actor is on, or the partner line currently sounding. */
  lineIndex: number;
  read: LiveRead;
  /** Which partner line in the current beat is sounding, by line index. */
  sounding: number | null;
  /** Lines the actor has already read, index → matched word indices. */
  heard: Map<number, Set<number>>;
}

export class Engine {
  private state: EngineState = 'ready';
  private turnIndex = 0;
  private read: LiveRead = EMPTY_READ;
  private sounding: number | null = null;
  private heard = new Map<number, Set<number>>();
  private cancels: Array<() => void> = [];
  private pausedFrom: EngineState = 'partner';
  private startedAt = 0;
  private timeline = new Timeline();
  private waitingFor: number | null = null;
  private listeners = new Set<() => void>();

  constructor(private script: Script, private ports: EnginePorts) {}

  // ── reading ──

  snapshot(): Snapshot {
    const turn = this.script.turns[this.turnIndex];
    const lineIndex = turn ? (turn.kind === 'actor' ? turn.lineIndex : (this.sounding ?? turn.lineIndices[0])) : -1;
    return { state: this.state, turnIndex: this.turnIndex, lineIndex, read: this.read, sounding: this.sounding, heard: this.heard };
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.listeners.forEach(fn => fn()); }

  private atMs() { return (this.ports.clock.now() - this.startedAt) * 1000; }

  // ── inputs from the actor ──

  begin() {
    if (this.state !== 'ready') return;
    this.startedAt = this.ports.clock.now();
    this.ports.journal.emit('started', null, 0);
    this.enter(0);
  }

  pause() {
    if (this.state !== 'partner' && this.state !== 'actor') return;
    this.pausedFrom = this.state;
    this.clearTimers();
    this.ports.player.stopAll();
    this.ports.mic.close();
    this.state = 'paused';
    this.ports.journal.emit('paused', this.snapshot().lineIndex, this.atMs());
    this.changed();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ports.journal.emit('resumed', this.snapshot().lineIndex, this.atMs());
    this.enter(this.turnIndex);
  }

  skip() {
    if (this.state !== 'actor') return;
    this.finishActorTurn('skipped');
  }

  back() {
    if (this.state === 'ended' || this.state === 'ready') return;
    let i = this.turnIndex - 1;
    while (i >= 0 && this.script.turns[i].kind !== 'actor') i--;
    if (i < 0) i = 0;
    this.jumpToTurn(i);
  }

  jumpTo(lineIndex: number) {
    if (this.state === 'ready') return;
    const t = this.script.turnOfLine[lineIndex];
    if (t === undefined) return;
    this.jumpToTurn(t);
  }

  private jumpToTurn(t: number) {
    const from = this.snapshot().lineIndex;
    this.clearTimers();
    this.ports.player.stopAll();
    this.ports.mic.close();
    this.ports.journal.emit('jumped', this.lineOfTurn(t), this.atMs(), { from });
    this.enter(t);
  }

  // ── inputs from the transcriber ──

  delta(transcript: string) {
    if (this.state !== 'actor') return;
    const turn = this.script.turns[this.turnIndex] as ActorTurn;
    this.timeline.mark('delta', this.ports.clock.now());
    if (this.timeline.get('first_delta') === undefined) this.timeline.mark('first_delta', this.ports.clock.now());
    this.read = liveRead(turn.words, transcript);
    if (shouldHandOver({ ...this.read, turnEnded: false })) {
      this.finishActorTurn('last_word');
      return;
    }
    this.changed();
  }

  /** The transcript has stopped growing (QUIET_AFTER_WORDS_MS). */
  quiet() {
    if (this.state !== 'actor') return;
    if (shouldHandOver({ ...this.read, turnEnded: true })) this.finishActorTurn('quiet');
  }

  /** A partner line the engine was waiting on has decoded. */
  audioReady(lineIndex: number) {
    if (this.state === 'partner' && this.waitingFor === lineIndex) {
      this.waitingFor = null;
      this.playBeat(this.script.turns[this.turnIndex] as PartnerTurn, this.ports.clock.now());
    }
  }

  // ── transitions ──

  private lineOfTurn(t: number) {
    const turn = this.script.turns[t];
    return turn.kind === 'actor' ? turn.lineIndex : turn.lineIndices[0];
  }

  private enter(t: number) {
    this.clearTimers();
    this.turnIndex = t;
    this.read = EMPTY_READ;
    this.sounding = null;
    this.waitingFor = null;
    this.timeline.reset();
    const turn = this.script.turns[t];
    if (!turn) { this.end(); return; }
    if (turn.kind === 'partner') {
      this.state = 'partner';
      const next = this.script.turns[t + 1];
      if (next?.kind === 'actor') this.ports.mic.prime(next.keywords);
      this.playBeat(turn, this.ports.clock.now());
    } else {
      this.state = 'actor';
      this.ports.journal.emit('line_reached', turn.lineIndex, this.atMs());
      this.ports.mic.prime(turn.keywords);
      this.ports.mic.open();
      this.timeline.mark('mic_open', this.ports.clock.now());
    }
    this.changed();
  }

  private playBeat(turn: PartnerTurn, at: number) {
    this.ports.journal.emit('line_reached', turn.lineIndices[0], this.atMs());
    let t = at;
    for (const line of turn.lineIndices) {
      const d = this.ports.player.duration(line);
      if (d === null) {
        // Cold line. Hold here; audioReady() restarts the beat from this line.
        this.waitingFor = line;
        this.sounding = null;
        this.changed();
        return;
      }
      const start = t;
      this.ports.player.play(line, start);
      this.cancels.push(this.ports.schedule(start, () => { this.sounding = line; this.changed(); }));
      this.ports.journal.emit('partner_line_played', line, (start - this.startedAt) * 1000);
      t = start + d + BREATH_S;
    }
    const end = t - BREATH_S;
    this.timeline.mark('partner_end', end);
    this.cancels.push(this.ports.schedule(end, () => this.enter(this.turnIndex + 1)));
    this.changed();
  }

  private finishActorTurn(endedBy: 'last_word' | 'quiet' | 'skipped') {
    const turn = this.script.turns[this.turnIndex] as ActorTurn;
    const now = this.ports.clock.now();
    this.ports.mic.close();
    // Schedule the next beat BEFORE anything else: this is the handover.
    const next = this.script.turns[this.turnIndex + 1];
    this.timeline.mark('handover', now);
    if (next?.kind === 'partner') this.timeline.mark('partner_scheduled', now);
    this.heard.set(turn.lineIndex, new Set(this.read.matched));
    this.ports.journal.emit('actor_line_read', turn.lineIndex, this.atMs(), {
      ended_by: endedBy,
      matched: [...this.read.matched].sort((a, b) => a - b),
      score: this.read.score,
      handover_ms: this.timeline.handoverMs() ?? 0,
      output_latency_ms: Math.round(this.ports.clock.outputLatency() * 1000),
    });
    if (!next) { this.end(); return; }
    this.enter(this.turnIndex + 1);
  }

  private end() {
    this.clearTimers();
    this.ports.mic.close();
    this.state = 'ended';
    this.ports.journal.emit('completed', this.script.lines.length - 1, this.atMs());
    this.changed();
  }

  abandon() {
    if (this.state === 'ended' || this.state === 'ready') return;
    this.clearTimers();
    this.ports.player.stopAll();
    this.ports.mic.close();
    this.ports.journal.emit('abandoned', this.snapshot().lineIndex, this.atMs());
    this.state = 'ended';
    this.changed();
  }

  private clearTimers() { this.cancels.forEach(c => c()); this.cancels = []; }
}
```

Note for the implementer: in the test, `handover_ms` for the last-word case is `0` because the fake clock does not advance between the delta and the scheduling, which is the point.

- [ ] **Step 4: Run** → PASS. Fix any test drift honestly (the tests are the spec; if a test is wrong about BREATH arithmetic, fix the arithmetic in the test, not the rule).

- [ ] **Step 5: Alignment benchmark** — add to `lib/rehearsal/engine.test.ts`:

```ts
it('aligning a 200-word line against a 200-word transcript stays under 5ms', () => {
  const words = Array.from({ length: 200 }, (_, i) => `word${i % 37}`);
  const transcript = words.join(' ');
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) liveRead(words, transcript);
  expect((performance.now() - t0) / 10).toBeLessThan(5);
});
```

- [ ] **Step 6: Commit** `"lib/rehearsal/engine: the scene on one clock, tested with none"`.

---

## Phase 3: Browser adapters and the hook

### Task 17: audio-player.ts

**Files:** `lib/rehearsal/browser/audio-player.ts`

```ts
/**
 * One AudioContext for the run. Decodes partner lines into buffers and
 * schedules them on the context clock, which is the clock the engine uses
 * for everything. Nothing is fetched or decoded at play time.
 *
 * iOS: the context must be created or resumed inside the Begin tap, and it
 * is interrupted when the phone locks; `onInterrupted` lets the hook pause.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  onInterrupted: (() => void) | null = null;

  /** Call from a user gesture. */
  unlock(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx && this.ctx.state !== 'running') this.onInterrupted?.();
      });
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    return this.ctx;
  }

  context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'interactive' });
    return this.ctx;
  }

  now() { return this.context().currentTime; }
  outputLatency() { const c = this.context(); return c.outputLatency ?? c.baseLatency ?? 0; }

  async decode(lineIndex: number, bytes: ArrayBuffer) {
    const buf = await this.context().decodeAudioData(bytes.slice(0));
    this.buffers.set(lineIndex, buf);
  }

  has(lineIndex: number) { return this.buffers.has(lineIndex); }
  duration(lineIndex: number) { return this.buffers.get(lineIndex)?.duration ?? null; }

  play(lineIndex: number, at: number): boolean {
    const buf = this.buffers.get(lineIndex);
    if (!buf) return false;
    const ctx = this.context();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(Math.max(at, ctx.currentTime));
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); src.disconnect(); };
    return true;
  }

  stopAll() {
    for (const s of this.sources) { try { s.stop(); } catch { /* already done */ } }
    this.sources.clear();
  }

  /** Run `fn` when the clock reaches `at`. setTimeout against the audio clock,
   *  re-checked so a late timer never fires early. */
  schedule(at: number, fn: () => void): () => void {
    let handle: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      const ms = Math.max(0, (at - this.now()) * 1000);
      handle = setTimeout(() => { if (this.now() + 0.002 >= at) fn(); else arm(); }, ms);
    };
    arm();
    return () => { if (handle) clearTimeout(handle); };
  }

  close() { this.stopAll(); void this.ctx?.close(); this.ctx = null; this.buffers.clear(); }
}
```

- [ ] Commit `"audio-player: decoded buffers scheduled on the context clock"`.

### Task 18: line-loader.ts

**Files:** `lib/rehearsal/browser/line-loader.ts`

```ts
/**
 * Fetch and decode partner lines in order, always ahead of the scene.
 * A line that was null at open (cold cache) is polled at 250ms until the
 * server says ready. `onReady(line)` lets the engine resume a beat it was
 * holding for that line.
 */
import { api } from '@/lib/api';
import type { AudioPlayer } from './audio-player';

export interface LineSource { key: string; url: string | null }

const POLL_MS = 250;

export class LineLoader {
  private order: number[] = [];
  private sources = new Map<number, LineSource>();
  private started = new Set<number>();
  private stopped = false;
  onReady: ((lineIndex: number) => void) | null = null;
  onFailed: ((lineIndex: number, why: string) => void) | null = null;

  constructor(private player: AudioPlayer, private concurrency = 2) {}

  set(lineIndex: number, src: LineSource) { this.sources.set(lineIndex, src); if (!this.order.includes(lineIndex)) this.order.push(lineIndex); }

  /** Load the first `n` lines in order, then keep going. Resolves when line 0 is decoded. */
  async start(firstLine: number): Promise<void> {
    this.stopped = false;
    const first = this.load(firstLine);
    void this.pump();
    await first;
  }

  /** Make sure the lines after `lineIndex` are moving. Called on every handover. */
  ahead(lineIndex: number) { void this.pump(lineIndex); }

  private async pump(from = -1) {
    const pending = this.order.filter(i => i > from && !this.started.has(i) && !this.player.has(i));
    for (const i of pending.slice(0, this.concurrency)) void this.load(i);
  }

  private async load(i: number): Promise<void> {
    if (this.started.has(i) || this.player.has(i)) return;
    this.started.add(i);
    const src = this.sources.get(i);
    if (!src) return;
    try {
      let url = src.url;
      while (!url && !this.stopped) {
        await new Promise(r => setTimeout(r, POLL_MS));
        const res = await api.get<{ key: string; url: string | null }>(`/api/rehearsal/audio/${src.key}`);
        if (res.status === 200) url = res.data.url;
      }
      if (!url) return;
      const bytes = await fetch(url).then(r => { if (!r.ok) throw new Error(`audio ${r.status}`); return r.arrayBuffer(); });
      await this.player.decode(i, bytes);
      this.onReady?.(i);
      void this.pump(i);
    } catch (e) {
      this.started.delete(i);
      this.onFailed?.(i, e instanceof Error ? e.message : String(e));
    }
  }

  stop() { this.stopped = true; }
}
```

Note: `api.get` throws on non-2xx in this codebase; check `lib/api.ts` `request()` and, if a 202 throws, catch it and keep polling (treat the throw with status 202 as "not yet").

- [ ] Commit `"line-loader: partner lines fetched in order, N+1 always ahead"`.

### Task 19: gestures.ts

**Files:** `lib/rehearsal/browser/gestures.ts`

```ts
/**
 * Decision 2: act on the script. Tap a line to start from it (the Stage does
 * that itself); tap empty space to pause; swipe left to skip, right to go
 * back; Space / → / ← on a keyboard. Returns a teardown.
 */
export interface GestureHandlers { pause: () => void; skip: () => void; back: () => void }

const SWIPE_PX = 56;

export function bindGestures(el: HTMLElement, h: GestureHandlers): () => void {
  let startX = 0, startY = 0, moved = false;
  const down = (e: PointerEvent) => { startX = e.clientX; startY = e.clientY; moved = false; };
  const move = (e: PointerEvent) => { if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) moved = true; };
  const up = (e: PointerEvent) => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) { dx < 0 ? h.skip() : h.back(); return; }
    if (!moved && (e.target as HTMLElement).dataset.pauseTarget !== undefined) h.pause();
  };
  const key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') { e.preventDefault(); h.pause(); }
    else if (e.key === 'ArrowRight') h.skip();
    else if (e.key === 'ArrowLeft') h.back();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  window.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); window.removeEventListener('keydown', key);
  };
}
```

- [ ] Commit `"gestures: tap to pause, swipe to skip or go back, keys on desktop"`.

### Task 20: `prime()` in useLiveTranscription

**Files:** `hooks/useLiveTranscription.ts:253-292`

- [ ] **Step 1:** Add to the interface: `prime: (keywords: string[]) => void;`. Extract the `session.update` send from `beginTurn` into:

```ts
  const prime = useCallback((keywords: string[]) => {
    const dc = dcRef.current;
    if (dc?.readyState !== 'open' || !keywords.length) return;
    dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: { input: { transcription: {
          model: 'gpt-live-transcribe', delay: 'low', languages: ['en'],
          keywords: keywords.filter(k => k && !/[<>\r\n]/.test(k)).slice(0, 100).map(k => k.slice(0, 80)),
        }, turn_detection: null } },
      },
    }));
  }, []);
```

`beginTurn(hint?)` keeps its signature and calls `prime(hint.keywords)` when given, so existing callers (if any remain) still work. Return `prime` from the hook.

- [ ] **Step 2:** `npm run lint` and `npx tsc --noEmit -p .` clean. Commit `"useLiveTranscription: prime() so keywords go up when the partner starts"`.

### Task 21: useRehearsal.ts

**Files:** `hooks/useRehearsal.ts`

```ts
'use client';

/**
 * Wires the engine to the browser: audio player, line loader, the live
 * transcription session, the journal transport. Publishes one snapshot per
 * animation frame. It is the only hook the screen reads.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useLiveCapture } from '@/hooks/useLiveCapture';
import { useLiveTranscription, QUIET_AFTER_WORDS_MS } from '@/hooks/useLiveTranscription';
import type { JournalEvent, ScenePayload } from '@/lib/rehearsal/contract';
import { Engine, type Snapshot } from '@/lib/rehearsal/engine';
import { Journal } from '@/lib/rehearsal/journal';
import { buildScript } from '@/lib/rehearsal/script';
import { AudioPlayer } from '@/lib/rehearsal/browser/audio-player';
import { LineLoader } from '@/lib/rehearsal/browser/line-loader';

export type Readiness = { line1: boolean; mic: boolean; stt: boolean; error: string | null };

export interface Rehearsal {
  snapshot: Snapshot | null;
  readiness: Readiness;
  /** Call once the actor has chosen a part and voices. Starts loading. */
  prepare: (character: string, voices: Record<string, string>, opts?: { guided?: boolean; resumeLine?: number }) => Promise<void>;
  begin: () => void;
  pause: () => void; resume: () => void; skip: () => void; back: () => void; jumpTo: (line: number) => void;
  leave: () => void;
}

export function useRehearsal(payload: ScenePayload): Rehearsal {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [readiness, setReadiness] = useState<Readiness>({ line1: false, mic: false, stt: false, error: null });
  const engineRef = useRef<Engine | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const loaderRef = useRef<LineLoader | null>(null);
  const journalRef = useRef<Journal | null>(null);
  const runIdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const resumeLineRef = useRef<number | null>(null);

  const capture = useLiveCapture();
  const live = useLiveTranscription({ getStream: capture.getStream, keywords: payload.characters });

  const publish = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setSnapshot(engineRef.current?.snapshot() ?? null);
    });
  }, []);

  const transport = useMemo(() => ({
    send: async (events: JournalEvent[]) => {
      if (runIdRef.current === null) throw new Error('no run');
      await api.post(`/api/rehearsal/runs/${runIdRef.current}/events`, { events });
    },
    beacon: (events: JournalEvent[]) => {
      if (runIdRef.current === null || typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
      return navigator.sendBeacon(`/api/rehearsal/runs/${runIdRef.current}/events`, JSON.stringify({ events }));
    },
  }), []);

  const prepare = useCallback<Rehearsal['prepare']>(async (character, voices, opts) => {
    const player = playerRef.current ?? (playerRef.current = new AudioPlayer());
    const loader = loaderRef.current ?? (loaderRef.current = new LineLoader(player));
    const journal = journalRef.current ?? (journalRef.current = new Journal(transport));
    const script = buildScript(payload.lines, character);

    const engine = new Engine(script, {
      clock: { now: () => player.now(), outputLatency: () => player.outputLatency() },
      player: { duration: l => player.duration(l), play: (l, at) => player.play(l, at), stopAll: () => player.stopAll() },
      mic: { prime: k => live.prime(k), open: () => live.beginTurn(), close: () => live.endTurn() },
      journal: { emit: (type, line, at, p) => { journal.emit(type, line, at, p); void journal.flush(); } },
      schedule: (at, fn) => player.schedule(at, fn),
    });
    engine.subscribe(publish);
    engineRef.current = engine;
    loader.onReady = l => { engine.audioReady(l); if (l === firstPartnerLine) setReadiness(r => ({ ...r, line1: true })); };
    loader.onFailed = (_l, why) => setReadiness(r => ({ ...r, error: `A partner line could not load (${why}).` }));
    player.onInterrupted = () => engine.pause();
    resumeLineRef.current = opts?.resumeLine ?? null;

    // Audio slots: the payload carries character 1's partner lines; anything
    // else is asked for per line.
    const partnerLines = payload.lines.filter(l => l.character.trim().toLowerCase() !== character.trim().toLowerCase());
    const firstPartnerLine = partnerLines[0]?.index ?? -1;
    const isDefaultPick = JSON.stringify(voices) === JSON.stringify(payload.defaults[character] ?? {});
    const usePayloadAudio = isDefaultPick && Object.keys(payload.audio).length > 0
      && partnerLines.every(l => payload.audio[String(l.index)]);
    for (const l of partnerLines) {
      if (usePayloadAudio) loader.set(l.index, payload.audio[String(l.index)]);
      else {
        const voice = Object.entries(voices).find(([c]) => c.trim().toLowerCase() === l.character.trim().toLowerCase())?.[1] ?? payload.voices[0].id;
        const { data } = await api.post<{ key: string; url: string | null }>('/api/rehearsal/audio', { scene_id: payload.scene.id, line_index: l.index, voice });
        loader.set(l.index, data);
      }
    }

    const [runRes] = await Promise.all([
      api.post<{ run_id: number }>('/api/rehearsal/runs', { scene_id: payload.scene.id, character, voices, is_guided: !!opts?.guided }),
      live.open().then(() => setReadiness(r => ({ ...r, stt: true, mic: true }))).catch(e => setReadiness(r => ({ ...r, error: e instanceof Error ? e.message : 'The live microphone could not start.' }))),
      firstPartnerLine >= 0 ? loader.start(firstPartnerLine) : Promise.resolve().then(() => setReadiness(r => ({ ...r, line1: true }))),
    ]);
    runIdRef.current = runRes.data.run_id;
  }, [payload, live, publish, transport]);

  const begin = useCallback(() => {
    const engine = engineRef.current, player = playerRef.current;
    if (!engine || !player) return;
    player.unlock();
    engine.begin();
    if (resumeLineRef.current !== null) engine.jumpTo(resumeLineRef.current);
  }, []);

  // Transcript deltas and the quiet flag flow into the engine.
  useEffect(() => { if (live.transcript) engineRef.current?.delta(live.transcript); }, [live.transcript]);
  useEffect(() => { if (live.turnEnded) engineRef.current?.quiet(); }, [live.turnEnded]);
  useEffect(() => { if (live.status === 'error' && live.error) setReadiness(r => ({ ...r, error: live.error })); }, [live.status, live.error]);

  // Keep the loader ahead of the scene on every handover.
  useEffect(() => { if (snapshot) loaderRef.current?.ahead(snapshot.lineIndex); }, [snapshot?.lineIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the page: the journal goes out on a beacon.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') { engineRef.current?.pause(); journalRef.current?.beacon(); } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); };
  }, []);

  useEffect(() => () => { loaderRef.current?.stop(); playerRef.current?.close(); }, []);

  const leave = useCallback(() => { engineRef.current?.abandon(); journalRef.current?.beacon(); }, []);

  return {
    snapshot, readiness, prepare, begin,
    pause: () => engineRef.current?.pause(), resume: () => engineRef.current?.resume(),
    skip: () => engineRef.current?.skip(), back: () => engineRef.current?.back(),
    jumpTo: l => engineRef.current?.jumpTo(l), leave,
  };
}
```

`QUIET_AFTER_WORDS_MS` is referenced only so the import documents where the quiet rule lives; remove the import if lint complains about it being unused.

- [ ] `npx tsc --noEmit -p .` clean. Commit `"useRehearsal: the engine wired to the browser, one snapshot per frame"`.

---

## Phase 4: The screen

### Task 22: CSS for the sides

**Files:** `app/globals.css` — replace the whole `.theatre-rehearsal { ... }` block (line ~7511 to the closing brace at ~7540) and the `.dark .theatre-rehearsal { ... }` block that follows it.

```css
/* ScenePartner v2: the sides, and nothing else. See the spec's visual
   direction. Light is a rehearsal room in daylight; dark is the house at
   half-light with one lamp on the page. Nothing moves but the script. */
.theatre-rehearsal {
  --t-paper: var(--t-sheet);
  --t-ink: oklch(0.16 0.01 45);
  --t-text-soft: oklch(0.48 0.012 50);      /* a word not yet heard */
  --t-cue-theirs: oklch(0.42 0.02 60);      /* the partner's lines */
  --t-direction: oklch(0.58 0.015 60);
  --r-pool: transparent;                    /* the lamp; only in dark */
  --r-script-size: 1.125rem;
  --r-script-lead: 1.6;
  background: var(--t-paper);
  color: var(--t-ink);
  min-height: 100dvh;
}
@media (min-width: 640px) { .theatre-rehearsal { --r-script-size: 1.1875rem; } }

.dark .theatre-rehearsal {
  --t-paper: var(--t-house);
  --t-ink: oklch(0.95 0.02 85);
  --t-text-soft: oklch(0.62 0.02 80);
  --t-cue-theirs: oklch(0.72 0.02 78);
  --t-direction: oklch(0.6 0.02 78);
  --r-pool: radial-gradient(60% 45% at 50% 42%, oklch(0.27 0.03 75) 0%, oklch(0.20 0.025 72) 55%, var(--t-house) 100%);
  background: var(--r-pool), var(--t-house);
}

.r-script { font-family: var(--font-typewriter), "Courier New", Courier, monospace; font-size: var(--r-script-size); line-height: var(--r-script-lead); }
.r-chrome { font-family: var(--t-body); }
.r-title { font-family: var(--t-display); }

.r-word { color: var(--t-text-soft); transition: color 120ms ease-out, font-weight 120ms ease-out; }
.r-word[data-heard="true"] { color: var(--t-ink); font-weight: 700; }
.r-line--theirs { color: var(--t-cue-theirs); }
.r-line--mine { color: var(--t-ink); }
.r-direction { color: var(--t-direction); font-style: italic; }
.r-cue { color: var(--t-direction); letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.8em; }

.r-begin { color: var(--t-text-soft); transition: color 200ms ease-out; }
.r-begin[data-ready="true"] { color: var(--t-ink); }

.r-dim { opacity: 0.55; transition: opacity 180ms ease-out; }
```

Check `--font-typewriter` is the variable `typewriterFontVar` sets (it is, per `lib/fonts/theatre.ts`). The page wraps in `theatre-tokens theatre-rehearsal ${theatreFontVars} ${typewriterFontVar}`.

- [ ] Commit `"The rehearsal page's palette: paper by day, one lamp by night"`.

### Task 23: Components

Delete the old `app/(platform)/scenes/[id]/rehearse/page.tsx` first (`git rm`). Then create, each file under its budget:

**`page.tsx`** (60)

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { theatreFontVars, typewriterFontVar } from '@/lib/fonts/theatre';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { RehearseScreen } from './RehearseScreen';

export default function RehearsePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const guided = search.get('guided') === '1';
  const [payload, setPayload] = useState<ScenePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<ScenePayload>(`/api/rehearsal/scenes/${id}`)
      .then(r => { if (alive) setPayload(r.data); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'This scene could not be opened.'); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div className={`theatre-tokens theatre-rehearsal ${theatreFontVars} ${typewriterFontVar}`}>
      {error && <p className="r-chrome mx-auto max-w-prose px-4 py-16">{error}</p>}
      {payload && <RehearseScreen payload={payload} guided={guided} />}
    </div>
  );
}
```

No skeleton, no spinner: the page is paper until the script is there (a few hundred ms).

**`RehearseScreen.tsx`** (150)

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRehearsal } from '@/hooks/useRehearsal';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { bindGestures } from '@/lib/rehearsal/browser/gestures';
import { Curtain } from './Curtain';
import { Stage } from './Stage';
import { PauseSheet } from './PauseSheet';
import { Ending } from './Ending';
import { FirstRunHint } from './FirstRunHint';

const GUIDED_CHARACTER = 'ALEX';

export function RehearseScreen({ payload, guided }: { payload: ScenePayload; guided: boolean }) {
  const router = useRouter();
  const r = useRehearsal(payload);
  const [phase, setPhase] = useState<'curtain' | 'run'>('curtain');
  const rootRef = useRef<HTMLDivElement>(null);
  const state = r.snapshot?.state ?? 'ready';

  const ready = r.readiness.line1 && r.readiness.stt && !r.readiness.error;

  const onChoose = useCallback(async (character: string, voices: Record<string, string>, resumeLine?: number) => {
    await r.prepare(character, voices, { guided, resumeLine });
  }, [r, guided]);

  // Guided: the part is fixed and the Curtain is skipped. The Begin tap is
  // still the actor's (iOS needs a gesture to unlock audio), so the Curtain
  // shows only the title and Begin.
  useEffect(() => {
    if (guided) void onChoose(GUIDED_CHARACTER, payload.defaults[GUIDED_CHARACTER] ?? {});
  }, [guided]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = () => { r.begin(); setPhase('run'); };

  useEffect(() => {
    const el = rootRef.current;
    if (!el || phase !== 'run') return;
    return bindGestures(el, {
      pause: () => (state === 'paused' ? r.resume() : r.pause()),
      skip: r.skip, back: r.back,
    });
  }, [phase, state, r]);

  const leave = () => { r.leave(); router.push('/practice'); };
  const again = () => router.refresh();

  if (phase === 'curtain') {
    return (
      <Curtain payload={payload} guided={guided} guidedCharacter={GUIDED_CHARACTER} ready={ready}
        error={r.readiness.error} onChoose={onChoose} onBegin={begin} />
    );
  }

  return (
    <div ref={rootRef} className="relative min-h-dvh" data-pause-target>
      <Stage lines={payload.lines} actor={r.snapshot ? payload.lines[r.snapshot.lineIndex]?.character : ''}
        actorName={guided ? GUIDED_CHARACTER : (r.snapshot ? scriptActor(payload, r.snapshot.lineIndex, r) : '')}
        snapshot={r.snapshot} dimmed={state === 'paused'} onTapLine={r.jumpTo} />
      {state === 'paused' && <PauseSheet onResume={r.resume} onRestart={() => r.jumpTo(0)} onLeave={leave} />}
      {state === 'ended' && <Ending scene={payload.scene} onAgain={again} onLeave={leave} />}
      {r.readiness.error && <p className="r-chrome fixed inset-x-0 bottom-0 p-4 text-center">{r.readiness.error}</p>}
      <FirstRunHint />
    </div>
  );
}

/** The actor's part is whatever `prepare` was called with; keep it on the hook
 *  rather than re-deriving. Small helper so Stage can colour lines. */
function scriptActor(payload: ScenePayload, _line: number, r: ReturnType<typeof useRehearsal>) {
  return r.snapshot?.actor ?? '';
}
```

Add `actor: string` to the engine `Snapshot` (the script's actor) so `scriptActor` reads it; then delete the helper and pass `actorName={r.snapshot?.actor ?? ''}`. (Do this in the engine with a one-line change and a test assertion `expect(engine.snapshot().actor).toBe('ANNA')`.)

**`Curtain.tsx`** (100)

```tsx
'use client';

import { useState } from 'react';
import type { ScenePayload } from '@/lib/rehearsal/contract';

interface Props {
  payload: ScenePayload; guided: boolean; guidedCharacter: string; ready: boolean; error: string | null;
  onChoose: (character: string, voices: Record<string, string>, resumeLine?: number) => Promise<void>;
  onBegin: () => void;
}

export function Curtain({ payload, guided, guidedCharacter, ready, error, onChoose, onBegin }: Props) {
  const [character, setCharacter] = useState<string | null>(guided ? guidedCharacter : null);
  const [voices, setVoices] = useState<Record<string, string>>(guided ? payload.defaults[guidedCharacter] ?? {} : {});
  const partners = character ? payload.characters.filter(c => c !== character) : [];
  const resume = payload.resume;

  const choose = async (c: string, resumeLine?: number) => {
    const v = payload.defaults[c] ?? {};
    setCharacter(c); setVoices(v);
    await onChoose(c, v, resumeLine);
  };
  const setVoice = async (partner: string, id: string) => {
    if (!character) return;
    const v = { ...voices, [partner]: id };
    setVoices(v);
    await onChoose(character, v);
  };

  return (
    <main className="r-chrome mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm opacity-70">{payload.scene.play_title}</p>
      <h1 className="r-title mt-1 text-4xl leading-tight">{payload.scene.title}</h1>

      {!guided && (
        <ul className="mt-10 space-y-3 text-lg">
          {payload.characters.map(c => (
            <li key={c}>
              <button type="button" onClick={() => choose(c)} className="text-left"
                style={{ opacity: character && character !== c ? 0.4 : 1 }}>
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}

      {character && !guided && partners.map(p => (
        <div key={p} className="mt-4 text-sm">
          <span className="opacity-70">{p} is read by </span>
          <select value={voices[p] ?? ''} onChange={e => setVoice(p, e.target.value)} className="bg-transparent underline">
            {payload.voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
      ))}

      {character && resume && !guided && (
        <button type="button" className="mt-6 text-left text-sm underline" onClick={() => choose(character, resume.line_index)}>
          Pick up at line {resume.line_index + 1}
        </button>
      )}

      {error && <p className="mt-8 text-sm">{error}</p>}

      <button type="button" className="r-begin mt-12 self-start text-2xl" data-ready={ready}
        disabled={!ready || !character} onClick={onBegin}>
        Begin
      </button>
    </main>
  );
}
```

**`Stage.tsx`** (150) — holds the current word at the eye line; text moves under it.

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import type { Snapshot } from '@/lib/rehearsal/engine';
import { Line } from './Line';

interface Props {
  lines: RehearsalLine[]; actorName: string; snapshot: Snapshot | null; dimmed: boolean;
  onTapLine: (index: number) => void;
}

/** Fraction of the viewport height where the live line is held. */
const EYE_LINE = 0.42;

export function Stage({ lines, actorName, snapshot, dimmed, onTapLine }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const current = snapshot?.lineIndex ?? 0;

  // Keep the current line at the eye line. The scroll is the only motion on
  // the page; it is a spring so a long line that wraps does not jump.
  useEffect(() => {
    const el = scroller.current;
    const target = el?.querySelector<HTMLElement>(`[data-line="${current}"]`);
    if (!el || !target) return;
    const word = target.querySelector<HTMLElement>('[data-heard="false"]') ?? target;
    const top = word.getBoundingClientRect().top + el.scrollTop - el.getBoundingClientRect().top;
    el.scrollTo({ top: top - el.clientHeight * EYE_LINE, behavior: 'smooth' });
  }, [current, snapshot?.read.matched.size]);

  return (
    <div ref={scroller} className={`r-script h-dvh overflow-y-auto px-5 ${dimmed ? 'r-dim' : ''}`} data-pause-target>
      <div style={{ height: `${EYE_LINE * 100}vh` }} data-pause-target />
      <motion.ol layout className="mx-auto max-w-prose space-y-6" transition={{ type: 'spring', stiffness: 170, damping: 26 }}>
        {lines.map(line => {
          const mine = line.character.trim().toLowerCase() === actorName.trim().toLowerCase();
          const live = snapshot?.lineIndex === line.index;
          const heard = mine
            ? (live ? snapshot!.read.matched : (snapshot?.heard.get(line.index) ?? new Set<number>()))
            : undefined;
          return (
            <Line key={line.index} line={line} mine={mine} live={live} heard={heard}
              sounding={snapshot?.sounding === line.index} onTap={() => onTapLine(line.index)} />
          );
        })}
      </motion.ol>
      <div style={{ height: `${(1 - EYE_LINE) * 100}vh` }} data-pause-target />
    </div>
  );
}
```

**`Line.tsx`** (80)

```tsx
'use client';

import { lineWords } from '@/lib/live-read';
import type { RehearsalLine } from '@/lib/rehearsal/contract';

interface Props {
  line: RehearsalLine; mine: boolean; live: boolean; sounding: boolean;
  /** For the actor's lines: indices of words heard. Undefined for partner lines. */
  heard?: Set<number>;
  onTap: () => void;
}

/** The display words, aligned to the matcher's tokens: one span per token, so
 *  a heard index lights the word the actor actually said. Punctuation stays
 *  attached to its word. */
function displayWords(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.split(/\s+/).filter(Boolean)) {
    const n = lineWords(chunk).length;
    if (n <= 1) out.push(chunk);
    else {
      // "Twenty-four" is two tokens; split on the hyphen so both can light.
      const parts = chunk.split(/(?<=[-‐–—])/);
      if (parts.length === n) out.push(...parts); else out.push(chunk, ...Array(n - 1).fill(''));
    }
  }
  return out;
}

export function Line({ line, mine, live, sounding, heard, onTap }: Props) {
  const words = displayWords(line.text);
  return (
    <li data-line={line.index} onClick={onTap} className={mine ? 'r-line--mine' : 'r-line--theirs'}
      style={{ opacity: !mine && !sounding && !live ? 0.8 : 1 }}>
      <div className="r-cue">{line.character}</div>
      {line.direction && <div className="r-direction">{line.direction}</div>}
      <p>
        {words.map((w, i) => (
          <span key={i} className={mine ? 'r-word' : undefined}
            data-heard={mine ? String(heard?.has(i) ?? false) : undefined}>
            {w}{i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
    </li>
  );
}
```

Add `lib/rehearsal/display-words.test.ts` pinning `displayWords("Twenty-four, and I've been.")` → `['Twenty-', 'four,', 'and', "I've", 'been.']` and move `displayWords` to `lib/rehearsal/display-words.ts` so it is pure and tested.

**`PauseSheet.tsx`** (80)

```tsx
'use client';

import { motion } from 'framer-motion';

export function PauseSheet({ onResume, onRestart, onLeave }: { onResume: () => void; onRestart: () => void; onLeave: () => void }) {
  return (
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.18 }}
      className="r-chrome fixed inset-x-0 bottom-0 mx-auto max-w-md px-6 pb-10 pt-6 text-lg"
      style={{ background: 'var(--t-paper)' }}>
      <button type="button" className="block py-2" onClick={onResume}>Resume</button>
      <button type="button" className="block py-2" onClick={onRestart}>Start over</button>
      <button type="button" className="block py-2" onClick={onLeave}>Leave</button>
    </motion.div>
  );
}
```

**`Ending.tsx`** (80)

```tsx
'use client';

import { motion } from 'framer-motion';
import type { ScenePayload } from '@/lib/rehearsal/contract';

export function Ending({ scene, onAgain, onLeave }: { scene: ScenePayload['scene']; onAgain: () => void; onLeave: () => void }) {
  const where = [scene.act, scene.scene_number ? `Scene ${scene.scene_number}` : null].filter(Boolean).join(', ');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.6 }}
      className="r-chrome fixed inset-x-0 bottom-0 mx-auto max-w-md px-6 pb-12 pt-6" style={{ background: 'var(--t-paper)' }}>
      <p className="text-lg">{where ? `${where}. ` : ''}Full run.</p>
      <div className="mt-4 flex gap-6 text-lg">
        <button type="button" onClick={onAgain}>Again</button>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>
    </motion.div>
  );
}
```

**`FirstRunHint.tsx`** (50)

```tsx
'use client';

import { useEffect, useState } from 'react';

const KEY = 'actorrise.rehearsal.hint.v2';

export function FirstRunHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) { setShow(true); localStorage.setItem(KEY, '1'); } } catch { /* private mode */ }
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <p className="r-chrome pointer-events-none fixed inset-x-0 top-4 text-center text-sm opacity-70">
      Tap to pause. Swipe left to skip your line, right to take it again.
    </p>
  );
}
```

- [ ] `npx tsc --noEmit -p .` and `npm run lint` clean. Commit `"The rehearsal screen: Curtain, Stage, pause, ending"`.

### Task 24: Rewire every entrance; delete what the old page carried

- [ ] **Step 1:** `components/practice/GuidedInvitation.tsx:74-164`: replace the `rehearse/guided` + `start-guided` calls with `api.get<{scene_id:number}>('/api/rehearsal/guided')` for the prefetch and `router.push(\`/scenes/${scene_id}/rehearse?guided=1\`)` on Answer. No `session=` param.
- [ ] **Step 2:** `app/(platform)/practice/[id]/scenes/[sceneId]/page.tsx:229-252`: the `rehearse` callback becomes `router.push(\`/scenes/${scene.id}/rehearse\`)`. Delete the `/api/scenes/rehearse/start` call and the `voice` param.
- [ ] **Step 3:** `grep -rn "rehearse?session=\|/api/scenes/rehearse\|resumable-session\|start-guided" app components lib hooks` must return nothing. Fix each hit the same way (plain link to `/scenes/{id}/rehearse`).
- [ ] **Step 4:** Delete `hooks/useOpenAITTS.ts`, `hooks/useSpeechRecognition.ts` (the fallback the brief forbids), and `lib/scene-voice.ts` + `lib/scene-voice.test.ts` after `grep -rn "useOpenAITTS\|useSpeechRecognition\|scene-voice" app components lib hooks` shows no other user. If `useSpeechRecognition` is used by the monologue /work page, leave it and note it in the commit message.
- [ ] **Step 5:** Any component reading `/api/scenes/rehearse/stats` or `/sessions` (grep found none outside the deleted page; re-check) moves to `/api/rehearsal/stats` and `/api/rehearsal/runs`.
- [ ] **Step 6:** `npx tsc --noEmit -p .`, `npm run lint`, `npm test` all clean. Commit `"Every door into rehearsal leads to the new screen; the old page and the fallback are gone"`.

---

## Phase 5: Verification and release

### Task 25: Latency doc and lab harness

**Files:** Create `docs/rehearsal-latency.md`

```markdown
# Measuring the handover

## In production
Every `actor_line_read` event carries `handover_ms` (last delta → partner
scheduled) and `output_latency_ms`. Query:

    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (payload->>'handover_ms')::int) AS p50,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY (payload->>'handover_ms')::int) AS p95
    FROM rehearsal_events WHERE type = 'actor_line_read' AND received_at > now() - interval '7 days';

Budget: p95 under 50ms wired. Bluetooth shows up as `output_latency_ms` > 100.

## In the lab (the vendor floor)
1. Record a take of "Out. Twenty-four hours." as `take.wav` (48k mono) and note the
   true end time of "hours" with Audacity: `END_S`.
2. Launch Chrome:
   `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=take.wav --use-fake-ui-for-media-stream`
3. Open a scene whose first actor line is that text; press Begin at a known
   `performance.now()` (log it from the console: `performance.now()`).
4. In the console, read the engine marks the hook exposes on `window.__rehearsal`
   (add `window.__rehearsal = engine` behind `process.env.NODE_ENV !== 'production'` in useRehearsal).
   Word-end → partner-start = `timeline.get('partner_scheduled') - (beginAudioTime + END_S)`.
5. Repeat with a 200-word first line. `handover_ms` must match within 5ms.
```

- [ ] Commit `"How the handover is measured, in prod and in the lab"`.

### Task 26: Release order (do these in this order, on prod)

1. Supabase: create private bucket `partner-lines` (Dashboard → Storage → New bucket, public OFF).
2. Render env: `PARTNER_TTS_VENDOR` (openai until Canberk picks), `ELEVENLABS_API_KEY` if elevenlabs, `PARTNER_AUDIO_BUCKET=partner-lines`.
3. `cd backend && uv run python scripts/add_rehearsal_v2_tables.py` against prod (see memory: deploy ordering, schema first).
4. `uv run python scripts/warm_partner_audio.py --limit 5`, open one of those scenes locally against prod, confirm `audio[...]` URLs are non-null, then run without `--limit` (this costs TTS money once: count characters first with a dry-run print if Canberk wants a number).
5. Merge `feat/scenepartner-v2` to main, push. Render deploys the backend, Vercel the frontend.
6. Canberk tests on prod: phone (Safari, wired and AirPods) and desktop. The guided first scene from /practice as a new account.
7. Watch `handover_ms` p95 for a day with the query in `docs/rehearsal-latency.md`.

---

## Self-review

- **Spec coverage:** decisions 1–10 → Tasks 23 (text + word spans), 19/23 (gestures), 4/9/23 (voices), 5 (direction-driven), 7/16 (ending + per-line read in journal), 7/9/23 (resume), 9/23 (guided flag, same loop), 10/12 (old table read-only, trial rule), 8/12 (scenes.py scope), 3/4 (third characters). Latency budget → 16 (engine timing), 17 (clock), 20 (prime at partner start), 25 (measurement). Data model → 2. API → 9, 11. Frontend tree → 13–23. Visual direction → 22, 23. Error handling → 21 (STT error stops with one line; cold line holds; beacon on hide; interruption pauses), 23 (mic denied shows on Curtain). Testing → every task.
- **Known gap, deliberate:** `GET /scenes/{id}` carries audio only for character 1's partner lines; any other pick asks per line via `POST /audio`. That is one request per partner line before Begin, not in the loop. Acceptable for v2.
- **Type consistency:** `Snapshot.actor` is added in Task 23 and must be added to `engine.ts` (`actor: this.script.actor`) with a test. `JournalEvent`, `EventType` are defined in `contract.ts` and used by `journal.ts`, `engine.ts`, `useRehearsal.ts`. `LineSource` matches the `{key, url}` shape the API returns. `prime` is added to `LiveTranscription` in Task 20 and used in Task 21.
