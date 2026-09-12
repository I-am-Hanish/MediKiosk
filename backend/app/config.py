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


class Settings(BaseSettings):
    demo_mode: bool = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')

    # SMTP Configuration (Gmail SMTP)
    smtp_server: str = os.getenv('SMTP_SERVER', os.getenv('SMTP_HOST', 'smtp.gmail.com'))
    smtp_port: int = int(os.getenv('SMTP_PORT', '587'))
    smtp_username: str = os.getenv('SMTP_USERNAME', '')
    smtp_password: str = os.getenv('SMTP_PASSWORD', '')
    smtp_from_email: str = os.getenv('SMTP_FROM_EMAIL', '')

    class Config:
        extra = 'ignore'


settings = Settings()




