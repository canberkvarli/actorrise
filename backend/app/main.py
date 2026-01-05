from app.api.auth import router as auth_router
from app.api.monologues import router as monologues_router
from app.api.pricing import router as pricing_router
from app.api.profile import router as profile_router
from app.api.subscriptions import router as subscriptions_router
from app.api.webhooks import router as webhooks_router
from app.core.config import settings
from app.core.database import Base, engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ActorRise API", version="1.0.0")

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
app.include_router(pricing_router)
app.include_router(subscriptions_router)
app.include_router(webhooks_router)


@app.get("/")
def root():
    return {"message": "ActorRise API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
