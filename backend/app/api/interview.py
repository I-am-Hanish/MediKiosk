from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def interview_home():
    return {"message": "Interview API is working"}