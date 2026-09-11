import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from backend directory or project root
backend_env = Path(__file__).resolve().parent.parent / ".env"
root_env = Path(__file__).resolve().parent.parent.parent / ".env"

if backend_env.exists():
    load_dotenv(backend_env)
elif root_env.exists():
    load_dotenv(root_env)
else:
    load_dotenv()

class Settings(BaseSettings):
    demo_mode: bool = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')
    resend_api_key: str = os.getenv('RESEND_API_KEY', '')

    class Config:
        env_file = '.env'
        extra = 'ignore'

settings = Settings()

