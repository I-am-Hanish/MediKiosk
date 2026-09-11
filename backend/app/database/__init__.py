from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

DATABASE_URL = settings.database_url

# Create Async Engine for SQLite
engine = create_async_engine(DATABASE_URL, echo=True)

# Session factory for generating db sessions
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Declarative Base
Base = declarative_base()

async def init_db():
    async with engine.begin() as conn:
        # Import models inside function to prevent circular import issues
        from app.database import models
        from sqlalchemy import delete, text
        await conn.run_sync(Base.metadata.create_all)

        # Ensure email column exists on patients table in SQLite
        def migrate_schema(sync_conn):
            result = sync_conn.execute(text("PRAGMA table_info(patients)"))
            cols = [row[1] for row in result.fetchall()]
            if cols and "email" not in cols:
                sync_conn.execute(text("ALTER TABLE patients ADD COLUMN email VARCHAR DEFAULT NULL"))

        await conn.run_sync(migrate_schema)

    print("Database initialized & SQLite tables ready.")

# Dependency to provide db sessions
async def get_db():
    async with async_session() as session:
        yield session