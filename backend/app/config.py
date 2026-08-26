import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    demo_mode: bool = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./medikiosk.db')

    # Gmail SMTP settings for QR report email delivery
    smtp_host: str = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    smtp_port: int = int(os.getenv('SMTP_PORT', '587'))
    smtp_user: str = os.getenv('SMTP_USER', '')   # Your Gmail address
    smtp_pass: str = os.getenv('SMTP_PASS', '')   # Gmail App Password (not your login password)
    smtp_from: str = os.getenv('SMTP_FROM', '')   # Display sender address (can be same as smtp_user)

    class Config:
        env_file = '.env'

settings = Settings()
