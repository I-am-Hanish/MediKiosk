from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional, List, Dict, Any
import jwt

from app.core.security import decode_access_token
from app.database import get_db
from app.database.models import User

# HTTP Bearer scheme for Swagger UI & header extraction
security_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    """
    Standardized authenticated user principal representing the verified caller.
    """
    def __init__(self, user: User):
        self.id: int = user.id
        self.username: str = user.username
        self.role: str = user.role.upper()  # "PATIENT" or "DOCTOR"
        self.patient_id: Optional[str] = user.patient_id
        self.doctor_id: Optional[str] = user.doctor_id
        self.user: User = user

    def is_patient(self) -> bool:
        return self.role == "PATIENT"

    def is_doctor(self) -> bool:
        return self.role == "DOCTOR"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id
        }


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
) -> AuthenticatedUser:
    """
    Validates the bearer token (from Authorization header or query parameter fallback),
    retrieves the active user account, and returns AuthenticatedUser.
    Raises 401 Unauthorized if missing, expired, or invalid.
    """
    token_str = None
    if credentials and credentials.credentials:
        token_str = credentials.credentials.strip()
    elif token and token.strip():
        token_str = token.strip()

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    try:
        payload = decode_access_token(token_str)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )

    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token claims.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or has been revoked.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return AuthenticatedUser(user)


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
) -> Optional[AuthenticatedUser]:
    """
    Optional authentication: returns AuthenticatedUser if valid token is provided, else None.
    Does not raise 401 if unauthenticated.
    """
    token_str = None
    if credentials and credentials.credentials:
        token_str = credentials.credentials.strip()
    elif token and token.strip():
        token_str = token.strip()

    if not token_str:
        return None
    try:
        return await get_current_user(credentials=credentials, token=token, db=db)
    except HTTPException:
        return None


def require_roles(allowed_roles: List[str]):
    """
    Factory for role-based authorization dependencies.
    """
    normalized_allowed = [r.upper() for r in allowed_roles]

    async def role_checker(
        current_user: AuthenticatedUser = Depends(get_current_user)
    ) -> AuthenticatedUser:
        if current_user.role not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: This action requires role {', '.join(allowed_roles)}. Current role: '{current_user.role}'."
            )
        return current_user

    return role_checker


# Role helper dependencies
require_authenticated_user = get_current_user
require_doctor = require_roles(["DOCTOR"])
require_patient = require_roles(["PATIENT"])
require_patient_or_doctor = require_roles(["PATIENT", "DOCTOR"])


def check_patient_access(current_user: AuthenticatedUser, target_patient_id: str) -> None:
    """
    Validates authorization to access a specific patient's medical records:
    - DOCTOR: Permitted to access patient records required for clinical care.
    - PATIENT: Permitted to access ONLY their own records.
    Raises 403 FORBIDDEN if the user lacks permission.
    """
    if current_user.is_doctor():
        return

    if current_user.is_patient():
        clean_target = (target_patient_id or "").strip().upper()
        user_pid = (current_user.patient_id or current_user.username or "").strip().upper()
        if clean_target and user_pid and clean_target == user_pid:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not have permission to access this patient's medical records."
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied: Insufficient permissions."
    )


async def require_patient_access(
    patient_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
) -> AuthenticatedUser:
    """
    FastAPI dependency for endpoints with a `{patient_id}` path or query parameter.
    Enforces that the caller is either a DOCTOR or the PATIENT matching `patient_id`.
    """
    check_patient_access(current_user, patient_id)
    return current_user

