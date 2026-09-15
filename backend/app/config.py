import os
from pathlib import Path
from dotenv import load_dotenv, dotenv_values
from pydantic_settings import BaseSettings

# Locate backend directory and candidate env file paths
backend_dir = Path(__file__).resolve().parent.parent
root_dir = backend_dir.parent

env_paths = [
    backend_dir / ".env",
    backend_dir / ".env.example",
    root_dir / ".env",
    root_dir / ".env.example",
]

# Ensure environment variables are loaded directly into os.environ
env_loaded = False
active_env_file = None
for env_path in env_paths:
    if env_path.exists():
        # Load via dotenv_values directly to prevent any cwd or parser mismatch
        parsed_vals = dotenv_values(env_path)
        for k, v in parsed_vals.items():
            if v is not None:
                os.environ[k] = v
        # Also run load_dotenv
        load_dotenv(env_path, override=True)
        env_loaded = True
        active_env_file = env_path
        break

if not env_loaded:
    load_dotenv(override=True)


def _normalize_database_url(url: str) -> str:
    """
    Normalize the DATABASE_URL for SQLAlchemy async compatibility.

    Supabase and most cloud providers expose connection strings with the
    bare 'postgresql://' or 'postgres://' scheme. SQLAlchemy's async engine
    requires 'postgresql+asyncpg://' to select the correct DBAPI driver.

    Also strips outer bracket placeholders like ':[password]@' commonly copied
    from Supabase dashboard connection string templates.

    SQLite URLs ('sqlite+aiosqlite://...') are returned unchanged.
    """
    if not url:
        return url

    # Remove template brackets around password if present (e.g. :[my-password]@ -> :my-password@)
    if ":[" in url and "]@" in url:
        prefix, rest = url.split(":[", 1)
        pwd, suffix = rest.split("]@", 1)
        url = f"{prefix}:{pwd}@{suffix}"

    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# Normalize DATABASE_URL in os.environ so Pydantic BaseSettings reads the clean driver URL
if "DATABASE_URL" in os.environ:
    os.environ["DATABASE_URL"] = _normalize_database_url(os.environ["DATABASE_URL"])


def _infer_supabase_url(db_url: str) -> str:
    """Infer the Supabase project HTTPS URL from the database connection string if possible."""
    custom_url = os.getenv("SUPABASE_URL", "").strip()
    if custom_url:
        return custom_url.rstrip("/")

    # Detect project ref from pooler username: postgres.<project_ref>
    if "postgres." in db_url and "supabase.com" in db_url:
        try:
            user_part = db_url.split("://", 1)[1].split(":", 1)[0]
            if user_part.startswith("postgres."):
                project_ref = user_part.split("postgres.", 1)[1]
                return f"https://{project_ref}.supabase.co"
        except Exception:
            pass

    # Detect project ref from direct host: db.<project_ref>.supabase.co
    if "db." in db_url and ".supabase.co" in db_url:
        try:
            host_part = db_url.split("@", 1)[1].split(":", 1)[0].split("/", 1)[0]
            if host_part.startswith("db.") and host_part.endswith(".supabase.co"):
                project_ref = host_part[3:-12]
                return f"https://{project_ref}.supabase.co"
        except Exception:
            pass

    return ""


class Settings(BaseSettings):
    demo_mode: bool = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    database_url: str = _normalize_database_url(
        os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')
    )

    # Supabase Configuration (Storage & API)
    supabase_url: str = _infer_supabase_url(
        os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')
    )
    supabase_service_role_key: str = os.getenv(
        'SUPABASE_SERVICE_ROLE_KEY',
        os.getenv('SUPABASE_SERVICE_KEY', '')
    ).strip()
    supabase_storage_bucket: str = os.getenv('SUPABASE_STORAGE_BUCKET', 'medical-documents').strip()

    # SMTP Configuration (Gmail SMTP)
    smtp_server: str = os.getenv('SMTP_SERVER', os.getenv('SMTP_HOST', 'smtp.gmail.com'))
    smtp_port: int = int(os.getenv('SMTP_PORT', '587'))
    smtp_username: str = os.getenv('SMTP_USERNAME', '')
    smtp_password: str = os.getenv('SMTP_PASSWORD', '')
    smtp_from_email: str = os.getenv('SMTP_FROM_EMAIL', '')

    # JWT Authentication Configuration
    jwt_secret_key: str = os.getenv(
        'JWT_SECRET_KEY',
        'medikiosk-production-super-secret-key-2026-jwt-secure-token-change-in-env'
    )
    jwt_algorithm: str = os.getenv('JWT_ALGORITHM', 'HS256')
    access_token_expire_minutes: int = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '1440'))

    class Config:
        extra = 'ignore'


settings = Settings()

