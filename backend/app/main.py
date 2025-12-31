from app.api import auth, profile, search
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
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(search.router)


@app.get("/")
def root():
    return {"message": "ActorRise API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
