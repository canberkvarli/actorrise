# Self-Tape Audition Mode — Design Document

**Date:** 2026-03-15
**Status:** Approved
**Author:** Canberk + Claude

---

## Overview

A self-tape recording feature where actors can record audition tapes directly in the browser, get AI-powered feedback on their performance, download their recordings, and (on higher tiers) save tapes to a cloud library with shareable links.

Self-tapes are the industry standard for auditions. This feature turns ActorRise from a rehearsal tool into a complete audition workflow platform.

---

## Tier Structure

| Feature | Free | Solo ($7) | Plus ($12) | Pro ($24) |
|---|---|---|---|---|
| Record (unlimited) | Yes | Yes | Yes | Yes |
| Watch back | Yes | Yes | Yes | Yes |
| Download | Yes | Yes | Yes | Yes |
| AI Feedback | 1/month | 10/month | 30/month | 60/month |
| Save to Library | No | No | 15 tapes | 50 tapes |
| Share via Link | No | No | No | Yes |

### Cost Analysis Per Tier (max per user/month)

- **Free:** ~$0.05 (1 AI call)
- **Solo:** ~$0.50 (10 AI calls)
- **Plus:** ~$1.80 (30 AI calls + ~1.5GB storage)
- **Pro:** ~$4.00 (60 AI calls + ~5GB storage)

### Cost Breakdown Per AI Feedback

- Whisper STT: ~$0.006/min
- GPT-4o vision (5 frames): ~$0.03-0.05
- GPT-4o-mini text analysis: ~$0.001
- **Total per analysis: ~$0.04-0.06**

---

## User Flows

### Flow 1: Recording (All Tiers)

1. User navigates to `/audition`
2. Camera preview loads (front-facing default)
3. Optional: select a monologue or script from their library to display as reference text alongside the camera
4. User taps Record → timer starts
5. User taps Stop → recording ends
6. Post-recording screen shows:
   - Video playback
   - **Re-record** button
   - **Download** button (saves .webm/.mp4 to device)
   - **Get AI Feedback** button (shows remaining count, or upgrade prompt if at limit)
   - **Save to Library** button (Plus/Pro only, or upgrade prompt)

Recording happens entirely in the browser via MediaRecorder API. No server cost.

### Flow 2: AI Feedback (Tiered Limits)

1. User clicks "Get AI Feedback"
2. System checks remaining feedback count for the month
3. If available:
   - Extract audio from video → send to Whisper for transcription
   - Sample 5 evenly-spaced frames from video → send to GPT-4o vision
   - Compare transcription against selected monologue/script text (if any)
   - GPT-4o-mini generates comprehensive feedback
4. Feedback card appears alongside video:
   - **Overall Rating:** 1-5 stars
   - **Line Accuracy:** missed/added/changed lines (if monologue selected)
   - **Pacing & Timing:** too fast, too slow, well-paced
   - **Emotional Tone:** detected emotions vs. expected
   - **Framing & Lighting:** camera position, lighting quality, background
   - **Eye Contact:** where the actor is looking
   - **Actionable Tips:** 2-3 specific improvements
5. Remaining feedback count decrements

If at limit → show upgrade modal with comparison of tiers.

### Flow 3: Save to Library (Plus/Pro)

1. User clicks "Save to Library"
2. System checks tape count against tier limit
3. If available:
   - Video uploads to Supabase Storage
   - User can add title and optional notes
   - Tape appears in `/my-tapes` library
4. If at limit → show message: "You've saved 15/15 tapes. Delete one or upgrade to Pro for 50 tapes."

### Flow 4: Tape Library (Plus/Pro) — `/my-tapes`

1. Grid view of saved tapes
2. Each card shows: thumbnail (first frame), title, date, duration
3. Click to open: full playback, AI feedback (if previously generated), download
4. Actions: rename, delete, share (Pro only)
5. Storage indicator: "12/15 tapes saved" or "34/50 tapes saved"

### Flow 5: Share via Link (Pro Only)

1. From tape library, Pro user clicks "Share"
2. System generates a public URL: `actorrise.com/tape/[uuid]`
3. User can copy link
4. Public page shows:
   - Clean video player
   - Tape title
   - "Recorded on ActorRise" subtle branding
   - No login required to view

---

## Pages & Routes

| Route | Description | Access |
|---|---|---|
| `/audition` | Recording studio page | All authenticated users |
| `/my-tapes` | Saved tape library | Plus/Pro (others see upgrade prompt) |
| `/tape/[id]` | Public share page | Anyone with link (no auth) |

---

## Technical Architecture

### Frontend

- **Recording:** Browser MediaRecorder API with getUserMedia
- **Video format:** WebM (native browser format), with optional client-side conversion to MP4 for download compatibility
- **Camera:** Front-facing default, toggle to switch
- **Framework:** Next.js pages within existing `app/(platform)/` structure
- **State:** React state for recording flow, React Query for library data

### Backend API Endpoints

```
POST /api/audition/analyze
  - Input: video file (multipart) + optional monologue_id/script_id
  - Process: extract audio, transcribe, sample frames, generate feedback
  - Output: { rating, line_accuracy, pacing, emotion, framing, tips }
  - Rate limited by tier

POST /api/tapes
  - Input: video file + title + notes
  - Process: upload to Supabase Storage, create DB record
  - Output: tape object with ID
  - Limited by tier tape count

GET /api/tapes
  - Output: list of user's saved tapes

GET /api/tapes/:id
  - Output: single tape with metadata + signed video URL

DELETE /api/tapes/:id
  - Deletes from storage and DB

GET /api/tapes/:id/share
  - Output: public share URL (Pro only)

GET /api/public/tape/:uuid
  - Output: public tape data + unsigned video URL (no auth required)
```

### Database (new table)

```sql
CREATE TABLE user_tapes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255),
    notes TEXT,
    duration_seconds INTEGER,
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT,
    share_uuid UUID UNIQUE DEFAULT gen_random_uuid(),
    is_shared BOOLEAN DEFAULT FALSE,
    monologue_id UUID REFERENCES monologues(id),
    script_id UUID REFERENCES user_scripts(id),
    ai_feedback JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_tapes_user_id ON user_tapes(user_id);
CREATE INDEX idx_user_tapes_share_uuid ON user_tapes(share_uuid);
```

### Storage

- **Provider:** Supabase Storage
- **Bucket:** `user-tapes` (private by default)
- **Path pattern:** `{user_id}/{tape_id}.webm`
- **Public access:** Via signed URLs (private tapes) or public URLs (shared tapes)
- **Cleanup:** When tape is deleted, remove from storage too

### AI Feedback Pipeline

```
Video File
  ├── Extract Audio → Whisper STT → Transcription
  ├── Sample 5 Frames → GPT-4o Vision → Visual Analysis
  └── Combine All → GPT-4o-mini → Structured Feedback JSON
```

### Usage Tracking

Add to existing `usage_metrics` or create new tracking:
- `ai_feedback_count` per user per month
- `saved_tapes_count` per user (running total)
- Reset feedback count on billing cycle

---

## UI Design Direction

- **Aesthetic:** Cinematic, dark theme — like a professional recording studio
- **Camera preview:** Large, centered, with subtle vignette overlay
- **Controls:** Minimal, floating over the video — think iPhone camera app simplicity
- **Feedback panel:** Slides in from the right, card-based with clear sections
- **Library:** Grid of tapes with hover-to-preview (like Netflix thumbnails)
- **Share page:** Ultra-clean, single video player, white background, professional

---

## Conversion Psychology

1. **Free users** record unlimited takes → get hooked on the flow
2. They use their 1 AI feedback → see the value immediately
3. Next recording session, they want feedback again → upgrade prompt
4. **Solo users** get comfortable with 10 feedbacks/month
5. They want to save their best takes → upgrade to Plus
6. **Plus users** build a library, want to share with casting directors → upgrade to Pro

Each tier creates a natural desire for the next tier's feature.

---

## Out of Scope (Future)

- Teleprompter scroll mode
- Side-by-side comparison of multiple takes
- Video trimming/editing
- Password-protected share links
- Collaborative feedback (casting directors leaving notes)
- Video watermarking
