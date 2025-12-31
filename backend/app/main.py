from app.api.auth import router as auth_router
from app.api.profile import router as profile_router
from app.core.config import settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/")
def root():
    return {"message": "ActorRise API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
