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
