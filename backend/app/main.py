import logging
from contextlib import asynccontextmanager

from app.api.account import router as account_router
from app.api.admin.film_tv import router as admin_film_tv_router
from app.api.admin.moderation import router as moderation_router
from app.api.admin.monologues import router as admin_monologues_router
from app.api.admin.stats import router as admin_stats_router
from app.api.admin.users import router as admin_users_router
from app.api.audition import router as audition_router
from app.api.auth import router as auth_router
from app.api.contact import router as contact_router
from app.api.feedback import router as feedback_router
from app.api.film_tv import router as film_tv_router
from app.api.monologues import router as monologues_router
from app.api.pricing import router as pricing_router
from app.api.profile import router as profile_router
from app.api.public import router as public_router
from app.api.scenes import router as scenes_router
from app.api.scripts import router as scripts_router
from app.api.subscriptions import router as subscriptions_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.seed import ensure_pricing_tiers
from app.models.feedback import ResultFeedback  # noqa: F401; register with Base for create_all
from app.models.moderation import (  # noqa: F401; register with Base for create_all
    ModerationLog, MonologueSubmission)
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_db()
    try:
        ensure_pricing_tiers()
    except Exception as e:
        logger.warning("Could not ensure pricing tiers (non-fatal): %s", e)
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
app.include_router(monologues_router)
app.include_router(film_tv_router)
app.include_router(scenes_router)
app.include_router(scripts_router)
app.include_router(audition_router)
app.include_router(public_router)
app.include_router(pricing_router)
app.include_router(subscriptions_router)
app.include_router(webhooks_router)
app.include_router(moderation_router)
app.include_router(admin_monologues_router)
app.include_router(admin_film_tv_router)
app.include_router(admin_stats_router)
app.include_router(admin_users_router)


@app.get("/")
def root():
    return {"message": "ActorRise API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
