"""
MediKiosk Phase 4 — Backend Role-Based Authorization Security Test Suite

Tests direct API endpoints for:
- Suite A: Patient accessing own data (200) vs another patient's data (403)
- Suite B: Patient restricted operations (search arbitrary, create consultation, access other's document)
- Suite C: Doctor clinical access (search, history, documents, create consultation)
- Suite D: Unauthenticated access (401 on all protected endpoints)
- Suite E: Query param token authorization for file streaming (?token=...)
- Suite F: Public kiosk endpoints (QR generation, registration)
"""

import sys
import os
import asyncio
import base64
from pathlib import Path

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import httpx
from app.main import app
from app.core.security import create_access_token


async def run_security_tests():
    print("\n" + "=" * 70)
    print("  MEDIKIOSK PHASE 4 — ROLE-BASED AUTHORIZATION TEST SUITE")
    print("=" * 70 + "\n")

    # Generate tokens for existing test entities in database
    doctor_token = create_access_token({
        "sub": "DOC-TEST-001",
        "role": "DOCTOR",
        "doctor_id": "DOC-TEST-001"
    })

    patient_1001_token = create_access_token({
        "sub": "MK-2026-1001",
        "role": "PATIENT",
        "patient_id": "MK-2026-1001"
    })

    doc_headers = {"Authorization": f"Bearer {doctor_token}"}
    p1001_headers = {"Authorization": f"Bearer {patient_1001_token}"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        passed = 0
        failed = 0

        async def check(test_name: str, condition: bool, details: str = ""):
            nonlocal passed, failed
            if condition:
                passed += 1
                print(f"  [PASS] {test_name}")
            else:
                failed += 1
                print(f"  [FAIL] {test_name} — {details}")

        # ============================================================
        # SUITE A: Patient Logged In — Access Own Data vs Another's
        # ============================================================
        print("\n--- SUITE A: Patient Own Data vs Another's Data ---")

        # 1. Access own history
        r = await client.get("/api/patient/MK-2026-1001/history", headers=p1001_headers)
        await check("Patient 1001 access own history -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 2. Access another patient's history
        r = await client.get("/api/patient/MK-2026-1002/history", headers=p1001_headers)
        await check("Patient 1001 access patient 1002 history -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # 3. Access own documents list
        r = await client.get("/api/patient/MK-2026-1001/documents", headers=p1001_headers)
        await check("Patient 1001 access own documents -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 4. Access another patient's documents list
        r = await client.get("/api/patient/MK-2026-1002/documents", headers=p1001_headers)
        await check("Patient 1001 access patient 1002 documents -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # 5. Access own document file (Doc 1 belongs to MK-2026-1001)
        r = await client.get("/api/patient/document/1/file", headers=p1001_headers)
        await check("Patient 1001 view own document file (Doc 1) -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 6. Access another patient's document file (Doc 2 belongs to MK-2026-1011)
        r = await client.get("/api/patient/document/2/file", headers=p1001_headers)
        await check("Patient 1001 view another's document file (Doc 2) -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # 7. Access own report
        r = await client.get("/report/MK-2026-1001", headers=p1001_headers)
        await check("Patient 1001 view own case report -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 8. Access another patient's report
        r = await client.get("/report/MK-2026-1002", headers=p1001_headers)
        await check("Patient 1001 view another's case report -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # ============================================================
        # SUITE B: Patient Restricted Operations
        # ============================================================
        print("\n--- SUITE B: Patient Restricted Operations ---")

        # 1. Search arbitrary / another patient ID
        r = await client.get("/api/patient/search?id=MK-2026-1002", headers=p1001_headers)
        await check("Patient searching another Patient ID -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # 2. Search nonexistent arbitrary ID
        r = await client.get("/api/patient/search?id=MK-9999-9999", headers=p1001_headers)
        await check("Patient searching nonexistent ID -> 403 Forbidden (no leak)", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # 3. Patient searching own ID -> Allowed
        r = await client.get("/api/patient/search?id=MK-2026-1001", headers=p1001_headers)
        await check("Patient searching own ID -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 4. Patient create consultation -> Denied
        r = await client.post("/api/patient/consultation", headers=p1001_headers, json={
            "patient_id": "MK-2026-1001",
            "date": "2026-09-14",
            "doctor_name": "Fake Doctor",
            "specialization": "General",
            "hospital_name": "Clinic",
            "symptoms": "Cough",
            "diagnosis": "Cold",
            "treatment": "Rest"
        })
        await check("Patient create clinical consultation -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # 5. Patient upload document to another patient -> Denied
        test_file_b64 = base64.b64encode(b"Dummy PDF content").decode("utf-8")
        r = await client.post("/api/patient/MK-2026-1002/document", headers=p1001_headers, json={
            "document_type": "Lab Report",
            "document_date": "2026-09-14",
            "file_name": "test.pdf",
            "file_data": f"data:application/pdf;base64,{test_file_b64}"
        })
        await check("Patient upload document to another patient -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}: {r.text}")

        # ============================================================
        # SUITE C: Doctor Logged In — Full Clinical Access
        # ============================================================
        print("\n--- SUITE C: Doctor Full Clinical Access ---")

        # 1. Doctor search patient
        r = await client.get("/api/patient/search?id=MK-2026-1001", headers=doc_headers)
        await check("Doctor search patient -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 2. Doctor search non-existent patient -> 404
        r = await client.get("/api/patient/search?id=MK-9999-9999", headers=doc_headers)
        await check("Doctor search non-existent patient -> 404 Not Found", r.status_code == 404, f"Got {r.status_code}")

        # 3. Doctor view patient history
        r = await client.get("/api/patient/MK-2026-1001/history", headers=doc_headers)
        await check("Doctor view patient history -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 4. Doctor view patient documents
        r = await client.get("/api/patient/MK-2026-1001/documents", headers=doc_headers)
        await check("Doctor view patient documents -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 5. Doctor retrieve document file
        r = await client.get("/api/patient/document/1/file", headers=doc_headers)
        await check("Doctor view document file (Doc 1) -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 6. Doctor create consultation
        r = await client.post("/api/patient/consultation", headers=doc_headers, json={
            "patient_id": "MK-2026-1001",
            "date": "2026-09-14",
            "doctor_name": "Dr. House",
            "specialization": "Diagnostic Medicine",
            "hospital_name": "Princeton-Plainsboro",
            "symptoms": "Persistent headache",
            "diagnosis": "Tension Headache",
            "treatment": "Hydration and rest",
            "notes": "Follow-up in 1 week if symptoms persist."
        })
        await check("Doctor create consultation -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 7. Doctor view report
        r = await client.get("/report/MK-2026-1001", headers=doc_headers)
        await check("Doctor view patient report -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # ============================================================
        # SUITE D: Unauthenticated Direct Access
        # ============================================================
        print("\n--- SUITE D: Unauthenticated Direct Access ---")

        # 1. Search without auth
        r = await client.get("/api/patient/search?id=MK-2026-1001")
        await check("Unauthenticated search -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # 2. History without auth
        r = await client.get("/api/patient/MK-2026-1001/history")
        await check("Unauthenticated history -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # 3. Documents list without auth
        r = await client.get("/api/patient/MK-2026-1001/documents")
        await check("Unauthenticated documents list -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # 4. Document file without auth
        r = await client.get("/api/patient/document/1/file")
        await check("Unauthenticated document file -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # 5. Create consultation without auth
        r = await client.post("/api/patient/consultation", json={
            "patient_id": "MK-2026-1001",
            "date": "2026-09-14",
            "doctor_name": "Dr. Unauthenticated",
            "specialization": "None",
            "hospital_name": "None",
            "symptoms": "None",
            "diagnosis": "None",
            "treatment": "None"
        })
        await check("Unauthenticated consultation creation -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # 6. Upload document without auth
        r = await client.post("/api/patient/MK-2026-1001/document", json={
            "document_type": "Lab Report",
            "document_date": "2026-09-14",
            "file_name": "test.pdf",
            "file_data": "data:application/pdf;base64,AAAA"
        })
        await check("Unauthenticated document upload -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # 7. Case report without auth
        r = await client.get("/report/MK-2026-1001")
        await check("Unauthenticated case report -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # ============================================================
        # SUITE E: Query Parameter Token Authorization (?token=...)
        # ============================================================
        print("\n--- SUITE E: Query Parameter Token Authorization ---")

        # 1. Patient viewing own file via ?token=
        r = await client.get(f"/api/patient/document/1/file?token={patient_1001_token}")
        await check("Patient view own file via ?token= -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 2. Patient viewing another's file via ?token=
        r = await client.get(f"/api/patient/document/2/file?token={patient_1001_token}")
        await check("Patient view another's file via ?token= -> 403 Forbidden", r.status_code == 403, f"Got {r.status_code}")

        # 3. Doctor viewing file via ?token=
        r = await client.get(f"/api/patient/document/2/file?token={doctor_token}")
        await check("Doctor view file via ?token= -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        # 4. Invalid token in ?token=
        r = await client.get("/api/patient/document/1/file?token=invalid_tampered_token")
        await check("Invalid query token -> 401 Unauthorized", r.status_code == 401, f"Got {r.status_code}")

        # ============================================================
        # SUITE F: Public Kiosk & Preserved Endpoints
        # ============================================================
        print("\n--- SUITE F: Public Kiosk & Preserved Endpoints ---")

        # 1. QR code generation (contains Patient ID only)
        r = await client.get("/api/patient/MK-2026-1001/qr")
        await check("QR code generation -> 200 OK (image/png)", r.status_code == 200 and r.headers.get("content-type") == "image/png", f"Got {r.status_code}")

        # 2. Health check
        r = await client.get("/health")
        await check("Health check -> 200 OK", r.status_code == 200, f"Got {r.status_code}")

        print("\n" + "=" * 70)
        print(f"  TEST RESULTS: {passed} PASSED, {failed} FAILED (TOTAL: {passed + failed})")
        print("=" * 70 + "\n")

        if failed > 0:
            sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_security_tests())
