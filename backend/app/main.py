from contextlib import asynccontextmanager

from app.api.auth import router as auth_router
from app.api.audition import router as audition_router
from app.api.monologues import router as monologues_router
from app.api.pricing import router as pricing_router
from app.api.profile import router as profile_router
from app.api.scenes import router as scenes_router
from app.api.scripts import router as scripts_router
from app.api.subscriptions import router as subscriptions_router
from app.api.webhooks import router as webhooks_router
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


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
    yield


app = FastAPI(title="ActorRise API", version="1.0.0", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(monologues_router)
app.include_router(scenes_router)
app.include_router(scripts_router)
app.include_router(audition_router)
app.include_router(pricing_router)
app.include_router(subscriptions_router)
app.include_router(webhooks_router)


@app.get("/")
def root():
    return {"message": "ActorRise API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
