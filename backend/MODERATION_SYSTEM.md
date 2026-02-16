# ActorRise Moderation System

## Overview

Complete AI-assisted moderation system for user-submitted monologues with automatic approval/rejection and email notifications via Resend.

**Status:** ✅ Phase 3 Complete

---

## Architecture

### Workflow

```
User Submission
    ↓
AI Moderation (Quality + Copyright)
    ↓
    ├─→ Auto-Approve (High quality + Public domain)
    ├─→ Manual Review (Uncertain)
    └─→ Auto-Reject (Copyright/Quality issues)
    ↓
Email Notification (Resend)
```

### Components

1. **Database Schema** (`MonologueSubmission`, `ModerationLog`)
2. **AI Services** (Copyright detection, Content moderation)
3. **API Endpoints** (User submissions, Admin moderation queue)
4. **Email Notifications** (Resend + Jinja2 templates)

---

## Database Schema

### Tables Created

#### `monologue_submissions`
Tracks all user submissions with moderation workflow.

```sql
CREATE TABLE monologue_submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    monologue_id INTEGER REFERENCES monologues(id),

    -- Submission data
    submitted_title VARCHAR,
    submitted_text TEXT,
    submitted_character VARCHAR,
    submitted_play_title VARCHAR,
    submitted_author VARCHAR,
    user_notes TEXT,

    -- Moderation
    status VARCHAR,  -- 'pending', 'ai_review', 'manual_review', 'approved', 'rejected'
    ai_quality_score FLOAT,
    ai_copyright_risk VARCHAR,  -- 'low', 'medium', 'high'
    ai_flags JSONB,

    -- Manual review
    reviewer_id INTEGER REFERENCES users(id),
    reviewer_notes TEXT,

    -- Timestamps
    submitted_at TIMESTAMP,
    processed_at TIMESTAMP
);
```

#### `moderation_logs`
Audit trail of all moderation decisions.

```sql
CREATE TABLE moderation_logs (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER REFERENCES monologue_submissions(id),
    action VARCHAR,  -- 'ai_analysis', 'auto_approve', 'manual_approve', etc.
    actor_type VARCHAR,  -- 'ai' or 'moderator'
    actor_id INTEGER REFERENCES users(id),

    previous_status VARCHAR,
    new_status VARCHAR,
    reason TEXT,
    metadata JSONB,

    created_at TIMESTAMP
);
```

#### User Moderation Fields
Added to `users` table:

```sql
ALTER TABLE users ADD COLUMN is_moderator BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN can_approve_submissions BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
```

### Migration Script

**File:** `/backend/scripts/add_moderation_schema.py`

```bash
uv run python scripts/add_moderation_schema.py
```

✅ Successfully ran - all tables and indexes created

---

## AI Moderation Services

### 1. Copyright Detector

**File:** `/backend/app/services/ai/copyright_detector.py`

**Features:**
- Known playwright database (public domain vs copyrighted)
- Publication year estimation
- Conservative risk assessment
- Three risk levels: low, medium, high

**Risk Categories:**
- **Low:** Pre-1928 works, classical playwrights (Shakespeare, Chekhov, etc.)
- **Medium:** Unknown authors, mid-20th century works (requires manual review)
- **High:** Contemporary playwrights (Lin-Manuel Miranda, Tony Kushner, etc.)

**Example:**
```python
from app.services.ai.copyright_detector import CopyrightDetector

detector = CopyrightDetector()
result = detector.check(
    text="To be or not to be...",
    author="William Shakespeare",
    play_title="Hamlet"
)
# Returns: {'risk': 'low', 'reason': 'Classical playwright (public domain)', ...}
```

### 2. Content Moderator

**File:** `/backend/app/services/ai/content_moderation.py`

**Features:**
- Quality assessment (AI-powered)
- Spam detection
- Duplicate checking (90% similarity threshold)
- Decision engine (auto-approve/reject/manual review)

**Quality Checks:**
- Length validation (30-1000 words)
- AI analysis completeness
- Formatting quality

**Example:**
```python
from app.services.ai.content_moderation import ContentModerator

moderator = ContentModerator()
result = await moderator.moderate_submission(
    text="...",
    title="Hamlet's Soliloquy",
    character="Hamlet",
    play_title="Hamlet",
    author="Shakespeare",
    user_notes="From Act 3, Scene 1",
    db=db_session
)
# Returns: {
#     'recommendation': 'auto_approve',  # or 'manual_review' or 'auto_reject'
#     'quality_score': 0.85,
#     'copyright_risk': 'low',
#     'flags': {},
#     'notes': '...'
# }
```

---

## API Endpoints

### User Endpoints

#### POST `/api/monologues/submit`
Submit a monologue for moderation review.

**Request:**
```json
{
  "title": "Hamlet's Soliloquy",
  "character_name": "Hamlet",
  "text": "To be or not to be...",
  "play_title": "Hamlet",
  "author": "William Shakespeare",
  "notes": "Act 3, Scene 1"
}
```

**Response (Auto-Approved):**
```json
{
  "success": true,
  "status": "approved",
  "message": "Your submission has been automatically approved!",
  "submission_id": 123
}
```

**Response (Manual Review):**
```json
{
  "success": true,
  "status": "manual_review",
  "message": "Your submission is under review. You will receive an email when a decision is made.",
  "submission_id": 123,
  "estimated_review_time": "24-48 hours"
}
```

#### GET `/api/monologues/my-submissions`
Get current user's submission history.

**Response:**
```json
[
  {
    "id": 123,
    "title": "Hamlet's Soliloquy",
    "status": "approved",
    "submitted_at": "2025-02-16T12:00:00Z",
    "processed_at": "2025-02-16T12:05:00Z",
    "monologue_id": 456
  }
]
```

### Admin Endpoints

#### GET `/api/admin/moderation/queue`
Get submissions pending moderation (moderators only).

**Query Params:**
- `status`: Filter by status (default: 'manual_review')
- `limit`: Max results (default: 50)
- `offset`: Pagination offset

#### GET `/api/admin/moderation/queue/stats`
Get moderation queue statistics.

**Response:**
```json
{
  "pending": 5,
  "ai_review": 2,
  "manual_review": 10,
  "approved_today": 15,
  "rejected_today": 3
}
```

#### POST `/api/admin/moderation/{submission_id}/approve`
Approve a submission (creates Play + Monologue).

**Request:**
```json
{
  "notes": "Well-formatted classic monologue"
}
```

#### POST `/api/admin/moderation/{submission_id}/reject`
Reject a submission.

**Request:**
```json
{
  "reason": "copyright",
  "details": "This work is still under copyright protection"
}
```

#### GET `/api/admin/moderation/{submission_id}/logs`
Get moderation history for a submission.

---

## Email Notifications

### Resend Integration

**Setup:**
1. Set environment variable: `RESEND_API_KEY=re_xxxxx`
2. Verify domain in Resend dashboard: `actorrise.com`
3. Add sender: `notifications@actorrise.com`

**Files:**
- `/backend/app/services/email/resend_client.py` - Resend API client
- `/backend/app/services/email/templates.py` - Jinja2 template renderer
- `/backend/app/services/email/notifications.py` - Helper functions

### Email Templates

All templates in `/backend/app/services/email/templates/`:

1. **submission_received.html** - Submission confirmation
2. **submission_approved.html** - Approval notification with monologue link
3. **submission_rejected.html** - Rejection with reason and next steps
4. **submission_under_review.html** - Manual review notification

**Design:** Professional, responsive HTML with ActorRise branding (purple gradient header)

### Sending Emails

```python
from app.services.email.notifications import send_submission_notification

# Send approval email
send_submission_notification(
    user_email="actor@example.com",
    user_name="John",
    status="approved",
    monologue_title="Hamlet's Soliloquy",
    monologue_url="https://actorrise.com/monologues/456"
)

# Send rejection email
send_submission_notification(
    user_email="actor@example.com",
    user_name="John",
    status="rejected",
    monologue_title="Modern Monologue",
    rejection_reason="copyright",
    rejection_details="This work is protected by copyright"
)
```

**Note:** If `RESEND_API_KEY` is not set, emails are disabled but API still works (returns mock response).

---

## Testing

### Make a User a Moderator

```sql
UPDATE users
SET is_moderator = TRUE,
    can_approve_submissions = TRUE
WHERE email = 'admin@actorrise.com';
```

### Test Submission Flow

1. **Submit a monologue:**
```bash
curl -X POST https://api.actorrise.com/api/monologues/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Monologue",
    "character_name": "Hamlet",
    "text": "To be or not to be, that is the question...",
    "play_title": "Hamlet",
    "author": "William Shakespeare"
  }'
```

2. **Check moderation queue (as moderator):**
```bash
curl https://api.actorrise.com/api/admin/moderation/queue?status=manual_review \
  -H "Authorization: Bearer $MODERATOR_TOKEN"
```

3. **Approve submission:**
```bash
curl -X POST https://api.actorrise.com/api/admin/moderation/123/approve \
  -H "Authorization: Bearer $MODERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Great submission!"}'
```

### Test Email Templates Locally

```python
from app.services.email.templates import EmailTemplates

templates = EmailTemplates()
html = templates.render_submission_approved(
    user_name="John",
    monologue_title="Test Monologue",
    monologue_url="https://actorrise.com/monologues/1"
)
print(html)
```

---

## Security & Permissions

### Role-Based Access Control

- **Regular Users:** Can submit monologues, view their own submissions
- **Moderators:** Can view moderation queue, see all submissions
- **Approvers:** Can approve/reject submissions (subset of moderators)

### Permission Checks

```python
# Require moderator
@router.get("/queue")
async def get_queue(
    current_user: User = Depends(require_moderator)
):
    ...

# Require approval permission
@router.post("/{id}/approve")
async def approve(
    current_user: User = Depends(require_approval_permission)
):
    ...
```

---

## Decision Logic

### Auto-Approve Criteria
All must be true:
- Quality score ≥ 0.7
- Copyright risk = 'low'
- No critical flags (spam, too_short, too_long)
- Word count 30-1000

### Auto-Reject Criteria
Any one triggers:
- Quality score < 0.3
- Spam detected
- Duplicate found
- Copyright risk = 'high' with auto_reject flag

### Manual Review
Everything else (medium quality, medium copyright risk)

---

## Cost Optimization

### AI Usage
- Single AI analysis per submission (cached in DB)
- No repeated API calls for same submission
- Efficient deduplication (text comparison before AI)

### Email Credits
- Resend pricing: $20/month for 50,000 emails
- Expected usage: ~100-500 emails/day
- Cost: ~$0.0004 per email

---

## Files Created/Modified

### New Files
1. `/backend/app/models/moderation.py` - Database models
2. `/backend/app/services/ai/copyright_detector.py` - Copyright detection
3. `/backend/app/services/ai/content_moderation.py` - AI moderation
4. `/backend/app/api/admin/__init__.py` - Admin package
5. `/backend/app/api/admin/moderation.py` - Admin endpoints
6. `/backend/app/services/email/__init__.py` - Email package
7. `/backend/app/services/email/resend_client.py` - Resend client
8. `/backend/app/services/email/templates.py` - Template renderer
9. `/backend/app/services/email/notifications.py` - Helper functions
10. `/backend/app/services/email/templates/*.html` - 4 email templates
11. `/backend/scripts/add_moderation_schema.py` - Migration script
12. `/backend/MODERATION_SYSTEM.md` - This documentation

### Modified Files
1. `/backend/app/models/__init__.py` - Import moderation models
2. `/backend/app/models/user.py` - Add moderation fields
3. `/backend/app/api/monologues.py` - Add submission endpoints
4. `/backend/app/main.py` - Register moderation router
5. `/backend/pyproject.toml` - Add resend + jinja2 dependencies

---

## Next Steps

### Immediate
1. Set `RESEND_API_KEY` in production environment
2. Verify Resend domain and sender email
3. Make initial users moderators via SQL
4. Test end-to-end submission workflow

### Future Enhancements
1. **Email Preferences:** Let users customize notification settings
2. **Appeal Process:** Allow users to dispute rejections
3. **Contributor Dashboard:** Show submission stats, acceptance rate
4. **Batch Operations:** Approve/reject multiple submissions at once
5. **AI Training:** Improve quality scoring with human feedback
6. **Webhook Integration:** Real-time notifications to Slack/Discord

---

## Troubleshooting

### Emails Not Sending
- Check `RESEND_API_KEY` is set
- Verify domain in Resend dashboard
- Check email logs in Resend dashboard
- Test with mock mode (no API key)

### Submissions Stuck in Pending
- Check database logs: `SELECT * FROM moderation_logs WHERE submission_id = X`
- Verify AI services are working (OpenAI API key)
- Check server logs for errors

### Permission Denied
- Verify user has `is_moderator` or `can_approve_submissions` flag
- Check JWT token is valid
- Test with `/api/auth/me` endpoint

---

## Summary

✅ **Phase 3 Complete: User Submissions + Moderation**

- **Database Schema:** 2 new tables + user moderation fields
- **AI Services:** Copyright detection + content moderation
- **API Endpoints:** 7 new endpoints (user + admin)
- **Email Notifications:** 4 professional HTML templates + Resend integration

**Total Implementation Time:** ~2-3 hours

**Ready for production deployment!**
