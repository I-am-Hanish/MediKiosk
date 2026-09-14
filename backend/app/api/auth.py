from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import Optional

from app.database import get_db
from app.database.models import User, Patient, Doctor
from app.core.security import hash_password, verify_password, create_access_token
from app.core.dependencies import get_current_user, AuthenticatedUser
from app.schemas.auth import (
    DoctorRegisterRequest,
    PatientAuthRegisterRequest,
    LoginRequest,
    TokenResponse
)

router = APIRouter()


@router.post("/doctor/register", status_code=status.HTTP_201_CREATED)
async def register_doctor(
    data: DoctorRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new doctor with unique Doctor ID and password.
    Creates both the Doctor clinical profile and the User authentication account.
    """
    clean_id = data.doctor_id.strip().upper()

    # Check for duplicate in User authentication table
    user_check = await db.execute(
        select(User).where(func.upper(User.username) == clean_id)
    )
    if user_check.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Doctor ID '{clean_id}' is already registered."
        )

    # Check for duplicate in Doctor profile table
    doctor_check = await db.execute(
        select(Doctor).where(func.upper(Doctor.id) == clean_id)
    )
    if doctor_check.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Doctor ID '{clean_id}' already exists."
        )

    # Securely hash password
    hashed = hash_password(data.password)

    # Create Doctor profile
    new_doc = Doctor(
        id=clean_id,
        name=data.name.strip() if data.name else f"Dr. {clean_id}",
        specialization=data.specialization.strip() if data.specialization else "General Practice",
        hospital_name=data.hospital_name.strip() if data.hospital_name else "MediKiosk Clinic"
    )
    db.add(new_doc)
    await db.flush()

    # Create User authentication record
    new_user = User(
        username=clean_id,
        password_hash=hashed,
        role="DOCTOR",
        doctor_id=clean_id
    )
    db.add(new_user)
    await db.commit()

    return {
        "status": "success",
        "message": f"Doctor '{clean_id}' registered successfully.",
        "doctor_id": clean_id,
        "role": "DOCTOR"
    }


@router.post("/patient/register", status_code=status.HTTP_201_CREATED)
async def register_patient_auth(
    data: PatientAuthRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Create a patient authentication account.
    Supports either:
      1. Linking an existing Patient ID (e.g. MK-2026-1001) with a new password.
      2. Registering a new patient record and user account simultaneously.
    """
    if not data.password or len(data.password.strip()) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    hashed = hash_password(data.password.strip())

    # ── Case 1: Account registration for an existing Patient ID ──
    if data.patient_id:
        clean_patient_id = data.patient_id.strip().upper()
        patient = await db.get(Patient, clean_patient_id)
        if not patient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Patient ID '{clean_patient_id}' does not exist. Please register as a patient first."
            )

        # Check if an account already exists for this patient
        existing_user = await db.execute(
            select(User).where(func.upper(User.username) == clean_patient_id)
        )
        if existing_user.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An account already exists for Patient ID '{clean_patient_id}'."
            )

        new_user = User(
            username=patient.id,
            password_hash=hashed,
            role="PATIENT",
            patient_id=patient.id
        )
        db.add(new_user)
        await db.commit()

        return {
            "status": "success",
            "message": "Patient account registered successfully.",
            "patient_id": patient.id,
            "role": "PATIENT"
        }

    # ── Case 2: Full patient registration + account creation ──
    if not data.name or data.age is None or not data.gender or not data.phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="When registering a new patient, 'name', 'age', 'gender', and 'phone' are required."
        )

    phone = data.phone.strip()
    # Check phone deduplication
    existing_phone = await db.execute(
        select(Patient).where(Patient.phone == phone)
    )
    existing_patient = existing_phone.scalars().first()

    if existing_patient:
        # Check if existing patient already has an account
        user_check = await db.execute(
            select(User).where(User.patient_id == existing_patient.id)
        )
        if user_check.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An account is already associated with this phone number (Patient ID: {existing_patient.id})."
            )

        # Create account for existing patient
        new_user = User(
            username=existing_patient.id,
            password_hash=hashed,
            role="PATIENT",
            patient_id=existing_patient.id
        )
        db.add(new_user)
        await db.commit()

        return {
            "status": "success",
            "message": "Existing patient record linked to new authentication account.",
            "patient_id": existing_patient.id,
            "role": "PATIENT"
        }

    # Generate next Patient ID
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

    # Create new patient record
    new_patient = Patient(
        id=candidate_id,
        name=data.name.strip(),
        age=data.age,
        gender=data.gender.strip(),
        phone=phone,
        email=data.email.strip() if data.email else None,
        allergies=data.allergies.strip() if data.allergies else "None",
        conditions=data.conditions.strip() if data.conditions else "None",
        summary="No consultation history available yet."
    )
    db.add(new_patient)
    await db.flush()

    # Create user account
    new_user = User(
        username=candidate_id,
        password_hash=hashed,
        role="PATIENT",
        patient_id=candidate_id
    )
    db.add(new_user)
    await db.commit()

    return {
        "status": "success",
        "message": "New patient registered and account created successfully.",
        "patient_id": candidate_id,
        "role": "PATIENT"
    }


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate a user (Patient or Doctor) using identifier + password.
    Returns a secure JWT access token with role and identity claims.
    """
    try:
        clean_identifier = data.get_identifier()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    # Locate user account case-insensitively
    result = await db.execute(
        select(User).where(func.upper(User.username) == clean_identifier)
    )
    user = result.scalars().first()

    # Never reveal whether username vs password was wrong
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your ID and password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Verify bcrypt hash
    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please verify your ID and password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Build token claims
    token_claims = {
        "sub": user.username,
        "user_id": user.id,
        "role": user.role,
        "patient_id": user.patient_id,
        "doctor_id": user.doctor_id
    }
    token = create_access_token(token_claims)

    return TokenResponse(
        status="success",
        token=token,
        token_type="bearer",
        role=user.role,
        user_identifier=user.username,
        patient_id=user.patient_id,
        doctor_id=user.doctor_id
    )


@router.get("/me")
async def get_current_user_info(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Validate active session token and return current user profile.
    Safe information only — never exposes password or hash.
    """
    info = current_user.to_dict()

    if current_user.is_patient() and current_user.patient_id:
        patient = await db.get(Patient, current_user.patient_id)
        if patient:
            info["patient"] = {
                "id": patient.id,
                "name": patient.name,
                "phone": patient.phone,
                "email": patient.email,
                "age": patient.age,
                "gender": patient.gender
            }
    elif current_user.is_doctor() and current_user.doctor_id:
        doctor = await db.get(Doctor, current_user.doctor_id)
        if doctor:
            info["doctor"] = {
                "id": doctor.id,
                "name": doctor.name,
                "specialization": doctor.specialization,
                "hospital_name": doctor.hospital_name
            }

    return {
        "status": "success",
        "user": info
    }
