"""
Admin moderation endpoints for reviewing user submissions.

Allows moderators to:
- View pending submissions
- Approve/reject submissions
- See moderation history
- Manage moderator permissions
"""

from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.actor import Monologue, Play
from app.models.moderation import MonologueSubmission, ModerationLog


router = APIRouter(prefix="/api/admin/moderation", tags=["admin", "moderation"])


# ========================================
# Dependencies
# ========================================

def require_moderator(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to ensure user is a moderator."""
    if not current_user.is_moderator:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have moderator permissions"
        )
    return current_user


def require_approval_permission(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to ensure user can approve submissions."""
    if not current_user.can_approve_submissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to approve submissions"
        )
    return current_user


# ========================================
# Pydantic Models
# ========================================

class SubmissionResponse(BaseModel):
    """Response model for submission details."""
    id: int
    user_id: int
    submitter_email: str
    submitter_name: Optional[str]

    # Submission data
    submitted_title: str
    submitted_text: str
    submitted_character: str
    submitted_play_title: str
    submitted_author: str
    user_notes: Optional[str]

    # Status
    status: str
    submitted_at: datetime
    processed_at: Optional[datetime]

    # AI moderation
    ai_quality_score: Optional[float]
    ai_copyright_risk: Optional[str]
    ai_flags: Optional[dict]
    ai_moderation_notes: Optional[str]

    # Manual review
    reviewer_id: Optional[int]
    reviewer_email: Optional[str]
    reviewer_notes: Optional[str]
    reviewed_at: Optional[datetime]

    # Rejection
    rejection_reason: Optional[str]
    rejection_details: Optional[str]

    class Config:
        from_attributes = True


class ApprovalRequest(BaseModel):
    """Request to approve a submission."""
    notes: Optional[str] = None


class RejectionRequest(BaseModel):
    """Request to reject a submission."""
    reason: str  # 'copyright', 'quality', 'duplicate', 'inappropriate'
    details: str


class UpdateSubmissionRequest(BaseModel):
    """Request to update submission content (admin edit before approve)."""
    submitted_title: Optional[str] = None
    submitted_text: Optional[str] = None
    submitted_character: Optional[str] = None
    submitted_play_title: Optional[str] = None
    submitted_author: Optional[str] = None
    user_notes: Optional[str] = None


class QueueStatsResponse(BaseModel):
    """Statistics about the moderation queue."""
    pending: int
    ai_review: int
    manual_review: int
    approved_today: int
    rejected_today: int


# ========================================
# Endpoints
# ========================================

@router.get("/queue", response_model=List[SubmissionResponse])
async def get_moderation_queue(
    status: Optional[str] = "manual_review",
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(require_moderator),
    db: Session = Depends(get_db)
):
    """
    Get submissions pending moderation.

    Args:
        status: Filter by status (default: 'manual_review')
        limit: Max results to return (default: 50)
        offset: Pagination offset (default: 0)

    Returns:
        List of pending submissions
    """
    query = db.query(MonologueSubmission)

    if status:
        query = query.filter(MonologueSubmission.status == status)

    submissions = query.order_by(
        desc(MonologueSubmission.submitted_at)
    ).limit(limit).offset(offset).all()

    # Build response with joined data
    results = []
    for sub in submissions:
        submitter = db.query(User).filter(User.id == sub.user_id).first()
        reviewer = db.query(User).filter(User.id == sub.reviewer_id).first() if sub.reviewer_id else None

        results.append({
            'id': sub.id,
            'user_id': sub.user_id,
            'submitter_email': submitter.email if submitter else 'Unknown',
            'submitter_name': submitter.name if submitter else None,
            'submitted_title': sub.submitted_title,
            'submitted_text': sub.submitted_text,
            'submitted_character': sub.submitted_character,
            'submitted_play_title': sub.submitted_play_title,
            'submitted_author': sub.submitted_author,
            'user_notes': sub.user_notes,
            'status': sub.status,
            'submitted_at': sub.submitted_at,
            'processed_at': sub.processed_at,
            'ai_quality_score': sub.ai_quality_score,
            'ai_copyright_risk': sub.ai_copyright_risk,
            'ai_flags': sub.ai_flags,
            'ai_moderation_notes': sub.ai_moderation_notes,
            'reviewer_id': sub.reviewer_id,
            'reviewer_email': reviewer.email if reviewer else None,
            'reviewer_notes': sub.reviewer_notes,
            'reviewed_at': sub.reviewed_at,
            'rejection_reason': sub.rejection_reason,
            'rejection_details': sub.rejection_details
        })

    return results


EDITABLE_STATUSES = ('pending', 'ai_review', 'manual_review')


@router.patch("/{submission_id}")
async def update_submission(
    submission_id: int,
    body: UpdateSubmissionRequest,
    current_user: User = Depends(require_moderator),
    db: Session = Depends(get_db)
):
    """
    Update submission content (title, text, character, play, author, notes).
    Only allowed when status is pending, ai_review, or manual_review.
    """
    submission = db.query(MonologueSubmission).filter(
        MonologueSubmission.id == submission_id
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit submission with status '{submission.status}'. Only pending, ai_review, or manual_review can be edited."
        )

    if body.submitted_title is not None:
        submission.submitted_title = body.submitted_title
    if body.submitted_text is not None:
        submission.submitted_text = body.submitted_text
    if body.submitted_character is not None:
        submission.submitted_character = body.submitted_character
    if body.submitted_play_title is not None:
        submission.submitted_play_title = body.submitted_play_title
    if body.submitted_author is not None:
        submission.submitted_author = body.submitted_author
    if body.user_notes is not None:
        submission.user_notes = body.user_notes

    db.commit()
    db.refresh(submission)

    submitter = db.query(User).filter(User.id == submission.user_id).first()
    reviewer = db.query(User).filter(User.id == submission.reviewer_id).first() if submission.reviewer_id else None

    return {
        'id': submission.id,
        'user_id': submission.user_id,
        'submitter_email': submitter.email if submitter else 'Unknown',
        'submitter_name': submitter.name if submitter else None,
        'submitted_title': submission.submitted_title,
        'submitted_text': submission.submitted_text,
        'submitted_character': submission.submitted_character,
        'submitted_play_title': submission.submitted_play_title,
        'submitted_author': submission.submitted_author,
        'user_notes': submission.user_notes,
        'status': submission.status,
        'submitted_at': submission.submitted_at,
        'processed_at': submission.processed_at,
        'ai_quality_score': submission.ai_quality_score,
        'ai_copyright_risk': submission.ai_copyright_risk,
        'ai_flags': submission.ai_flags,
        'ai_moderation_notes': submission.ai_moderation_notes,
        'reviewer_id': submission.reviewer_id,
        'reviewer_email': reviewer.email if reviewer else None,
        'reviewer_notes': submission.reviewer_notes,
        'reviewed_at': submission.reviewed_at,
        'rejection_reason': submission.rejection_reason,
        'rejection_details': submission.rejection_details
    }


@router.get("/queue/stats", response_model=QueueStatsResponse)
async def get_queue_stats(
    current_user: User = Depends(require_moderator),
    db: Session = Depends(get_db)
):
    """Get statistics about the moderation queue."""
    from datetime import datetime, timedelta

    today = datetime.utcnow().date()

    pending = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == 'pending'
    ).count()

    ai_review = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == 'ai_review'
    ).count()

    manual_review = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == 'manual_review'
    ).count()

    approved_today = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == 'approved',
        MonologueSubmission.processed_at >= today
    ).count()

    rejected_today = db.query(MonologueSubmission).filter(
        MonologueSubmission.status == 'rejected',
        MonologueSubmission.processed_at >= today
    ).count()

    return {
        'pending': pending,
        'ai_review': ai_review,
        'manual_review': manual_review,
        'approved_today': approved_today,
        'rejected_today': rejected_today
    }


@router.post("/{submission_id}/approve")
async def approve_submission(
    submission_id: int,
    request: ApprovalRequest,
    current_user: User = Depends(require_approval_permission),
    db: Session = Depends(get_db)
):
    """
    Approve a submission and create the monologue.

    Creates:
    1. Play record (if doesn't exist)
    2. Monologue record
    3. Moderation log entry
    4. Email notification (TODO: implement in Phase 4)
    """
    # Get submission
    # Lock the submission row so it can't be edited concurrently while approving.
    submission = (
        db.query(MonologueSubmission)
        .filter(MonologueSubmission.id == submission_id)
        .with_for_update()
        .first()
    )

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.status == 'approved':
        raise HTTPException(status_code=400, detail="Submission already approved")

    if submission.status == 'rejected':
        raise HTTPException(status_code=400, detail="Cannot approve rejected submission")

    try:
        previous_status = submission.status

        # 1. Get or create play
        play = db.query(Play).filter(
            Play.title == submission.submitted_play_title,
            Play.author == submission.submitted_author
        ).first()

        if not play:
            play = Play(
                title=submission.submitted_play_title,
                author=submission.submitted_author,
                year_written=None,
                genre='User Submitted',
                category='contemporary',
                copyright_status='user_uploaded',
                license_type='user_content',
                source_url=None,
                full_text=None,
                text_format='plain'
            )
            db.add(play)
            db.flush()  # Get play.id

        # 2. Create monologue
        from app.services.ai.content_analyzer import ContentAnalyzer

        analyzer = ContentAnalyzer()
        analysis = analyzer.analyze_monologue(
            text=submission.submitted_text,
            character=submission.submitted_character,
            play_title=submission.submitted_play_title,
            author=submission.submitted_author
        )

        # Generate embedding
        embedding = analyzer.generate_embedding(
            f"{submission.submitted_character} from {submission.submitted_play_title}: {submission.submitted_text[:500]}"
        )

        # Calculate metrics
        word_count = len(submission.submitted_text.split())
        duration_seconds = int((word_count / 150) * 60)

        # Generate search tags
        from scripts.backfill_search_tags import extract_enhanced_tags

        monologue = Monologue(
            play_id=play.id,
            title=submission.submitted_title,
            character_name=submission.submitted_character,
            text=submission.submitted_text,
            character_gender=analysis.get('character_gender'),
            character_age_range=analysis.get('character_age_range'),
            primary_emotion=analysis.get('primary_emotion'),
            emotion_scores=analysis.get('emotion_scores', {}),
            themes=analysis.get('themes', []),
            tone=analysis.get('tone'),
            difficulty_level=analysis.get('difficulty_level'),
            scene_description=analysis.get('scene_description'),
            word_count=word_count,
            estimated_duration_seconds=duration_seconds,
            embedding_vector=embedding if embedding else None,
            overdone_score=0.0,
            is_verified=False,
            quality_score=submission.ai_quality_score or 0.5
        )

        db.add(monologue)
        db.flush()  # Get monologue.id

        # Generate and set search tags
        tags = extract_enhanced_tags(monologue, analyzer)
        monologue.search_tags = tags

        # 3. Update submission
        submission.status = 'approved'
        submission.monologue_id = monologue.id
        submission.reviewer_id = current_user.id
        submission.reviewer_notes = request.notes
        submission.reviewed_at = datetime.utcnow()
        submission.processed_at = datetime.utcnow()

        # 4. Create moderation log
        log = ModerationLog(
            submission_id=submission.id,
            action='manual_approve',
            actor_type='moderator',
            actor_id=current_user.id,
            previous_status=previous_status,
            new_status='approved',
            reason=request.notes,
            extra_data={'monologue_id': monologue.id}
        )
        db.add(log)

        db.commit()

        # TODO: Send approval email (Phase 4)

        return {
            'success': True,
            'message': 'Submission approved',
            'monologue_id': monologue.id,
            'submission_id': submission.id
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error approving submission: {str(e)}")


@router.post("/{submission_id}/reject")
async def reject_submission(
    submission_id: int,
    request: RejectionRequest,
    current_user: User = Depends(require_approval_permission),
    db: Session = Depends(get_db)
):
    """
    Reject a submission with reason.

    Creates:
    1. Moderation log entry
    2. Email notification (TODO: implement in Phase 4)
    """
    # Get submission
    submission = db.query(MonologueSubmission).filter(
        MonologueSubmission.id == submission_id
    ).first()

    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if submission.status == 'approved':
        raise HTTPException(status_code=400, detail="Cannot reject approved submission")

    if submission.status == 'rejected':
        raise HTTPException(status_code=400, detail="Submission already rejected")

    try:
        previous_status = submission.status

        # Update submission
        submission.status = 'rejected'
        submission.rejection_reason = request.reason
        submission.rejection_details = request.details
        submission.reviewer_id = current_user.id
        submission.reviewed_at = datetime.utcnow()
        submission.processed_at = datetime.utcnow()

        # Create moderation log
        log = ModerationLog(
            submission_id=submission.id,
            action='manual_reject',
            actor_type='moderator',
            actor_id=current_user.id,
            previous_status=previous_status,
            new_status='rejected',
            reason=f"{request.reason}: {request.details}",
            extra_data={
                'rejection_reason': request.reason,
                'rejection_details': request.details
            }
        )
        db.add(log)

        db.commit()

        # TODO: Send rejection email (Phase 4)

        return {
            'success': True,
            'message': 'Submission rejected',
            'submission_id': submission.id
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error rejecting submission: {str(e)}")


@router.get("/{submission_id}/logs")
async def get_submission_logs(
    submission_id: int,
    current_user: User = Depends(require_moderator),
    db: Session = Depends(get_db)
):
    """Get moderation history for a submission."""
    logs = db.query(ModerationLog).filter(
        ModerationLog.submission_id == submission_id
    ).order_by(ModerationLog.created_at).all()

    return [{
        'id': log.id,
        'action': log.action,
        'actor_type': log.actor_type,
        'actor_id': log.actor_id,
        'previous_status': log.previous_status,
        'new_status': log.new_status,
        'reason': log.reason,
        'metadata': log.extra_data,
        'created_at': log.created_at
    } for log in logs]
