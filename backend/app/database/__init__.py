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
        from sqlalchemy import delete
        await conn.run_sync(Base.metadata.create_all)
        # Ensure demo seed records are purged from database
        demo_ids = ['MK-2026-1001', 'MK-2026-1002', 'MK-2026-1003', 'MK-2026-1004']
        await conn.execute(
            delete(models.Consultation).where(models.Consultation.patient_id.in_(demo_ids))
        )
        await conn.execute(
            delete(models.Patient).where(models.Patient.id.in_(demo_ids))
        )
    print("Database initialized & SQLite tables created.")

# Dependency to provide db sessions
async def get_db():
    async with async_session() as session:
        yield session