import logging
from contextlib import asynccontextmanager

from app.api.account import router as account_router
from app.api.admin.feedback import router as admin_feedback_router
from app.api.admin.film_tv import router as admin_film_tv_router
from app.api.admin.monologues import router as admin_monologues_router
from app.api.admin.stats import router as admin_stats_router
from app.api.admin.emails import router as admin_emails_router
from app.api.admin.founding_actors import router as admin_founding_actors_router
from app.api.admin.searches import router as admin_searches_router
from app.api.admin.stripe_revenue import router as admin_stripe_revenue_router
from app.api.admin.sessions import router as admin_sessions_router
from app.api.admin.users import router as admin_users_router
from app.api.audition import router as audition_router
from app.api.community import router as community_router
from app.api.monologue_work import router as monologue_work_router
from app.api.auth import router as auth_router
from app.api.tapes import router as tapes_router
from app.api.contact import router as contact_router
from app.api.feedback import router as feedback_router
from app.api.film_tv import router as film_tv_router
from app.api.founding_actors import router as founding_actors_router
from app.api.monologues import router as monologues_router
from app.api.pricing import router as pricing_router
from app.api.profile import router as profile_router
from app.api.resume import router as resume_router
from app.api.public import router as public_router
from app.api.scenes import router as scenes_router
from app.api.speech import router as speech_router
from app.api.scripts import router as scripts_router
from app.api.subscriptions import router as subscriptions_router
from app.api.tracking import router as tracking_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.seed import ensure_pricing_tiers
from app.models.feedback import ResultFeedback  # noqa: F401; register with Base for create_all
from app.models.moderation import (  # noqa: F401; register with Base for create_all
    ModerationLog, MonologueSubmission)
from app.models.tape import UserTape  # noqa: F401; register with Base for create_all
from app.models.audition_usage import AuditionFeedbackUsage  # noqa: F401; register with Base for create_all
from app.models.app_setting import AppSetting  # noqa: F401; register with Base for create_all
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("uvicorn.error")


def _make_error_response(status_code: int, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail},
    )


def _init_db() -> None:
    """Connect to DB, enable pgvector, create tables. Safe to call multiple times."""
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(
            "Database unreachable at startup: %s. "
            "Check DATABASE_URL and network (e.g. internet/VPN). API will fail on DB requests.",
            e,
        )


def _warmup_search_cache_background():
    """Warm up search cache in background thread (non-blocking)."""
    import threading

    def warmup():
        try:
            from app.services.search.cache_manager import cache_manager, COMMON_WARMUP_QUERIES
            from app.services.ai.langchain.embeddings import generate_embedding

            if not cache_manager.redis_enabled:
                logger.debug("Redis not available, skipping search cache warmup")
                return

            logger.info("Starting search cache warmup (%d queries)...", len(COMMON_WARMUP_QUERIES))
            cache_manager.warmup_common_queries(
                COMMON_WARMUP_QUERIES,
                lambda q: generate_embedding(q, model="text-embedding-3-large", dimensions=1536)
            )
            logger.info("Search cache warmup complete")
        except Exception as e:
            logger.warning("Search cache warmup failed (non-fatal): %s", e)

    thread = threading.Thread(target=warmup, daemon=True)
    thread.start()


def _warmup_title_catalogue_background():
    """Preload the play-title catalogue used for named-title detection.

    Loading it costs ~250 ms. Left to fault in lazily, that lands on whichever
    actor happens to search first after a deploy or a cache expiry, so it is
    paid here instead, off the request path.
    """
    import threading

    def warmup():
        try:
            from app.core.database import SessionLocal
            from app.services.search.title_lookup import _load_catalogue

            db = SessionLocal()
            try:
                count = len(_load_catalogue(db))
                logger.info("Title catalogue warmed (%d titles)", count)
            finally:
                db.close()
        except Exception as e:
            logger.warning("Title catalogue warmup failed (non-fatal): %s", e)

    threading.Thread(target=warmup, daemon=True).start()


def _start_saved_piece_reminder_scheduler():
    """Hourly day-1 "you saved a piece" re-engagement (H-14: savers return 2.1x).

    An in-process daemon thread, on purpose: it reuses the API's own env and
    secrets (DATABASE_URL, RESEND_API_KEY), so there is no separate Render service
    to stand up and no dashboard step. Each saver is emailed at most once, claimed
    atomically in the DB (see services/email/saved_piece_reminder.py), so a
    redeploy or restart can never re-send. Production only; kill switch is
    SAVED_PIECE_REMINDER_ENABLED=false.
    """
    import os
    import threading
    import time

    if os.getenv("ENVIRONMENT", "").strip().lower() != "production":
        return
    if os.getenv("SAVED_PIECE_REMINDER_ENABLED", "true").strip().lower() == "false":
        logger.info("Saved-piece reminder scheduler disabled by env flag")
        return

    def loop():
        time.sleep(120)  # let the app settle after boot before the first run
        while True:
            try:
                from datetime import datetime, timezone

                from app.core.database import SessionLocal
                from app.services import app_settings
                from app.services.email.saved_piece_reminder import run_reminders

                # Runtime kill switch from the admin console (app_settings),
                # checked every run so a toggle takes effect within the hour with
                # no redeploy. Defaults to on. The env flag above is the hard kill.
                _db = SessionLocal()
                try:
                    enabled = app_settings.get_bool(
                        _db, app_settings.SAVED_PIECE_REMINDER_ENABLED, default=True
                    )
                finally:
                    _db.close()
                if not enabled:
                    time.sleep(max(60, 3600 - (time.time() % 3600)))
                    continue

                hour = datetime.now(timezone.utc).hour
                stats = run_reminders(send=True, active_hour=hour)
                if stats["eligible"]:
                    logger.info(
                        "saved_piece_reminder: eligible %s sent %s failed %s (hour %s UTC)",
                        stats["eligible"], stats["sent"], stats["failed"], hour,
                    )
            except Exception as e:  # noqa: BLE001
                logger.warning("saved_piece_reminder scheduler run failed (non-fatal): %s", e)
            # Wake at the top of the next hour so each save fires in its own hour.
            time.sleep(max(60, 3600 - (time.time() % 3600)))

    threading.Thread(target=loop, daemon=True).start()
    logger.info("Saved-piece reminder scheduler started (hourly)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    try:
        ensure_pricing_tiers()
    except Exception as e:
        logger.warning("Could not ensure pricing tiers (non-fatal): %s", e)
    # Warmup search cache in background (non-blocking)
    _warmup_search_cache_background()
    _warmup_title_catalogue_background()
    _start_saved_piece_reminder_scheduler()
    yield


app = FastAPI(title="ActorRise API", version="1.0.0", lifespan=lifespan)


@app.exception_handler(Exception)
def uncaught_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return consistent 500 JSON for uncaught exceptions. HTTPException uses FastAPI's handler."""
    logger.exception("Unhandled exception: %s", exc)
    return _make_error_response(
        500,
        "An internal error occurred. Please try again later.",
    )


class LogCORSOriginMiddleware(BaseHTTPMiddleware):
    """Log Origin on OPTIONS so we can see what the browser sends (for CORS debugging)."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            origin = request.headers.get("origin", "(none)")
            logger.info("CORS preflight Origin: %s", origin)
        return await call_next(request)


# Log OPTIONS origin first (runs last), then CORS
app.add_middleware(LogCORSOriginMiddleware)

# Configure CORS (OPTIONS preflight must succeed or browser blocks requests)
# allow_origins from env; regex covers *.vercel.app and actorrise.com
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https://([^/]+\.vercel\.app|(www\.)?actorrise\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(account_router)
app.include_router(auth_router)
app.include_router(contact_router)
app.include_router(feedback_router)
app.include_router(profile_router)
app.include_router(resume_router)
app.include_router(monologues_router)
app.include_router(film_tv_router)
app.include_router(scenes_router)
app.include_router(speech_router)
app.include_router(scripts_router)
app.include_router(audition_router)
app.include_router(monologue_work_router)
app.include_router(community_router)
app.include_router(tapes_router)
app.include_router(public_router)
app.include_router(pricing_router)
app.include_router(subscriptions_router)
app.include_router(tracking_router)
app.include_router(webhooks_router)
app.include_router(admin_monologues_router)
app.include_router(admin_film_tv_router)
app.include_router(admin_stats_router)
app.include_router(admin_users_router)
app.include_router(admin_feedback_router)
app.include_router(admin_emails_router)
app.include_router(admin_searches_router)
app.include_router(admin_stripe_revenue_router)
app.include_router(admin_sessions_router)
app.include_router(founding_actors_router)
app.include_router(admin_founding_actors_router)


@app.get("/")
def root():
    return {"message": "ActorRise API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
