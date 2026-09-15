import os
import re
from datetime import datetime
from pathlib import Path
from typing import Tuple
import httpx
from fastapi import HTTPException
from app.config import settings

# Base directory for local fallback storage
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
LOCAL_UPLOADS_DIR = os.path.join(BACKEND_DIR, "uploads", "documents")


def is_supabase_storage_configured() -> bool:
    """Return True if both Supabase URL and service_role key are present."""
    return bool(settings.supabase_url and settings.supabase_service_role_key)


async def upload_medical_document(
    patient_id: str,
    file_name: str,
    file_bytes: bytes,
    mime_type: str = "application/octet-stream"
) -> str:
    """
    Upload a medical document binary to private cloud storage.
    If Supabase Storage is configured, saves to the private bucket and returns
    a URI in the format: supabase://<bucket>/<patient_id>/<filename>.
    Otherwise, gracefully falls back to local disk for development/SQLite compatibility.
    """
    clean_id = (patient_id or "").strip().upper()
    clean_filename = re.sub(r"[^a-zA-Z0-9_.-]", "_", file_name.strip()) or "document.bin"
    timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_file_name = f"{timestamp_str}_{clean_filename}"
    bucket_name = settings.supabase_storage_bucket or "medical-documents"

    # Cloud Storage path: <patient_id>/<timestamp>_<filename>
    object_path = f"{clean_id}/{unique_file_name}"

    if is_supabase_storage_configured():
        supabase_url = settings.supabase_url.rstrip("/")
        upload_url = f"{supabase_url}/storage/v1/object/{bucket_name}/{object_path}"
        headers = {
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key,
            "Content-Type": mime_type,
            "x-upsert": "true"
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(upload_url, content=file_bytes, headers=headers)
                if resp.status_code in (200, 201):
                    return f"supabase://{bucket_name}/{object_path}"
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Supabase Storage upload failed ({resp.status_code}): {resp.text}"
                    )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Network error while uploading to Supabase Storage: {str(e)}"
            )

    # ─────────────────────────────────────────────────────────────
    # Local disk fallback (development / SQLite mode)
    # ─────────────────────────────────────────────────────────────
    os.makedirs(LOCAL_UPLOADS_DIR, exist_ok=True)
    local_saved_name = f"{clean_id}_{unique_file_name}"
    local_path = os.path.join(LOCAL_UPLOADS_DIR, local_saved_name)

    try:
        with open(local_path, "wb") as f:
            f.write(file_bytes)
        return local_path
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write document file to disk: {str(e)}"
        )


async def download_medical_document(
    file_path: str,
    fallback_mime: str = "application/octet-stream"
) -> Tuple[bytes, str]:
    """
    Retrieve binary content for a medical document given its stored file_path.
    Supports both Supabase Storage URIs (supabase://...) and local disk paths.
    Returns: (file_bytes, detected_mime_type)
    """
    if file_path.startswith("supabase://"):
        if not is_supabase_storage_configured():
            raise HTTPException(
                status_code=500,
                detail="Document is stored in Supabase Storage, but SUPABASE_SERVICE_ROLE_KEY is not configured on this server."
            )

        # Parse supabase://<bucket>/<object_path>
        path_without_scheme = file_path[len("supabase://"):]
        if "/" not in path_without_scheme:
            raise HTTPException(status_code=400, detail="Invalid Supabase Storage URI format.")

        bucket, object_path = path_without_scheme.split("/", 1)
        supabase_url = settings.supabase_url.rstrip("/")
        download_url = f"{supabase_url}/storage/v1/object/authenticated/{bucket}/{object_path}"
        headers = {
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "apikey": settings.supabase_service_role_key
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(download_url, headers=headers)
                if resp.status_code == 200:
                    detected_mime = resp.headers.get("content-type") or fallback_mime
                    return resp.content, detected_mime
                elif resp.status_code == 404:
                    raise HTTPException(status_code=404, detail="Medical document object not found in Supabase Storage.")
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Supabase Storage download failed ({resp.status_code}): {resp.text}"
                    )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Network error while downloading from Supabase Storage: {str(e)}"
            )

    # ─────────────────────────────────────────────────────────────
    # Local filesystem file retrieval (legacy / SQLite mode)
    # ─────────────────────────────────────────────────────────────
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Medical document file not found on disk.")

    try:
        with open(file_path, "rb") as f:
            content = f.read()
        return content, fallback_mime
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read document from disk: {str(e)}")


async def delete_medical_document(file_path: str) -> None:
    """Delete document from storage (used during transaction rollback or cleanup)."""
    if not file_path:
        return

    if file_path.startswith("supabase://"):
        if not is_supabase_storage_configured():
            return
        path_without_scheme = file_path[len("supabase://"):]
        if "/" in path_without_scheme:
            bucket, object_path = path_without_scheme.split("/", 1)
            delete_url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{bucket}/{object_path}"
            headers = {
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key
            }
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.delete(delete_url, headers=headers)
            except Exception:
                pass
        return

    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass
