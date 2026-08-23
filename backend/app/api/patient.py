from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def patient_home():
    return {"message": "Patient API is working"}