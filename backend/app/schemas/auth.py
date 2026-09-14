from pydantic import BaseModel, Field, field_validator
from typing import Optional


class DoctorRegisterRequest(BaseModel):
    doctor_id: str = Field(..., min_length=1, max_length=50, description="Unique Doctor ID (e.g. DOC-101)")
    password: str = Field(..., min_length=6, description="Doctor password (min 6 characters)")
    name: Optional[str] = None
    specialization: Optional[str] = None
    hospital_name: Optional[str] = None

    @field_validator("doctor_id")
    @classmethod
    def clean_doctor_id(cls, v: str) -> str:
        cleaned = (v or "").strip().upper()
        if not cleaned:
            raise ValueError("Doctor ID cannot be blank.")
        return cleaned


class PatientAuthRegisterRequest(BaseModel):
    # If linking an existing patient record:
    patient_id: Optional[str] = None

    # If registering a new patient simultaneously:
    name: Optional[str] = None
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    allergies: Optional[str] = "None"
    conditions: Optional[str] = "None"

    # Mandatory password:
    password: str = Field(..., min_length=6, description="Account password (min 6 characters)")

    @field_validator("patient_id")
    @classmethod
    def clean_patient_id(cls, v: Optional[str]) -> Optional[str]:
        if v:
            cleaned = v.strip().upper()
            return cleaned if cleaned else None
        return None


class LoginRequest(BaseModel):
    username: Optional[str] = None
    identifier: Optional[str] = None
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    password: str = Field(..., min_length=1, description="Account password")

    def get_identifier(self) -> str:
        ident = self.username or self.identifier or self.patient_id or self.doctor_id
        if not ident or not str(ident).strip():
            raise ValueError("A login identifier (Patient ID or Doctor ID) is required.")
        return str(ident).strip().upper()


class TokenResponse(BaseModel):
    status: str = "success"
    token: str
    token_type: str = "bearer"
    role: str
    user_identifier: str
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
