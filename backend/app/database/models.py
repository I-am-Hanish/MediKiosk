from sqlalchemy import Column, String, Integer, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    email = Column(String, nullable=True)  # Optional — used for QR report email delivery
    allergies = Column(Text, default="None")
    conditions = Column(Text, default="None")
    summary = Column(Text, default="No consultation history available yet.")
    created_at = Column(DateTime, default=datetime.utcnow)

    consultations = relationship("Consultation", back_populates="patient", cascade="all, delete-orphan")
    documents = relationship("MedicalDocument", back_populates="patient", cascade="all, delete-orphan")
    user_account = relationship("User", back_populates="patient", uselist=False, cascade="all, delete-orphan")


class Consultation(Base):
    __tablename__ = "consultations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    date = Column(String, nullable=False)
    doctor_name = Column(String, nullable=False)
    specialization = Column(String, nullable=False)
    hospital_name = Column(String, nullable=False)
    symptoms = Column(Text, nullable=False)
    diagnosis = Column(Text, nullable=False)
    treatment = Column(Text, nullable=False)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="consultations")


class MedicalDocument(Base):
    __tablename__ = "medical_documents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False, index=True)
    document_type = Column(String, nullable=False)  # Prescription, Lab Report, Discharge Summary, Other
    document_date = Column(String, nullable=False)  # YYYY-MM-DD
    title = Column(String, default="")
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, default="")          # MIME type (e.g. application/pdf, image/png)
    file_size = Column(Integer, default=0)          # Size in bytes
    diagnosis = Column(Text, default="")
    medicines = Column(Text, default="")
    investigation_name = Column(String, default="")
    investigation_value = Column(String, default="")
    reference_range = Column(String, default="")
    range_status = Column(String, default="none")   # normal, high, low, out_of_range, none
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="documents")
 

class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(String, primary_key=True, index=True)  # Doctor ID (e.g. DOC-101)
    name = Column(String, nullable=True)
    specialization = Column(String, nullable=True, default="General Practice")
    hospital_name = Column(String, nullable=True, default="MediKiosk Clinic")
    created_at = Column(DateTime, default=datetime.utcnow)

    user_account = relationship("User", back_populates="doctor", uselist=False, cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, unique=True, index=True, nullable=False)  # Patient ID or Doctor ID
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # "PATIENT" or "DOCTOR"
    patient_id = Column(String, ForeignKey("patients.id"), nullable=True, index=True)
    doctor_id = Column(String, ForeignKey("doctors.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="user_account")
    doctor = relationship("Doctor", back_populates="user_account")

