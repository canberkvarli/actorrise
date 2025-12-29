from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.api import auth, profile, search

app = FastAPI(title="ActorRise API", version="1.0.0")

# CORS middleware
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

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    try:
        init_db()
        # Seed monologues if database is empty
        from app.services.seed_monologues import seed_monologues
        seed_monologues()
    except Exception as e:
        print(f"Warning: Database initialization failed: {e}")
        print("Application will continue to run, but some features may not work.")


@app.get("/")
def root():
    return {"message": "ActorRise API"}

