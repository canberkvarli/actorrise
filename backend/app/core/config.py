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
    jwt_secret: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    cors_origins: List[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
    ]
    # When "development" or "local", feature limits (e.g. AI search) are not enforced.
    environment: str = os.getenv("ENVIRONMENT", "development").lower()
    # Comma-separated emails that bypass tier/usage limits (e.g. canberkvarli@gmail.com).
    superuser_emails: str = os.getenv("SUPERUSER_EMAILS", "canberkvarli@gmail.com").strip()
    # Supabase Storage settings
    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_storage_bucket: str = os.getenv("SUPABASE_STORAGE_BUCKET", "headshots")


settings = Settings()
