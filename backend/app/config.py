import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')
    class Config:
        env_file = '.env'

settings = Settings()
