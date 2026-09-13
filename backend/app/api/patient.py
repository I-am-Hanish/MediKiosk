from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Response
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from app.database import get_db
from app.database.models import Patient, Consultation, MedicalDocument
from datetime import datetime
import re
import os
import base64
from app.services.email_service import send_patient_id_email, send_report_email, generate_qr_bytes, mask_email

router = APIRouter()

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOADS_DIR = os.path.join(BACKEND_DIR, "uploads", "documents")





# Pydantic Schemas
class PatientCreate(BaseModel):
    name: str = Field(..., min_length=1)
    age: int = Field(..., ge=0, le=130)
    gender: str = Field(..., min_length=1)
    phone: str = Field(..., pattern=r"^\d{10}$")
    email: Optional[str] = None          # Optional — used for QR report delivery
    allergies: Optional[str] = "None"
    conditions: Optional[str] = "None"

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                return None
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
                raise ValueError("Please provide a valid email address.")
        return v


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

class DocumentUploadRequest(BaseModel):
    document_type: str = Field(..., min_length=1)  # Prescription, Lab Report, Discharge Summary, Other
    document_date: str = Field(..., min_length=1)  # YYYY-MM-DD
    title: Optional[str] = ""
    file_name: str = Field(..., min_length=1)
    file_data: str = Field(..., min_length=1)      # Base64 data URI string (e.g. data:application/pdf;base64,...)
    file_type: Optional[str] = ""
    diagnosis: Optional[str] = ""
    medicines: Optional[str] = ""
    investigation_name: Optional[str] = ""
    investigation_value: Optional[str] = ""
    reference_range: Optional[str] = ""
    range_status: Optional[str] = "none"
    notes: Optional[str] = ""

def evaluate_lab_range(value_str: Optional[str], range_str: Optional[str]) -> str:
    """
    Safely evaluate if a numerical lab value is within, above, or below a reference range.
    Objective calculation only — does not diagnose or interpret clinical conditions.
    Returns: 'normal', 'high', 'low', 'out_of_range', or 'none'.
    """
    if not value_str or not range_str:
        return "none"

    val_clean = str(value_str).strip()
    range_clean = str(range_str).strip()

    # Find the primary numerical float in the value
    val_match = re.search(r"[-+]?\d+(?:\.\d+)?", val_clean)
    if not val_match:
        return "none"

    try:
        val = float(val_match.group(0))
    except (ValueError, TypeError):
        return "none"

    # Case 1: Min - Max interval (e.g. '70 - 100', '70-100', '70 to 100', '13.5 - 17.5')
    range_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)", range_clean, re.IGNORECASE)
    if range_match:
        try:
            low = float(range_match.group(1))
            high = float(range_match.group(2))
            if val < low:
                return "low"
            elif val > high:
                return "high"
            else:
                return "normal"
        except (ValueError, TypeError):
            pass

    # Case 2: Upper limit (e.g. '< 200', '<= 200', 'under 200', 'less than 200')
    max_match = re.search(r"(?:<|<=|less\s+than|under)\s*(\d+(?:\.\d+)?)", range_clean, re.IGNORECASE)
    if max_match:
        try:
            max_val = float(max_match.group(1))
            return "high" if val > max_val else "normal"
        except (ValueError, TypeError):
            pass

    # Case 3: Lower limit (e.g. '> 50', '>= 50', 'greater than 50', 'over 50')
    min_match = re.search(r"(?:>|>=|greater\s+than|over)\s*(\d+(?:\.\d+)?)", range_clean, re.IGNORECASE)
    if min_match:
        try:
            min_val = float(min_match.group(1))
            return "low" if val < min_val else "normal"
        except (ValueError, TypeError):
            pass

    return "none"


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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    try:
        phone = patient_data.phone.strip()
        email = (patient_data.email or "").strip() or None

        # ============================================================
        # 1. CHECK IF PATIENT ALREADY EXISTS
        # Phone number is the ONLY deduplication key.
        # Email is a contact field only — the same email address may
        # belong to multiple different patients (e.g. a shared family
        # inbox). Matching on email would incorrectly merge separate
        # people into one record.
        # ============================================================
        result = await db.execute(
            select(Patient).where(Patient.phone == phone)
        )
        existing_patient = result.scalars().first()

        # ============================================================
        # 2. EXISTING PATIENT
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

            # Only fill in the email if the patient has none on file.
            # Never overwrite an existing email — a returning patient
            # may have re-registered with a different address by mistake.
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

            # Non-blocking email dispatch in background (Patient ID & QR only)
            if existing_patient.email:
                print(f"[PATIENT API] Enqueuing email task for existing patient {existing_patient.id} to recipient: {mask_email(existing_patient.email)}", flush=True)
                background_tasks.add_task(
                    send_patient_id_email,
                    patient_dict
                )
            else:
                print(f"[PATIENT API] Existing patient {existing_patient.id} has NO email address on file. Skipping email dispatch.", flush=True)

            return {
                "status": "success",
                "existing_patient": True,
                "message": "Existing patient found. Digital Health ID & QR sent to email.",
                "patient": patient_dict
            }

        # ============================================================
        # 3. NEW PATIENT ID GENERATION (Fast & Unique)
        # ============================================================
        result = await db.execute(
            select(Patient.id).where(Patient.id.like("MK-2026-%"))
        )
        all_ids = result.scalars().all()

        max_suffix = 1000
        for pid in all_ids:
            if not pid:
                continue
            try:
                suffix_val = int(pid.strip().split("-")[-1])
                if suffix_val > max_suffix:
                    max_suffix = suffix_val
            except (ValueError, IndexError):
                continue

        candidate_id = f"MK-2026-{max_suffix + 1}"

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

        new_patient_dict = {
            "id": new_patient.id,
            "name": new_patient.name,
            "age": new_patient.age,
            "gender": new_patient.gender,
            "phone": new_patient.phone,
            "email": new_patient.email,
            "allergies": new_patient.allergies,
            "conditions": new_patient.conditions,
            "summary": new_patient.summary,
            "created_at": new_patient.created_at.isoformat() if new_patient.created_at else None
        }

        # ============================================================
        # 5. SEND EMAIL IN BACKGROUND (Non-blocking)
        # ============================================================
        if new_patient.email:
            print(f"[PATIENT API] Enqueuing email task for new patient {new_patient.id} to recipient: {mask_email(new_patient.email)}", flush=True)
            background_tasks.add_task(
                send_patient_id_email,
                new_patient_dict
            )
        else:
            print(f"[PATIENT API] New patient {new_patient.id} registered without email. Skipping email dispatch.", flush=True)

        return {
            "status": "success",
            "existing_patient": False,
            "message": "New patient registered successfully. Digital Health ID & QR sent to email.",
            "patient": new_patient_dict
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

@router.get("/{patient_id}/qr")
async def get_patient_qr(patient_id: str):
    """
    Generate and serve a PNG QR code containing ONLY the Patient ID.
    Enables 100% offline QR generation for MediKiosk terminals.
    """
    clean_id = (patient_id or "").strip().upper()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Invalid Patient ID.")

    try:
        png_bytes = generate_qr_bytes(clean_id)
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": f'inline; filename="qr_{clean_id}.png"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate QR code: {str(e)}")


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
        "summary": patient.summary,
        "created_at": patient.created_at.isoformat() if patient.created_at else None
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

    # Retrieve all medical documents for patient, ordered chronologically (newest first)
    result_docs = await db.execute(
        select(MedicalDocument)
        .where(MedicalDocument.patient_id == patient.id)
        .order_by(MedicalDocument.document_date.desc(), MedicalDocument.id.desc())
    )
    documents = result_docs.scalars().all()

    doc_history = []
    for d in documents:
        doc_history.append({
            "id": d.id,
            "patient_id": d.patient_id,
            "document_type": d.document_type,
            "document_date": d.document_date,
            "title": d.title,
            "file_name": d.file_name,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "diagnosis": d.diagnosis,
            "medicines": d.medicines,
            "investigation_name": d.investigation_name,
            "investigation_value": d.investigation_value,
            "reference_range": d.reference_range,
            "range_status": d.range_status,
            "notes": d.notes,
            "created_at": d.created_at.isoformat() if d.created_at else None
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
            "summary": dynamic_summary,
            "created_at": patient.created_at.isoformat() if patient.created_at else None
        },
        "consultations": history,
        "documents": doc_history
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


# ============================================================
# MEDICAL DOCUMENT UPLOAD & MANAGEMENT ENDPOINTS
# ============================================================

@router.post("/{patient_id}/document")
async def upload_patient_document(
    patient_id: str,
    data: DocumentUploadRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Upload and attach a medical document to the current Patient ID.
    Decodes the base64 file data, stores the file safely in uploads/documents,
    records clinical intelligence, and inserts the record into medical_documents.
    """
    clean_id = (patient_id or "").strip().upper()
    patient = await db.get(Patient, clean_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found. Invalid Patient ID.")

    # Determine range status for lab reports
    final_range_status = data.range_status or "none"
    if data.document_type == "Lab Report" and final_range_status in ("none", "", None):
        final_range_status = evaluate_lab_range(data.investigation_value, data.reference_range)

    # Process and save the file safely
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    raw_b64 = data.file_data
    mime_type = data.file_type or "application/octet-stream"

    # Extract MIME type and pure base64 string if data URL format
    if "," in raw_b64 and raw_b64.startswith("data:"):
        header, b64_content = raw_b64.split(",", 1)
        if ";" in header and ":" in header:
            mime_type = header.split(";")[0].replace("data:", "").strip()
    else:
        b64_content = raw_b64

    try:
        file_bytes = base64.b64decode(b64_content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid file encoding: {str(e)}")

    file_size = len(file_bytes)

    # Generate unique, safe filename
    clean_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", data.file_name.strip()) or "document.bin"
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_file_name = f"{clean_id}_{timestamp_str}_{clean_filename}"
    saved_file_path = os.path.join(UPLOADS_DIR, unique_file_name)

    try:
        with open(saved_file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write document file to disk: {str(e)}")

    # Create new database record
    new_doc = MedicalDocument(
        patient_id=clean_id,
        document_type=data.document_type.strip(),
        document_date=data.document_date.strip(),
        title=data.title.strip() if data.title else clean_filename,
        file_name=clean_filename,
        file_path=saved_file_path,
        file_type=mime_type,
        file_size=file_size,
        diagnosis=data.diagnosis.strip() if data.diagnosis else "",
        medicines=data.medicines.strip() if data.medicines else "",
        investigation_name=data.investigation_name.strip() if data.investigation_name else "",
        investigation_value=data.investigation_value.strip() if data.investigation_value else "",
        reference_range=data.reference_range.strip() if data.reference_range else "",
        range_status=final_range_status,
        notes=data.notes.strip() if data.notes else ""
    )

    db.add(new_doc)
    try:
        await db.commit()
        await db.refresh(new_doc)
    except Exception as e:
        await db.rollback()
        # Clean up saved file on rollback
        if os.path.exists(saved_file_path):
            try:
                os.remove(saved_file_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Database error while saving document: {str(e)}")

    return {
        "status": "success",
        "message": "Medical document saved successfully.",
        "document": {
            "id": new_doc.id,
            "patient_id": new_doc.patient_id,
            "document_type": new_doc.document_type,
            "document_date": new_doc.document_date,
            "title": new_doc.title,
            "file_name": new_doc.file_name,
            "file_type": new_doc.file_type,
            "file_size": new_doc.file_size,
            "diagnosis": new_doc.diagnosis,
            "medicines": new_doc.medicines,
            "investigation_name": new_doc.investigation_name,
            "investigation_value": new_doc.investigation_value,
            "reference_range": new_doc.reference_range,
            "range_status": new_doc.range_status,
            "notes": new_doc.notes,
            "created_at": new_doc.created_at.isoformat() if new_doc.created_at else None
        }
    }


@router.get("/{patient_id}/documents")
async def get_patient_documents(patient_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieve all medical documents belonging to the specified Patient ID.
    Strictly queries only the requested patient's documents for patient safety.
    """
    clean_id = (patient_id or "").strip().upper()
    patient = await db.get(Patient, clean_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    result = await db.execute(
        select(MedicalDocument)
        .where(MedicalDocument.patient_id == clean_id)
        .order_by(MedicalDocument.document_date.desc(), MedicalDocument.id.desc())
    )
    docs = result.scalars().all()

    return {
        "patient_id": clean_id,
        "documents": [
            {
                "id": d.id,
                "patient_id": d.patient_id,
                "document_type": d.document_type,
                "document_date": d.document_date,
                "title": d.title,
                "file_name": d.file_name,
                "file_type": d.file_type,
                "file_size": d.file_size,
                "diagnosis": d.diagnosis,
                "medicines": d.medicines,
                "investigation_name": d.investigation_name,
                "investigation_value": d.investigation_value,
                "reference_range": d.reference_range,
                "range_status": d.range_status,
                "notes": d.notes,
                "created_at": d.created_at.isoformat() if d.created_at else None
            }
            for d in docs
        ]
    }


@router.get("/document/{document_id}/file")
async def get_document_file(document_id: int, db: AsyncSession = Depends(get_db)):
    """
    Serve the original uploaded medical document file for viewing and verification.
    Sets inline Content-Disposition so browsers can open PDFs and images directly.
    """
    doc = await db.get(MedicalDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found on disk.")

    media_type = doc.file_type or "application/octet-stream"
    return FileResponse(
        path=doc.file_path,
        media_type=media_type,
        filename=doc.file_name,
        headers={
            "Content-Disposition": f'inline; filename="{doc.file_name}"',
            "Cache-Control": "private, max-age=3600"
        }
    )


