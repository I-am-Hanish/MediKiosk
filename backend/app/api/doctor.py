from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def doctor_home():
    return {"message": "Doctor API is working"}
