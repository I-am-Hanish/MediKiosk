from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from pydantic import BaseModel, Field
from typing import List, Optional
from app.database import get_db
from app.database.models import Patient, Consultation
from datetime import datetime

router = APIRouter()

# Pydantic Schemas
class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1)
    age: int = Field(..., ge=0, le=130)
    gender: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)
    allergies: Optional[str] = "None"
    conditions: Optional[str] = "None"

class ConsultationCreate(BaseModel):
    patient_id: str = Field(..., min_length=1)
    date: str = Field(..., min_length=1) # YYYY-MM-DD
    doctor_name: str = Field(..., min_length=1)
    specialization: str = Field(..., min_length=1)
    hospital_name: str = Field(..., min_length=1)
    symptoms: str = Field(..., min_length=1)
    diagnosis: str = Field(..., min_length=1)
    treatment: str = Field(..., min_length=1)
    notes: Optional[str] = ""

class ConsultationUpdate(BaseModel):
    date: str = Field(..., min_length=1) # YYYY-MM-DD
    doctor_name: str = Field(..., min_length=1)
    specialization: str = Field(..., min_length=1)
    hospital_name: str = Field(..., min_length=1)
    symptoms: str = Field(..., min_length=1)
    diagnosis: str = Field(..., min_length=1)
    treatment: str = Field(..., min_length=1)
    notes: Optional[str] = ""

def generate_smart_summary(consultations: List[Consultation]) -> str:
    if not consultations:
        return "No consultation history available yet."

    # Sort consultations by date desc, then created_at desc (latest first)
    sorted_consults = sorted(
        consultations,
        key=lambda x: (x.date, x.created_at or datetime.min),
        reverse=True
    )
    
    num_consults = len(sorted_consults)
    latest = sorted_consults[0]
    
    # Unique attending doctors
    unique_docs = []
    for c in sorted_consults:
        doc_str = f"{c.doctor_name} ({c.specialization})"
        if doc_str not in unique_docs:
            unique_docs.append(doc_str)
            
    prev_doctors_str = ", ".join(unique_docs[:3])

    return (
        f"Active summary: {num_consults} consultation(s) recorded. "
        f"Latest diagnosis: '{latest.diagnosis}' on {latest.date} by {latest.doctor_name}. "
        f"Primary treatment: '{latest.treatment}'. "
        f"Attending doctors: {prev_doctors_str}. "
        f"Reported symptoms include: {latest.symptoms}."
    )

@router.get("/")
async def patient_home():
    return {"message": "Patient API is working"}

@router.post("/register")
async def register_patient(patient_data: PatientCreate, db: AsyncSession = Depends(get_db)):
    try:
        # Determine unique Patient ID
        result = await db.execute(select(func.count(Patient.id)))
        count = result.scalar() or 0
        patient_id = f"MK-2026-{1001 + count}"
        
        # Guard against collisions by checking existence
        while True:
            existing = await db.get(Patient, patient_id)
            if not existing:
                break
            count += 1
            patient_id = f"MK-2026-{1001 + count}"

        new_patient = Patient(
            id=patient_id,
            name=patient_data.name.strip(),
            age=patient_data.age,
            gender=patient_data.gender.strip(),
            phone=patient_data.phone.strip(),
            allergies=patient_data.allergies.strip() if patient_data.allergies else "None",
            conditions=patient_data.conditions.strip() if patient_data.conditions else "None",
            summary="No consultation history available yet."
        )
        db.add(new_patient)
        await db.commit()
        await db.refresh(new_patient)
        
        return {
            "status": "success",
            "patient": {
                "id": new_patient.id,
                "name": new_patient.name,
                "age": new_patient.age,
                "gender": new_patient.gender,
                "phone": new_patient.phone,
                "allergies": new_patient.allergies,
                "conditions": new_patient.conditions,
                "summary": new_patient.summary
            }
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during registration: {str(e)}")

@router.get("/search")
async def search_patient(id: str = Query(...), db: AsyncSession = Depends(get_db)):
    search_val = id.strip()
    if not search_val:
        raise HTTPException(status_code=400, detail="Search term cannot be empty.")

    # Search by exact ID (case-insensitive)
    patient = await db.get(Patient, search_val.upper())
    
    if not patient:
        # Check by exact case-insensitive match query
        result = await db.execute(
            select(Patient).where(func.upper(Patient.id) == search_val.upper())
        )
        patient = result.scalars().first()

    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found. Please check the Patient ID.")

    return {
        "id": patient.id,
        "name": patient.name,
        "age": patient.age,
        "gender": patient.gender,
        "phone": patient.phone,
        "allergies": patient.allergies,
        "conditions": patient.conditions,
        "summary": patient.summary
    }

@router.get("/{patient_id}/history")
async def get_patient_history(patient_id: str, db: AsyncSession = Depends(get_db)):
    patient = await db.get(Patient, patient_id.strip().upper())
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    # Retrieve all consultations for patient, ordered chronologically (newest first)
    result = await db.execute(
        select(Consultation)
        .where(Consultation.patient_id == patient.id)
        .order_by(Consultation.date.desc(), Consultation.id.desc())
    )
    consultations = result.scalars().all()

    history = []
    for c in consultations:
        history.append({
            "id": c.id,
            "date": c.date,
            "doctor": f"{c.doctor_name} ({c.specialization})",
            "doctor_name": c.doctor_name,
            "specialization": c.specialization,
            "hospital_name": c.hospital_name,
            "symptoms": c.symptoms,
            "diagnosis": c.diagnosis,
            "treatment": c.treatment,
            "notes": c.notes
        })

    # Ensure dynamic summary is always up-to-date
    dynamic_summary = generate_smart_summary(consultations)

    return {
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "phone": patient.phone,
            "allergies": patient.allergies,
            "conditions": patient.conditions,
            "summary": dynamic_summary
        },
        "consultations": history
    }

@router.post("/consultation")
async def add_consultation(data: ConsultationCreate, db: AsyncSession = Depends(get_db)):
    patient = await db.get(Patient, data.patient_id.strip().upper())
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    new_consult = Consultation(
        patient_id=patient.id,
        date=data.date.strip(),
        doctor_name=data.doctor_name.strip(),
        specialization=data.specialization.strip(),
        hospital_name=data.hospital_name.strip(),
        symptoms=data.symptoms.strip(),
        diagnosis=data.diagnosis.strip(),
        treatment=data.treatment.strip(),
        notes=data.notes.strip() if data.notes else ""
    )
    db.add(new_consult)
    await db.flush()

    try:
        # Fetch all consultations to synthesize Smart Case Summary
        result = await db.execute(
            select(Consultation).where(Consultation.patient_id == patient.id)
        )
        all_consults = result.scalars().all()
        summary_text = generate_smart_summary(all_consults)

        patient.summary = summary_text
        await db.commit()
        
        return {
            "status": "success",
            "consultation_id": new_consult.id,
            "summary": summary_text
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during consultation save: {str(e)}")

@router.put("/consultation/{consultation_id}")
async def update_consultation(consultation_id: int, data: ConsultationUpdate, db: AsyncSession = Depends(get_db)):
    consultation = await db.get(Consultation, consultation_id)
    if not consultation:
        raise HTTPException(status_code=404, detail="Consultation not found.")

    patient = await db.get(Patient, consultation.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Associated patient not found.")

    # Update existing consultation fields in-place
    consultation.date = data.date.strip()
    consultation.doctor_name = data.doctor_name.strip()
    consultation.specialization = data.specialization.strip()
    consultation.hospital_name = data.hospital_name.strip()
    consultation.symptoms = data.symptoms.strip()
    consultation.diagnosis = data.diagnosis.strip()
    consultation.treatment = data.treatment.strip()
    consultation.notes = data.notes.strip() if data.notes else ""

    try:
        # Fetch all consultations to re-synthesize Smart Case Summary
        result = await db.execute(
            select(Consultation).where(Consultation.patient_id == patient.id)
        )
        all_consults = result.scalars().all()
        summary_text = generate_smart_summary(all_consults)

        patient.summary = summary_text
        await db.commit()

        return {
            "status": "success",
            "consultation_id": consultation.id,
            "summary": summary_text
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during consultation update: {str(e)}")