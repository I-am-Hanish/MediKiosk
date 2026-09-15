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

    SQLite URLs ('sqlite+aiosqlite://...') are returned unchanged.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


class Settings(BaseSettings):
    demo_mode: bool = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    database_url: str = _normalize_database_url(
        os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')
    )

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
