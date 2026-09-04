import os
from typing import List

from dotenv import load_dotenv

load_dotenv()


class Settings:
    database_url: str = os.getenv("DATABASE_URL", "")
    # "Tenant or user not found" from Supabase? Check: 1) Project not paused (Dashboard → Restore)
    # 2) Use the exact connection string from Supabase → Settings → Database → Connection string (Session pooler)
    # 3) Password in URL is the database password, not the anon key
    if not database_url or not database_url.startswith("postgresql"):
        raise ValueError("DATABASE_URL must be set to a PostgreSQL connection string")
    _jwt_secret_raw: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    cors_origins: List[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
    ]
    # When "development" or "local", feature limits (e.g. AI search) are not enforced.
    environment: str = os.getenv("ENVIRONMENT", "development").lower()

    # In production, require a non-default JWT secret (for when JWT verification is enabled).
    if environment == "production" and (
        not _jwt_secret_raw or _jwt_secret_raw.strip() == "your-secret-key-change-in-production"
    ):
        raise ValueError(
            "JWT_SECRET must be set to a non-default value in production. "
            "Set JWT_SECRET in your production environment."
        )
    jwt_secret: str = _jwt_secret_raw

    # Comma-separated emails that bypass tier/usage limits (e.g. canberk@actorrise.com).
    superuser_emails: str = os.getenv("SUPERUSER_EMAILS", "canberk@actorrise.com").strip()
    # App-store reviewers. They read unlimited monologues and never meet the wall.
    #
    # The demo account has three lifetime reads like anyone else, and Apple and
    # Google now share it. Three is not enough for two reviewers, and once spent
    # it is spent for good: the next reviewer signs in, sees nothing but the
    # paywall, and the review notes promising a normal reading experience become
    # a lie. That is a 2.1 "we were unable to review your app" rejection caused
    # entirely by a previous reviewer having done their job.
    #
    # Separate from superuser_emails on purpose. That list is staff and grants
    # far more than reads; this one should be exactly the review accounts, so it
    # can be handed to a store without handing over anything else.
    review_emails: str = os.getenv("REVIEW_EMAILS", "appreview@actorrise.com").strip()
    # Supabase Storage settings
    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_storage_bucket: str = os.getenv("SUPABASE_STORAGE_BUCKET", "headshots")

    # OpenAI (script parsing, scene partner, embeddings)
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")


settings = Settings()
