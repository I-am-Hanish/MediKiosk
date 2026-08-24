import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    demo_mode: bool = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')
    class Config:
        env_file = '.env'

settings = Settings()
