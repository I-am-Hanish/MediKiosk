from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from typing import List, Optional
from app.database import get_db
from app.database.models import Patient, Consultation
from datetime import datetime
from app.services.email_service import send_report_email

router = APIRouter()

# Pydantic Schemas
class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1)
    age: int = Field(..., ge=0, le=130)
    gender: str = Field(..., min_length=1)
    phone: str = Field(..., pattern=r"^\d{10}$")
    email: Optional[str] = None          # Optional — used for QR report delivery
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
async def register_patient(
    patient_data: PatientCreate,
    db: AsyncSession = Depends(get_db)
):
    try:
        phone = patient_data.phone.strip()
        email = (patient_data.email or "").strip() or None

        # ============================================================
        # 1. CHECK IF PATIENT ALREADY EXISTS
        #    Phone is the primary identifier.
        #    Email is used as a secondary identifier.
        # ============================================================

        result = await db.execute(
            select(Patient).where(Patient.phone == phone)
        )
        existing_patient = result.scalars().first()

        if not existing_patient and email:
            result = await db.execute(
                select(Patient).where(Patient.email == email)
            )
            existing_patient = result.scalars().first()

        # ============================================================
        # 2. EXISTING PATIENT
        #    Keep the SAME patient ID and fetch ALL consultations.
        # ============================================================

        if existing_patient:
            result = await db.execute(
                select(Consultation)
                .where(Consultation.patient_id == existing_patient.id)
                .order_by(
                    Consultation.date.desc(),
                    Consultation.id.desc()
                )
            )
            consultations = result.scalars().all()

            # Use newly entered email if the patient didn't previously
            # have one.
            if email and not existing_patient.email:
                existing_patient.email = email
                await db.commit()
                await db.refresh(existing_patient)

            consultation_dicts = [
                {
                    "date": c.date,
                    "doctor_name": c.doctor_name,
                    "specialization": c.specialization,
                    "hospital_name": c.hospital_name,
                    "symptoms": c.symptoms,
                    "diagnosis": c.diagnosis,
                    "treatment": c.treatment,
                    "notes": c.notes,
                }
                for c in consultations
            ]

            patient_dict = {
                "id": existing_patient.id,
                "name": existing_patient.name,
                "age": existing_patient.age,
                "gender": existing_patient.gender,
                "phone": existing_patient.phone,
                "email": existing_patient.email,
                "allergies": existing_patient.allergies,
                "conditions": existing_patient.conditions,
                "summary": existing_patient.summary,
            }

            if existing_patient.email:
                try:
                    send_report_email(
                        patient_dict,
                        consultation_dicts
                    )
                    print(
                        f"EMAIL: existing patient history sent to "
                        f"{existing_patient.email}"
                    )
                except Exception as e:
                    print(f"Email sending failed: {e}")

            return {
                "status": "success",
                "existing_patient": True,
                "message": "Existing patient found. Complete consultation history sent.",
                "patient": patient_dict
            }

        # ============================================================
        # 3. NEW PATIENT
        #    Generate a completely new MediKiosk ID.
        # ============================================================

        result = await db.execute(select(Patient.id))
        all_ids = result.scalars().all()

        existing_ids_set = set()
        max_suffix = 1000

        for pid in all_ids:
            if not pid:
                continue

            pid_clean = pid.strip().upper()
            existing_ids_set.add(pid_clean)

            try:
                parts = pid_clean.split("-")

                if (
                    len(parts) >= 3
                    and parts[0] == "MK"
                    and parts[1] == "2026"
                ):
                    suffix_val = int(parts[2])

                    if suffix_val > max_suffix:
                        max_suffix = suffix_val

            except (ValueError, IndexError):
                continue

        candidate_suffix = max_suffix + 1
        candidate_id = f"MK-2026-{candidate_suffix}"

        while candidate_id.upper() in existing_ids_set:
            candidate_suffix += 1
            candidate_id = f"MK-2026-{candidate_suffix}"

        # ============================================================
        # 4. CREATE NEW PATIENT
        # ============================================================

        new_patient = Patient(
            id=candidate_id,
            name=patient_data.name.strip(),
            age=patient_data.age,
            gender=patient_data.gender.strip(),
            phone=phone,
            email=email,
            allergies=(
                patient_data.allergies.strip()
                if patient_data.allergies
                else "None"
            ),
            conditions=(
                patient_data.conditions.strip()
                if patient_data.conditions
                else "None"
            ),
            summary="No consultation history available yet."
        )

        db.add(new_patient)
        await db.commit()
        await db.refresh(new_patient)

        # ============================================================
        # 5. SEND EMAIL FOR NEW PATIENT
        # ============================================================

        if new_patient.email:
            try:
                send_report_email(
                    {
                        "id": new_patient.id,
                        "name": new_patient.name,
                        "age": new_patient.age,
                        "gender": new_patient.gender,
                        "phone": new_patient.phone,
                        "email": new_patient.email,
                        "allergies": new_patient.allergies,
                        "conditions": new_patient.conditions,
                        "summary": new_patient.summary,
                    },
                    []
                )

                print(
                    f"EMAIL: new patient report sent to "
                    f"{new_patient.email}"
                )

            except Exception as e:
                print(f"Email sending failed: {e}")

        return {
            "status": "success",
            "existing_patient": False,
            "message": "New patient registered successfully.",
            "patient": {
                "id": new_patient.id,
                "name": new_patient.name,
                "age": new_patient.age,
                "gender": new_patient.gender,
                "phone": new_patient.phone,
                "email": new_patient.email,
                "allergies": new_patient.allergies,
                "conditions": new_patient.conditions,
                "summary": new_patient.summary
            }
        }

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Patient registration conflict. Please try again."
        )

    except HTTPException:
        await db.rollback()
        raise

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Database error during registration: {str(e)}"
        )

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
        "email": patient.email,
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
            "email": patient.email,
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
@router.patch("/consultation/{consultation_id}")
async def update_consultation(consultation_id: int):
    raise HTTPException(
        status_code=403,
        detail="Prescription history is immutable. Previous prescriptions cannot be edited or overwritten. Please create a new prescription."
    )

