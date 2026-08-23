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

# Serve Frontend Static Files
import os
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
frontend_dir = os.path.join(BASE_DIR, "frontend")

if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    print(f"Warning: Frontend directory not found at {frontend_dir}")