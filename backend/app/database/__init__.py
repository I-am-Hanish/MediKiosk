from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

DATABASE_URL = settings.database_url

# ─────────────────────────────────────────────────────────────────
# Dialect-aware async engine creation
# ─────────────────────────────────────────────────────────────────
_is_postgresql = DATABASE_URL.startswith("postgresql")
_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_postgresql:
    # Detect Supabase Transaction Pooler (port 6543).
    # The transaction pooler does not support PostgreSQL prepared statements,
    # so we must disable the asyncpg prepared statement cache.
    _using_transaction_pooler = ":6543/" in DATABASE_URL

    _connect_args: dict = {}
    if _using_transaction_pooler:
        _connect_args["prepared_statement_cache_size"] = 0

    engine = create_async_engine(
        DATABASE_URL,
        echo=True,
        pool_pre_ping=True,        # Detect and recover from dropped cloud connections
        pool_size=10,              # Number of persistent connections in the pool
        max_overflow=20,           # Extra connections beyond pool_size allowed under load
        pool_recycle=300,          # Recycle connections every 5 minutes (avoids idle timeouts)
        connect_args=_connect_args,
    )
else:
    # SQLite — single-file, no connection pooling required
    engine = create_async_engine(
        DATABASE_URL,
        echo=True,
        connect_args={"check_same_thread": False},
    )

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
        from sqlalchemy import text
        await conn.run_sync(Base.metadata.create_all)

        # SQLite-only: check for and add missing 'email' column on patients table.
        # This migration guard is only needed for SQLite because PostgreSQL always
        # creates tables fresh via Base.metadata.create_all with all columns.
        def migrate_schema(sync_conn):
            if sync_conn.dialect.name == "sqlite":
                result = sync_conn.execute(text("PRAGMA table_info(patients)"))
                cols = [row[1] for row in result.fetchall()]
                if cols and "email" not in cols:
                    sync_conn.execute(text("ALTER TABLE patients ADD COLUMN email VARCHAR DEFAULT NULL"))
                return

            # ─────────────────────────────────────────────────────────────
            # Production PostgreSQL (Supabase) Security & Storage Isolation
            # ─────────────────────────────────────────────────────────────
            if sync_conn.dialect.name == "postgresql":
                # 1. Enable Row-Level Security on all 5 application tables
                # In PostgreSQL, RLS with no policies enforces DEFAULT DENY on non-owner roles.
                # Table owner (postgres role used by FastAPI) bypasses RLS by default.
                for tbl in ["patients", "users", "doctors", "consultations", "medical_documents"]:
                    sync_conn.execute(text(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;"))

                # 2. Defense-in-depth: Revoke all privileges from public Data API roles
                # Ensures anonymous internet clients and Supabase Auth users cannot query
                # or alter patient clinical data through PostgREST / Supabase Data API.
                sync_conn.execute(text(
                    "REVOKE ALL ON TABLE patients, users, doctors, consultations, medical_documents "
                    "FROM anon, authenticated;"
                ))

                # 3. Ensure the private Supabase Storage bucket exists
                bucket_name = settings.supabase_storage_bucket or "medical-documents"
                try:
                    sync_conn.execute(text(f"""
                        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
                        VALUES ('{bucket_name}', '{bucket_name}', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
                        ON CONFLICT (id) DO UPDATE SET public = false;
                    """))
                except Exception as ex:
                    # Non-fatal if storage schema is not present in target database
                    pass

        await conn.run_sync(migrate_schema)

    dialect_label = "PostgreSQL" if _is_postgresql else "SQLite"
    print(f"Database initialized & {dialect_label} tables ready (Security & RLS configured).")


# Dependency to provide db sessions
async def get_db():
    async with async_session() as session:
        yield session