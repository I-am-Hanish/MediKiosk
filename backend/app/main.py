from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import patient, interview, doctor

app = FastAPI(title="MediKiosk Backend", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(
    patient.router,
    prefix="/api/patient",
    tags=["patient"]
)

app.include_router(
    interview.router,
    prefix="/api/interview",
    tags=["interview"]
)

app.include_router(
    doctor.router,
    prefix="/api/doctor",
    tags=["doctor"]
)

# Startup event to initialize DB
@app.on_event("startup")
async def startup():
    from app.database import init_db
    await init_db()

# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}